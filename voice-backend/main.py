import os
import uuid
import edge_tts
from fastapi import FastAPI, UploadFile, File
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

print("Loading Faster-Whisper Base Model (Auto-detect Language)...")
# Initialize the whisper model (base) optimized for CPU
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
print("Whisper model loaded!")

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
    # Bonus languages from voice-ai-app
    "hi":       "hi-IN-SwaraNeural",
    "hinglish": "en-IN-NeerjaNeural",
    "hi-en":    "en-IN-NeerjaNeural",
}

@app.get("/")
async def root():
    return {"status": "ok", "service": "Vogo Voice Backend", "endpoints": ["/api/tts", "/api/stt"]}

@app.post("/api/tts")
async def generate_tts(req: TTSRequest):
    """
    Generates TTS using edge-tts.
    Supports: en, ro, it, fr, de, es + hi, hinglish
    """
    output_filename = f"{uuid.uuid4()}.mp3"
    voice = VOICE_MAP.get(req.language, VOICE_MAP["en"])

    print(f"[TTS] lang={req.language} voice={voice} text={req.text[:60]}...")
    communicate = edge_tts.Communicate(req.text, voice)
    await communicate.save(output_filename)
    return FileResponse(
        output_filename,
        media_type="audio/mpeg",
        filename="output.mp3",
        background=None
    )


@app.post("/api/stt")
async def post_stt(audio: UploadFile = File(...)):
    """
    Accepts an audio file upload and returns Faster-Whisper transcription.
    Language is Auto-Detected. Supports all languages and formats.
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

        # Transcribe with Whisper - auto-detect language
        segments, info = whisper_model.transcribe(temp_file, beam_size=5)
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
