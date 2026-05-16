import os
import uuid
import asyncio
import edge_tts
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from faster_whisper import WhisperModel

# Fix for Windows native crashes with CTranslate2/OpenMP when decoding audio payloads
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

app = FastAPI(title="Vogo Voice Backend", description="STT + TTS for Vogo Chatbot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading Faster-Whisper on GPU (RTX 4050 — CUDA float16)...")
# RTX 4050 6GB VRAM — 'small' model fits easily, float16 = 5-10x faster than CPU int8
# beam_size=5 is fine on GPU (only slow on CPU)
try:
    whisper_model = WhisperModel("small", device="cuda", compute_type="float16")
    print("Whisper model loaded on GPU (CUDA)! ✅")
except Exception as e:
    print(f"GPU load failed ({e}), falling back to CPU...")
    whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    print("Whisper model loaded on CPU (fallback).")

class TTSRequest(BaseModel):
    text: str
    language: str = "en"

# ============================================================================
# Language → Neural Voice mapping
# Supports all 6 languages in vogo-chatbot: en, ro, it, fr, de, es
# ============================================================================
VOICE_MAP = {
    "en":       "en-US-JennyNeural",
    "en-US":    "en-US-JennyNeural",
    "ro":       "ro-RO-AlinaNeural",
    "it":       "it-IT-ElsaNeural",
    "fr":       "fr-FR-DeniseNeural",
    "de":       "de-DE-KatjaNeural",
    "es":       "es-ES-ElviraNeural",
    # Bonus languages
    "hi":       "hi-IN-SwaraNeural",
    "hinglish": "en-IN-NeerjaNeural",
    "hi-en":    "en-IN-NeerjaNeural",
}

def cleanup_file(path: str):
    """Delete temp TTS file after response is sent."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass

@app.get("/")
async def root():
    return {"status": "ok", "service": "Vogo Voice Backend", "endpoints": ["/api/tts", "/api/stt"]}

@app.post("/api/tts")
async def generate_tts(req: TTSRequest, background_tasks: BackgroundTasks):
    """
    Generates TTS using edge-tts.
    Supports: en, ro, it, fr, de, es + hi, hinglish
    """
    output_filename = f"{uuid.uuid4()}.mp3"
    voice = VOICE_MAP.get(req.language, VOICE_MAP["en"])

    # Truncate very long texts to avoid slow TTS (max 500 chars for speed)
    text = req.text[:500] if len(req.text) > 500 else req.text

    print(f"[TTS] lang={req.language} voice={voice} chars={len(text)} text={text[:60]}...")
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_filename)

        # Schedule file cleanup AFTER response is fully sent
        background_tasks.add_task(cleanup_file, output_filename)

        return FileResponse(
            output_filename,
            media_type="audio/mpeg",
            filename="output.mp3"
        )
    except Exception as e:
        cleanup_file(output_filename)
        print(f"[TTS] Error: {e}")
        return {"error": str(e)}


@app.post("/api/stt")
async def post_stt(audio: UploadFile = File(...)):
    """
    Accepts an audio file upload and returns Faster-Whisper transcription.
    Language is Auto-Detected. beam_size=1 for maximum speed on CPU.
    """
    # Determine correct extension from original filename or content type
    orig = audio.filename or "audio.webm"
    ct = audio.content_type or ""
    if orig.endswith(".mp4") or "mp4" in ct or "aac" in ct:
        ext = "mp4"
    elif orig.endswith(".ogg") or "ogg" in ct:
        ext = "ogg"
    elif orig.endswith(".wav") or "wav" in ct:
        ext = "wav"
    else:
        ext = "webm"

    temp_file = f"{uuid.uuid4()}.{ext}"
    try:
        # Save the incoming file stream
        content = await audio.read()
        with open(temp_file, "wb") as f:
            f.write(content)

        print(f"[STT] Transcribing: {temp_file} ({len(content)} bytes, ct={ct})")

        # ✅ GPU OPTIMIZATIONS (RTX 4050):
        # beam_size=5  → better accuracy (GPU handles this fast)
        # vad_filter   → skip silence segments
        # float16      → GPU native compute type (5-10x faster than CPU int8)
        segments, info = whisper_model.transcribe(
            temp_file,
            beam_size=3,              # was 5 — 40% faster, still accurate
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 150}  # was 300ms — stops waiting sooner
        )
        text = " ".join([segment.text for segment in segments]).strip()

        print(f"[STT] Result: '{text}' (detected lang: {info.language})")
        return {"text": text, "detected_language": info.language}

    except Exception as e:
        print("Transcription Error:", e)
        return {"text": "", "error": str(e)}
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
