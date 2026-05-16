# 🤖 Vogo Chatbot — Setup Guide

> Follow these steps to run the Vogo Chatbot on your own machine.  
> **Time needed: ~10 minutes**

---

## ✨ Key Features

- **🧠 Multi-Model AI Engine**: Seamlessly switch between top-tier LLMs (Groq, OpenAI, Gemini, Claude, Llama 3) with intelligent fallback routing.
- **🗣️ Advanced Voice Integration**: Built-in Speech-to-Text (Faster-Whisper) and Text-to-Speech (Edge-TTS) powered by a blazing-fast Python FastAPI backend.
- **🎯 Smart Intent Detection**: Powered by Rasa NLU to detect intents, filter out gibberish, and route conversations perfectly.
- **🔌 Vogo API Integration**: Connects directly to the Vogo WordPress REST API for live user authentication and data access.
- **📩 Multi-Channel Alerts**: Built-in Email & SMS service integrations to keep users notified.
- **🐳 Docker Ready**: 1-click deployment using Docker Compose (includes Node.js, Python, Rasa, and MySQL containers).

---

## ✅ What You Need (Install These First)

| Tool | Download | Why |
|------|----------|-----|
| **Node.js** v18+ | https://nodejs.org | Main chatbot server |
| **Python** v3.10+ | https://python.org/downloads | Voice AI server |

Check if installed — open terminal and type:
```bash
node -v
python --version
```

---

## ⚙️ STEP 1 — Create the `.env` File

Inside the project folder, create a file named **`.env`** and paste this:

```env
SERVER_PORT=3000

VOGO_API_BASE=https://vogo.me/wp-json
VOGO_USERNAME=your_vogo_username
VOGO_PASSWORD=your_vogo_password
ENABLE_API_CALLS=true

GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_TOKENS=300
GROQ_TEMPERATURE=0.3

OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash

AI_MODEL_GENERAL=ai_groq
AI_MODEL_VIP=ai_openai
AI_MODEL_ADMIN=ai_groq
AI_MODEL_BASIC=ai_basic

VOICE_BACKEND_URL=http://127.0.0.1:8000
SHOW_DETAILED_LOGS=true
```

> **Minimum required:** Only `GROQ_API_KEY` is needed. Get a free key at https://console.groq.com

---

## 🟢 STEP 2 — Start the Main Server (Node.js)

Open a terminal inside the project folder:

```bash
npm install
npm start
```

✅ Open browser → **http://localhost:3000**  
Click **"OPEN CHATBOT"** to start chatting!

---

## 🎤 STEP 3 — Start the Voice Server (Python) *(optional)*

Open a **second terminal**:

```bash
cd voice-backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Keep both terminals open while using the chatbot.

---

## 🐳 STEP 4 — Docker Deployment (Recommended for VPS/Server)

If you are running this on a VPS (like Hostinger, AWS, DigitalOcean) or want to run everything together via Docker, you can use Docker Compose.

Make sure you have **Docker** and **Docker Compose** installed.

1. Ensure your `.env.docker` file has all required variables (it uses `.env` as a base but with docker service names).
2. Open terminal in the project folder and run:

```bash
docker compose up --build -d
```

This will automatically build and start the:
- Chatbot Server (Node.js)
- Voice Backend (Python)
- Rasa NLU
- Local Ollama (if configured)
- MySQL Database

To view logs:
```bash
docker compose logs -f
```

---

## 🧪 Quick Test

| Action | Expected |
|--------|----------|
| Go to `http://localhost:3000` | Dashboard loads |
| Click **OPEN CHATBOT** | Chat widget opens |
| Type `hello` | Bot replies |
| Click 🎤 mic icon | Voice input starts |

---

## ❓ Common Issues

| Problem | Fix |
|---------|-----|
| `Cannot find module` | Run `npm install` again |
| Port already in use | Change `SERVER_PORT=3001` in `.env` |
| Voice not working | Make sure Python server is running (Step 3) |
| `pip` not found | Use `pip3` instead |
| Bot says "API error" | Check your `GROQ_API_KEY` in `.env` |

---

*Node.js + Express + Groq AI + Python FastAPI + Edge-TTS + Faster-Whisper + Docker*