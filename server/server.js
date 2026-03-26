// ============================================================================
// VOGO CHATBOT - MAIN SERVER (API-Powered Version)
// File: server/server.js
// Uses REST API (vogo.family) instead of local database
// GROQ LLM: Built-in (no separate groq_service.js file needed)
// - Handles any query NLP/regex/keyword can't answer
// - Responds in user's language, always in Vogo Family context
// - Set GROQ_API_KEY in .env - free key at console.groq.com
// SMART QA CACHE: Predefined QA cached 10 minutes, pre-warmed at startup
// ALL INTENTS: Shopping list, agenda, product search, greetings, fallback
// ============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// Hardcoded fallback in case .env is not loaded correctly
if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your-api-key-here') {
  process.env.GROQ_API_KEY = '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';
  process.env.GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data'); // for STT audio proxy to Python backend

// Import configuration
const CONSTANTS = require('../config/general_constant');
const VARIABLES = require('../config/general_variable');

// Import services
const nlpService = require('./nlp_service');
const groqService = require('./groq_service');
const aiService = require('./ai_service');
const vogoApi = require('./services/vogoApi');
const authSession = require('./auth_session');
const loggingService = require('./services/logging_service');

// ============================================================================
// IMAGE UPLOAD CONFIGURATION (Multer)
// ============================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'img-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// ============================================================================
// GROQ LLM - Inline, no separate file needed
// Handles anything NLP/regex/keywords can't confidently answer:
// - General questions ("what is vogo family?")
// - Small talk ("how are you?")
// - Ambiguous queries in any language
// Get a free API key at: https://console.groq.com
// ============================================================================
let groqRequestCount = 0;
let groqEnabled = false; // set in initializeServices after dotenv loads

// Intents that should ALWAYS go through Groq for a rich, natural response
// instead of relying on static NLP response strings
// Intents that need a Groq conversational response on the OFFLINE fallback path
// (when Groq primary was unavailable and regex/NLP handled the intent instead)
const GROQ_INTENTS = new Set([
  'help_capabilities', 'conversational', 'general_knowledge',
  'greeting', 'farewell', 'small_talk', 'how_are_you',
  'positive_feedback', 'negative_feedback',
  'fallback', 'groq_llm', 'groq_local'
]);

async function askGroq(userText, language, intent) {
  // Read at call-time so dotenv is guaranteed to have loaded
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  if (!GROQ_API_KEY) return null;

  const langNames = { en: 'English', ro: 'Romanian', it: 'Italian', fr: 'French', de: 'German', es: 'Spanish' };
  const langName = langNames[language] || 'English';

  const systemPrompt = `You are Vogo, the friendly AI assistant for Vogo Family - a platform that helps users discover local products and food, manage their shopping list, and organize their personal calendar.

YOUR CAPABILITIES (always mention these when asked):
 Shopping List - add, view, remove items (e.g. "Add milk to my list")
 Calendar/Agenda - add events, reminders, view schedule (e.g. "Remind me to call doctor tomorrow")
 Product Search - find food, products, services nearby (e.g. "Find pizza near me")

LANGUAGES YOU SPEAK FLUENTLY:
- English, Romanian (Română), Italian (Italiano), French (Français), German (Deutsch)

STRICT RULES:
1. ALWAYS respond in ${langName} - this is the user's language, NEVER switch languages
2. Keep responses SHORT and warm: 2-4 sentences maximum
3. Be friendly, helpful and conversational - like a knowledgeable friend
4. If asked what you can do / who you are -> describe the 3 features above clearly
5. If user seems hungry or wants food ideas -> suggest they search for something specific on Vogo Family
6. If user gives positive feedback -> respond warmly and offer further help
7. If user gives negative feedback -> apologize genuinely and ask them to rephrase
8. For greetings -> greet back warmly and ask how you can help with shopping, calendar, or product search
9. For farewells -> say goodbye warmly
10. For small talk / jokes -> be fun but redirect to how you can help with Vogo Family features
11. NEVER reveal you are built on Llama, Groq, GPT or any AI model - you are simply Vogo
12. NEVER make up product prices, availability, or specific store information
13. For shopping/calendar/search requests -> tell the user you're handling it (NLP already processes these)
14. For general knowledge questions (who is X, what is Y, history, science, food recommendations, sports, etc.) -> Give a SHORT, accurate answer (1-2 sentences max), then ALWAYS bridge it back to a Vogo Family feature naturally and warmly. Examples:
   - "Who is Obama?" -> "Barack Obama was the 44th U.S. President, known for his inspiring leadership. If you're planning a get-together to watch a documentary about him, I can help you add snacks and drinks to your shopping list! 🛒"
   - "Recommend a burger?" -> "Burgers are always a great choice! You can search for local burger places on Vogo Family — want me to look something up for you? 🍔"
   - "Give me food recommendations" -> "I love talking food! You can search Vogo Family to discover local products and meals near you. Want me to search for something specific?"
   - "What's the weather?" -> "I don't have live weather data, but if you're planning a picnic or outdoor trip, I can help you build a shopping list for it! ☀️"
15. The bridge to Vogo Family must feel NATURAL and HELPFUL, not forced. Connect the topic to shopping list, product search, or calendar in a way that makes sense for that specific topic.`;

  try {
    groqRequestCount++;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        max_tokens: 250,
        temperature: 0.7
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(` Groq API error ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error(' Groq fetch error:', err.message);
    return null;
  }
}

function getSmartFallback(language) {
  const msgs = {
    en: "I'm VOGO, your Vogo Family assistant! I can help you search for products, manage your shopping list, or organize your calendar. What would you like to do?",
    ro: "Sunt VOGO, asistentul tu Vogo Family! Te pot ajuta s caui produse, s gestionezi lista de cumprturi sau calendarul. Cu ce pot ajuta?",
    it: "Sono VOGO, il tuo assistente Vogo Family! Posso aiutarti a cercare prodotti, gestire la lista della spesa o il calendario. Come posso aiutarti?",
    fr: "Je suis VOGO, votre assistant Vogo Family! Je peux vous aider Ã  rechercher des produits, gÃ©rer votre liste de courses ou votre calendrier. Comment puis-je vous aider?",
    de: "Ich bin VOGO, Ihr Vogo Family Assistent! Ich kann Ihnen helfen, Produkte zu suchen, Ihre Einkaufsliste oder Ihren Kalender zu verwalten. Wie kann ich helfen?"
  };
  return msgs[language] || msgs['en'];
}

function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function extractUserIdFromToken(token) {
  const payload = decodeJwtPayload(token) || {};
  const userId = payload.user_id || payload.id || payload.sub || payload?.data?.user?.id || payload?.user?.id || null;
  return userId != null ? String(userId) : null;
}

// ============================================================================
// APPLICATION SETUP
// ============================================================================
const app = express();
const PORT = process.env.SERVER_PORT || CONSTANTS.DEFAULTS.SERVER_PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const conversationLogs = [];


// ============================================================================
// AUTH GUARD - Central authentication check for protected features
// Usage: if (requireAuth(userIp, result.intent, text, lang, res)) return;
// Returns true  = request was blocked (user needs to log in first)
// Returns false = user is authenticated, continue processing
// ============================================================================
function requireAuth(userIp, intent, text, lang, res) {
  if (authSession.isAuthenticated(userIp)) return false; // already logged in
  // Start the login flow and save what the user originally wanted to do
  authSession.startAuthFlow(userIp, intent, text, lang);
  // NOTE: This function is only called when we are confident the intent is correct.
  // Callers are responsible for checking entities before calling requireAuth.
  const msgs = {
    en: 'To use this feature you need to connect your Vogo Family account. Please enter your username (email):',
    ro: 'Pentru a folosi această funcție trebuie să îți conectezi contul Vogo Family. Introdu email-ul (utilizator):',
    it: 'Per usare questa funzione devi connettere il tuo account Vogo Family. Inserisci il nome utente (email):',
    fr: 'Pour utiliser cette fonctionnalité vous devez connecter votre compte Vogo Family. Entrez votre nom d utilisateur (email):',
    de: 'Um diese Funktion zu nutzen musst du dein Vogo Family-Konto verbinden. Gib deinen Benutzernamen (E-Mail) ein:'
  };
  const msg = msgs[lang] || msgs['en'];
  res.json({
    success: true,
    result: {
      intent: 'user_connect',
      confidence: 1.0,
      method: 'auth_guard',
      response: msg,
      detectedLanguage: lang
    },
    action: { awaitingUsername: true, message: msg, overrideResponse: true },
    entities: {}
  });
  return true; // blocked
}

// ============================================================================
// PENDING CONFIRMATION STORE
// Stores per-user pending actions that need a yes/no confirmation.
// Key: IP address | Value: { action, item, lang, expiresAt }
// ============================================================================
const pendingConfirmations = new Map();
const PENDING_TTL_MS = 2 * 60 * 1000; // 2 minutes
const THREAD_ROLE_HINT_MAX_PER_THREAD = 300;
const threadMessageRoleHints = new Map(); // threadId -> Map(messageId -> 'user' | 'operator')

const UNCLEAR_INTENT_LIMIT = 2;

function setPending(ip, data) {
  pendingConfirmations.set(ip, { ...data, expiresAt: Date.now() + PENDING_TTL_MS });
}
function getPending(ip) {
  const p = pendingConfirmations.get(ip);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { pendingConfirmations.delete(ip); return null; }
  return p;
}
function clearPending(ip) { pendingConfirmations.delete(ip); }

function getMsgId(msg) {
  return String(msg?.ID || msg?.id || msg?.comment_ID || '');
}

function rememberThreadMessageRole(threadId, messageId, role) {
  const tId = String(threadId || '');
  const mId = String(messageId || '');
  if (!tId || !mId || !role) return;

  let roleMap = threadMessageRoleHints.get(tId);
  if (!roleMap) {
    roleMap = new Map();
    threadMessageRoleHints.set(tId, roleMap);
  }
  roleMap.set(mId, role);

  if (roleMap.size > THREAD_ROLE_HINT_MAX_PER_THREAD) {
    const oldestKey = roleMap.keys().next().value;
    if (oldestKey) roleMap.delete(oldestKey);
  }
}

function getThreadMessageRole(threadId, messageId) {
  const tId = String(threadId || '');
  const mId = String(messageId || '');
  if (!tId || !mId) return null;
  const roleMap = threadMessageRoleHints.get(tId);
  return roleMap ? (roleMap.get(mId) || null) : null;
}

async function markLatestThreadMessageRole(userToken, threadId, messageText, role) {
  const tId = String(threadId || '');
  const text = String(messageText || '').trim();
  if (!userToken || !tId || !text || !role) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await vogoApi.getThreadAnswers(userToken, tId);
      if (result.success && Array.isArray(result.answers) && result.answers.length > 0) {
        const sorted = [...result.answers].sort((a, b) => Number(getMsgId(b)) - Number(getMsgId(a)));
        const matched = sorted.find(m => String(m.mesaj || m.comment_content || m.message || '').trim() === text);
        if (matched) {
          const mId = getMsgId(matched);
          if (mId) {
            rememberThreadMessageRole(tId, mId, role);
            return;
          }
        }
      }
    } catch (_) {
      // Ignore and retry
    }
    await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
  }
}

function scheduleThreadMessageRoleMark(userToken, threadId, messageText, role) {
  setTimeout(() => {
    markLatestThreadMessageRole(userToken, threadId, messageText, role)
      .catch(() => { });
  }, 0);
}

function updateUnclearCount(ip, isUnclear) {
  const session = authSession.getAuthSession(ip) || {};
  const nextCount = isUnclear ? ((session.unclearCount || 0) + 1) : 0;
  authSession.setAuthSession(ip, { unclearCount: nextCount });
  return nextCount;
}

// Periodically clean expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingConfirmations) {
    if (now > val.expiresAt) pendingConfirmations.delete(key);
  }
}, 60 * 1000);

// Check if user text is a positive confirmation (yes/ok/sure/add it/etc.)
function isPositiveConfirmation(text) {
  return /^\s*(yes|yeah|yep|sure|ok|okay|add|add it|go ahead|please|do it|confirm|affirmative|si|sì|oui|ja|da|da|bine|yup|absolutely|of course)\s*[!.]?\s*$/i.test(text.trim());
}
function isNegativeConfirmation(text) {
  return /^\s*(no|nope|nah|cancel|stop|nevermind|never mind|don't|dont|nein|non|nu)\s*[!.]?\s*$/i.test(text.trim());
}

// Check if item B is a more specific/different version of item A
// e.g. "milk" vs "milk for baby" → true (different, add directly)
function isMoreSpecificItem(existingName, newItemText) {
  const existing = existingName.toLowerCase().trim();
  const newItem = newItemText.toLowerCase().trim();
  // New item must start with or contain the existing name AND have extra words
  if (!newItem.includes(existing)) return false;
  const extraWords = newItem.replace(existing, '').trim();
  return extraWords.length > 1; // has meaningful extra context
}

// ============================================================================
// SMART QA CACHE
// Caches predefined QA results in memory for 10 minutes.
// Pre-warmed at startup for all 5 languages (sequential to avoid 429 errors).
// Stale-while-revalidate: serves cache instantly, refreshes silently in bg.
// ============================================================================
const qaCache = {
  store: {},
  TTL_MS: 10 * 60 * 1000,
  pending: new Set(),

  key(parentId, lang) {
    return `${parentId === null || parentId === undefined ? 'null' : parentId}:${lang || 'en'}`;
  },

  get(parentId, lang) {
    const entry = this.store[this.key(parentId, lang)];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.TTL_MS) return null;
    return entry.items;
  },

  set(parentId, lang, items) {
    this.store[this.key(parentId, lang)] = { items, fetchedAt: Date.now() };
  },

  ageMs(parentId, lang) {
    const entry = this.store[this.key(parentId, lang)];
    if (!entry) return -1;
    return Date.now() - entry.fetchedAt;
  },

  backgroundRefresh(parentId, lang) {
    const k = this.key(parentId, lang);
    if (this.pending.has(k)) return;
    this.pending.add(k);
    vogoApi.fetchPredefinedQA(parentId, lang)
      .then(live => {
        const list = Array.isArray(live) ? live : Array.isArray(live?.data) ? live.data : [];
        const normalized = list.map(q => ({ ...q, text: q.text || q.question || String(q) }));
        this.set(parentId, lang, normalized);
        console.log(` [CACHE] Refreshed QA parent=${parentId} lang=${lang} (${normalized.length} items)`);
      })
      .catch(err => {
        console.warn(` [CACHE] Background refresh failed: ${err.message}`);
      })
      .finally(() => {
        this.pending.delete(k);
      });
  }
};

async function preloadQACache() {
  const langs = ['en', 'ro', 'it', 'fr', 'de'];
  console.log(` [CACHE] Pre-loading QA for ${langs.length} languages (sequential)...`);

  // Login ONCE upfront so all subsequent calls reuse the cached token (avoids 429)
  try {
    await vogoApi.getToken();
    console.log(` [CACHE] Auth token ready`);
  } catch (err) {
    console.warn(` [CACHE] Pre-login failed: ${err.message} - will retry per language`);
  }

  for (let i = 0; i < langs.length; i++) {
    const lang = langs[i];
    if (i > 0) await new Promise(r => setTimeout(r, 1000));
    try {
      const live = await vogoApi.fetchPredefinedQA(null, lang);
      const list = Array.isArray(live) ? live : Array.isArray(live?.data) ? live.data : [];
      const normalized = list.map(q => ({ ...q, text: q.text || q.question || String(q) }));
      qaCache.set(null, lang, normalized);
      console.log(` [CACHE] Pre-loaded lang=${lang} (${normalized.length} items)`);
    } catch (err) {
      console.warn(` [CACHE] Pre-load failed lang=${lang}: ${err.message}`);
    }
  }
  console.log(` [CACHE] Pre-load complete`);
}

// ============================================================================
// INITIALIZATION
// ============================================================================
let isInitialized = false;

async function initializeServices() {
  if (isInitialized) return true;

  console.log('\n' + '='.repeat(70));
  console.log(' VOGO CHATBOT - API-POWERED VERSION');
  console.log('='.repeat(70));

  try {
    // Step 1: API Connection
    console.log('\n Step 1/3: Testing API Connection...');
    console.log(` API Base: ${process.env.VOGO_API_BASE || 'https://vogo.family/wp-json'}`);
    try {
      await vogoApi.getToken();
      console.log(' API Connection successful');
      VARIABLES.runtimeState.dbConnected = true;
    } catch (error) {
      console.error(' API Connection failed:', error.message);
      VARIABLES.runtimeState.dbConnected = false;
    }

    // Step 2: NLP Service
    console.log('\n Step 2/3: Initializing NLP Service...');
    await nlpService.initialize();
    VARIABLES.runtimeState.nlpInitialized = true;
    console.log(' NLP Service initialized');

    // Step 3: Groq LLM - configure as PRIMARY BRAIN
    console.log('\n Step 3/3: Configuring Groq LLM (Primary Brain)...');
    const _groqApiKey = process.env.GROQ_API_KEY || '';
    const _groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const _groqTokens = parseInt(process.env.GROQ_MAX_TOKENS || '300');
    const _groqTemp = parseFloat(process.env.GROQ_TEMPERATURE || '0.3');

    // Configure groq_service.js as the primary NLP brain
    groqService.configure(_groqApiKey, {
      model: _groqModel,
      maxTokens: _groqTokens,
      temperature: _groqTemp
    });

    groqEnabled = groqService.enabled;
    if (groqEnabled) {
      console.log(` Groq PRIMARY BRAIN active (model: ${_groqModel})`);
    } else {
      console.log(' Groq disabled - set GROQ_API_KEY in .env to enable');
      console.log(' Get free key at: https://console.groq.com');
    }

    // Step 3b: Configure AI Service (multi-model switcher)
    aiService.configure();
    console.log(' AI Service configured (role-based model routing)');

    // Step 4: Initialize logging service
    loggingService.initialize();

    // Step 5: Pre-warm QA cache (non-blocking)
    preloadQACache();

    isInitialized = true;
    VARIABLES.runtimeState.isInitialized = true;
    VARIABLES.runtimeState.startTime = Date.now();
    VARIABLES.configState.features.apiCallsEnabled = true;

    console.log('\n' + '='.repeat(70));
    console.log(' ALL SERVICES INITIALIZED SUCCESSFULLY');
    console.log('='.repeat(70));

    return true;
  } catch (error) {
    console.error('\n INITIALIZATION FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

// ============================================================================
// HOME PAGE
// ============================================================================
app.get('/', (req, res) => {
  const health = VARIABLES.getSystemHealth();
  res.send(`
 <!DOCTYPE html>
 <html>
 <head>
 <title>Vogo Chatbot - API Powered</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Load Chatbot CSS -->
  <link rel="stylesheet" href="chatbot.css">
 <style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }
  .container {
    background: white;
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  }
  h1 { color: #667eea; margin: 0 0 10px 0; font-size: clamp(1.4rem, 4vw, 2rem); }
  .subtitle { color: #666; margin-bottom: 24px; font-size: clamp(13px, 2vw, 15px); }
  .status {
    padding: 16px 20px;
    background: ${health.status === 'healthy' ? '#d4edda' : '#f8d7da'};
    border-left: 4px solid ${health.status === 'healthy' ? '#28a745' : '#dc3545'};
    border-radius: 6px;
    margin: 16px 0;
    word-break: break-word;
  }
  .status h3 { margin-top: 0; color: ${health.status === 'healthy' ? '#155724' : '#721c24'}; font-size: clamp(14px, 2.5vw, 17px); }
  .status p { margin: 6px 0; font-size: clamp(12px, 2vw, 14px); }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px;
    margin: 20px 0;
  }
  .stat-card { background: #f8f9fa; padding: 16px 12px; border-radius: 8px; text-align: center; }
  .stat-card strong { display: block; font-size: clamp(22px, 5vw, 32px); color: #667eea; margin-bottom: 4px; }
  .stat-card small { color: #666; font-size: clamp(10px, 1.8vw, 13px); }
  .button-group { display: flex; gap: 10px; margin: 24px 0; flex-wrap: wrap; }
  button, .button {
    background: #667eea;
    color: white;
    border: none;
    padding: 14px 22px;
    border-radius: 8px;
    cursor: pointer;
    font-size: clamp(13px, 2vw, 16px);
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    touch-action: manipulation;
    transition: background 0.2s;
    min-height: 48px;
  }
  button:hover, .button:hover { background: #5568d3; }
  button:active, .button:active { transform: scale(0.97); }
  .test-btn { background: #17a2b8; }
  .test-btn:hover { background: #138496; }
  .api-badge {
    display: inline-block;
    background: #28a745;
    color: white;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: clamp(10px, 1.5vw, 12px);
    margin-left: 8px;
    vertical-align: middle;
  }

  /* === PHONE (≤480px) === */
  @media (max-width: 480px) {
    body { padding: 8px; background: #764ba2; }
    .container { padding: 20px 16px; border-radius: 8px; }
    .stats { grid-template-columns: repeat(2, 1fr); }
    .button-group { flex-direction: column; }
    .button-group button, .button-group .button, .button-group a { width: 100%; text-align: center; }
    .status { padding: 14px; }
  }

  /* === TABLET (481px – 768px) === */
  @media (min-width: 481px) and (max-width: 768px) {
    body { padding: 12px; }
    .container { padding: 24px 20px; }
    .stats { grid-template-columns: repeat(2, 1fr); }
    .button-group { gap: 8px; }
  }

  /* === LAPTOP / DESKTOP (≥769px) === */
  @media (min-width: 769px) {
    body { padding: 30px 20px; }
    .stats { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  }
 </style>
 </head>
 <body>
 <div class="container">
 <h1> Vogo Chatbot <span class="api-badge">API Powered</span></h1>
 <p class="subtitle">Connected to vogo.family REST API</p>
 <div class="status">
 <h3>System Status: ${health.status.toUpperCase()}</h3>
 <p><strong>API Connection:</strong> ${health.dbConnected ? ' Connected' : ' Reconnecting...'}</p>
 <p><strong>NLP Service:</strong> ${health.nlpInitialized ? ' Active' : ' Inactive'}</p>
 <p><strong>Groq LLM:</strong> ${groqEnabled ? ' Active (' + (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile') + ')' : ' Disabled (set GROQ_API_KEY in .env)'}</p>
 <p><strong>AI Models:</strong> ${Object.entries(aiService.getStats().providers).filter(([k, v]) => v.enabled).map(([k]) => k).join(', ') || 'ai_basic only'}</p>
 <p><strong>Role Routing:</strong> general→${aiService.getStats().roleModelMap.general}, vip→${aiService.getStats().roleModelMap.vip}</p>
 <p><strong>Mode:</strong> REST API (vogo.family)</p>
 <p><strong>Uptime:</strong> ${Math.floor(health.uptime / 1000)}s</p>
 </div>
 <div class="stats">
 <div class="stat-card"><strong>${health.totalRequests}</strong><small>Total Requests</small></div>
 <div class="stat-card"><strong>${health.totalConversations}</strong><small>Conversations</small></div>
 <div class="stat-card"><strong>${groqRequestCount}</strong><small>Groq LLM Calls</small></div>
 <div class="stat-card"><strong>${health.recentErrors}</strong><small>Recent Errors</small></div>
 </div>
 <div class="button-group">
  <button class="button test-btn" onclick="if(window._vogoChatbot){window._vogoChatbot.openChat();}else{alert('Chatbot loading, please wait...');}"> OPEN CHATBOT</button>
 <a href="/logs" class="button"> VIEW LOGS</a>
 <a href="/health" class="button"> HEALTH CHECK</a>
 </div>
 </div>
  <!-- Chatbot JS - sets window._vogoChatbot automatically on load -->
  <script src="chatbot.js"></script>
 </body>
 </html>
 `);
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/health', async (req, res) => {
  const health = VARIABLES.getSystemHealth();
  let apiStatus = 'unknown';
  try {
    await vogoApi.getToken();
    apiStatus = 'connected';
    VARIABLES.runtimeState.dbConnected = true;
  } catch (e) {
    apiStatus = 'disconnected';
    VARIABLES.runtimeState.dbConnected = false;
  }
  res.json({
    status: health.status,
    timestamp: new Date().toISOString(),
    uptime: health.uptime,
    api: { status: apiStatus, baseUrl: process.env.VOGO_API_BASE || 'https://vogo.family/wp-json' },
    nlp: { initialized: health.nlpInitialized },
    groq: { enabled: groqEnabled, model: (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'), requestCount: groqRequestCount },
    ai: aiService.getStats(),
    stats: { totalRequests: health.totalRequests, totalConversations: health.totalConversations },
    memory: health.memoryUsage
  });
});

// ============================================================================
// AI KEYS CONFIGURATION PAGE
// Documents all AI provider keys, files, and setup instructions
// ============================================================================
app.get('/ai-config', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>AI Keys Configuration - Vogo Chatbot</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 30px auto; padding: 20px; background: #f5f5f5; }
      .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      h1 { color: #ff6b35; margin-top: 0; }
      h2 { color: #333; border-bottom: 2px solid #ff6b35; padding-bottom: 8px; margin-top: 36px; }
      h3 { color: #667eea; margin-bottom: 6px; }
      .provider-card { background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; border-radius: 8px; margin: 16px 0; }
      .provider-card.groq { border-color: #10b981; }
      .provider-card.openai { border-color: #1d4ed8; }
      .provider-card.gemini { border-color: #f59e0b; }
      .provider-card.rasa { border-color: #8b5cf6; }
      .provider-card.vask { border-color: #ec4899; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-left: 8px; }
      .badge-default { background: #d1fae5; color: #065f46; }
      .badge-vip { background: #dbeafe; color: #1e40af; }
      .badge-optional { background: #fef3c7; color: #92400e; }
      .code { background: #1e293b; color: #7dd3fc; padding: 14px 18px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 13px; margin: 10px 0; white-space: pre-wrap; line-height: 1.6; }
      .file-tag { display: inline-block; background: #334155; color: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; margin: 2px; }
      .back-btn { display: inline-block; background: #667eea; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 24px; }
      .back-btn:hover { background: #5568d3; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th { background: #667eea; color: white; padding: 10px 14px; text-align: left; }
      td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }
      tr:hover td { background: #f8f9fa; }
      .env-file { background: #0f172a; color: #a3e635; padding: 20px; border-radius: 8px; font-family: monospace; font-size: 13px; line-height: 2; margin: 10px 0; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 6px; margin: 16px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <a href="/test.html" class="back-btn">← Back to Test Page</a>
      <h1>🔑 AI Keys Configuration</h1>
      <p>Complete documentation for setting up AI provider API keys for the Vogo Chatbot.</p>
      <div class="warning"><strong>⚠️ Security Note:</strong> Never commit API keys to version control. Always store them in the <span class="file-tag">.env</span> file which is excluded from Git.</div>
      <h2>📁 Involved Files</h2>
      <table>
        <thead><tr><th>File</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td><span class="file-tag">.env</span></td><td>All API keys and environment variables (main config)</td></tr>
          <tr><td><span class="file-tag">server/server.js</span></td><td>Main server - reads keys, role-based AI routing, Groq inline fallback</td></tr>
          <tr><td><span class="file-tag">server/groq_service.js</span></td><td>Groq API integration - primary AI brain for standard users</td></tr>
          <tr><td><span class="file-tag">server/ai_service.js</span></td><td>Multi-model AI switcher - routes to Groq/OpenAI/Gemini based on JWT role</td></tr>
          <tr><td><span class="file-tag">server/nlp_service.js</span></td><td>NLP pipeline - calls ai_service for step 5 AI routing</td></tr>
        </tbody>
      </table>
      <h2>⚙️ .env File Setup</h2>
      <div class="env-file">
# VOGO CHATBOT - ENVIRONMENT VARIABLES

# DEFAULT AI (Groq) - Free, fast
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_TOKENS=300
GROQ_TEMPERATURE=0.3

# VIP AI (OpenAI) - For VIP/premium users
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini

# Optional AI (Gemini)
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_MODEL=gemini-1.5-flash

# Vogo API
VOGO_API_BASE=https://vogo.family/wp-json
VOGO_USERNAME=app_mobile_general@vogo.family
VOGO_PASSWORD=Abc123$

# Server
SERVER_PORT=3000
      </div>
      <h2>🤖 AI Providers</h2>
      <div class="provider-card groq">
        <h3>1. Groq (Llama) <span class="badge badge-default">DEFAULT - All Users</span></h3>
        <p><strong>Get free key:</strong> <a href="https://console.groq.com" target="_blank">console.groq.com</a></p>
        <div class="code">GROQ_API_KEY=gsk_your_key_here\nGROQ_MODEL=llama-3.3-70b-versatile</div>
      </div>
      <div class="provider-card openai">
        <h3>2. OpenAI (GPT) <span class="badge badge-vip">VIP Users Only</span></h3>
        <p><strong>Get key:</strong> <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a></p>
        <div class="code">OPENAI_API_KEY=sk-your_key_here\nOPENAI_MODEL=gpt-4o-mini</div>
      </div>
      <div class="provider-card gemini">
        <h3>3. Gemini (Google) <span class="badge badge-optional">Optional</span></h3>
        <p><strong>Get key:</strong> <a href="https://aistudio.google.com/app/apikey" target="_blank">aistudio.google.com/app/apikey</a></p>
        <div class="code">GEMINI_API_KEY=AIzaSy_your_key_here\nGEMINI_MODEL=gemini-1.5-flash</div>
      </div>
      <div class="provider-card rasa">
        <h3>4. Rasa <span class="badge badge-optional">Optional / Future</span></h3>
        <div class="code">RASA_ENDPOINT=http://localhost:5005\nRASA_API_TOKEN=your_rasa_token</div>
      </div>
      <div class="provider-card vask">
        <h3>5. Vask (Voice) <span class="badge badge-optional">Optional / Future</span></h3>
        <div class="code">VASK_API_KEY=your_vask_key_here\nVASK_ENDPOINT=https://api.vask.ai/v1</div>
      </div>
      <h2>🔀 AI Routing Logic</h2>
      <table>
        <thead><tr><th>JWT Role</th><th>AI Engine</th><th>Model</th></tr></thead>
        <tbody>
          <tr><td>general / customer</td><td>Groq (Llama)</td><td>llama-3.3-70b-versatile</td></tr>
          <tr><td>ai_openai / ai_use</td><td>OpenAI</td><td>gpt-4o-mini</td></tr>
          <tr><td>ai_gemini</td><td>Gemini</td><td>gemini-1.5-flash</td></tr>
          <tr><td>ai_vask</td><td>Vask/Voice</td><td>TTS output</td></tr>
          <tr><td>ai_basic</td><td>Groq (basic)</td><td>llama-3.3-70b-versatile</td></tr>
          <tr><td>admin</td><td>Groq + full access</td><td>llama-3.3-70b-versatile</td></tr>
        </tbody>
      </table>
      <h2>🧪 Quick Test</h2>
      <div class="code">curl http://localhost:3000/health</div>
      <p>Look for <code>"groq": { "enabled": true }</code> to confirm Groq is active.</p>
      <div style="margin-top:40px;text-align:center;"><a href="/test.html" class="back-btn">← Back to Chatbot Test Page</a></div>
    </div>
  </body>
  </html>
  `);
});

// ============================================================================
// API: GET SERVER LOGS
// Returns logs from database for the /logs page
// ============================================================================
app.get('/api/server-logs', async (req, res) => {
  const { limit = 100, category } = req.query;

  try {
    const logs = await loggingService.getRecentLogs(parseInt(limit, 10) || 100, category);
    const loggingStatus = typeof loggingService.getStatus === 'function' ? loggingService.getStatus() : null;
    res.json({
      success: true,
      logs,
      count: logs.length,
      source: loggingStatus?.persistentReady ? 'local-sqlite' : 'unavailable',
      loggingStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// LOGS VIEWER
// ============================================================================
app.get('/logs', async (req, res) => {
  const { category } = req.query;
  const logs = await loggingService.getRecentLogs(200, category || null);
  const detailedLogsEnabled = loggingService.isEnabled();
  const loggingStatus = typeof loggingService.getStatus === 'function' ? loggingService.getStatus() : { persistentReady: false };
  const logSource = loggingStatus.persistentReady ? 'local SQLite .db' : 'local SQLite (not ready)';

  res.send(`
 <!DOCTYPE html>
 <html>
 <head>
 <title>Server Logs</title>
 <style>
 body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1400px; margin: 30px auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
 .container { background: white; padding: 30px; border-radius: 12px; }
 h1 { color: #667eea; }
 .status-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; margin-left: 12px; }
 .status-enabled { background: #d4edda; color: #155724; }
 .status-disabled { background: #f8d7da; color: #721c24; }
 table { width: 100%; border-collapse: collapse; margin: 20px 0; }
 th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
 th { background: #667eea; color: white; position: sticky; top: 0; }
 tr:hover { background: #f5f5f5; }
 .level { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; display: inline-block; min-width: 60px; text-align: center; }
 .level-info { background: #cfe2ff; color: #084298; }
 .level-warn { background: #fff3cd; color: #856404; }
 .level-error { background: #f8d7da; color: #721c24; }
 .level-debug { background: #e2e3e5; color: #383d41; }
 .category { padding: 4px 10px; border-radius: 8px; font-size: 11px; background: #e9ecef; color: #495057; font-weight: 600; }
 .message { max-width: 600px; word-wrap: break-word; }
 .metadata { font-family: monospace; font-size: 11px; background: #f8f9fa; padding: 8px; border-radius: 4px; max-width: 500px; max-height: 150px; overflow-y: auto; }
 .api-badge { background: #17a2b8; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; margin-left: 10px; }
 .btn-group { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
 .btn { padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block; }
 .btn-refresh { background: #28a745; color: white; }
 .btn-home { background: #667eea; color: white; }
 .btn-filter { background: #17a2b8; color: white; }
 .filter-section { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
 .filter-section h3 { margin-top: 0; color: #495057; }
 </style>
 </head>
 <body>
 <div class="container">
 <h1> Server Logs <span class="api-badge">Persistent</span>
 <span class="status-badge ${detailedLogsEnabled ? 'status-enabled' : 'status-disabled'}">
 ${detailedLogsEnabled ? 'DETAILED LOGS ENABLED' : 'DETAILED LOGS DISABLED'}
 </span>
 </h1>
 <p>Showing last ${logs.length} logs from ${logSource}${loggingStatus.persistentReady ? ' (persistent across restarts)' : ''}${category ? ` | Filter: ${category}` : ''}</p>
 
 ${!detailedLogsEnabled ? '<div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 6px;"><strong>⚠️ Detailed logging is disabled.</strong> Set <code>SHOW_DETAILED_LOGS=true</code> in .env file to enable persistent logging.</div>' : ''}
 ${detailedLogsEnabled && !loggingStatus.persistentReady ? `<div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 6px;"><strong>⚠️ Local SQLite logs DB is not ready.</strong> ${loggingStatus.lastDbError ? `Error: <code>${String(loggingStatus.lastDbError).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>.` : ''}</div>` : ''}
 
 <div class="filter-section">
 <h3>Filters</h3>
 <div style="display: flex; gap: 10px; flex-wrap: wrap;">
 <a href="/logs" class="btn btn-filter">All Logs</a>
 <a href="/logs?category=api_call" class="btn btn-filter">API Calls</a>
 <a href="/logs?category=api_error" class="btn btn-filter">API Errors</a>
 <a href="/logs?category=user_message" class="btn btn-filter">User Messages</a>
 <a href="/logs?category=chatbot_response" class="btn btn-filter">Bot Responses</a>
 <a href="/logs?category=chatbot_action" class="btn btn-filter">Bot Actions</a>
 <a href="/logs?category=operator_action" class="btn btn-filter">Operator Actions</a>
 <a href="/logs?category=error" class="btn btn-filter">Errors</a>
 </div>
 </div>
 
 ${logs.length === 0
      ? '<p style="text-align:center;padding:40px;color:#999;">No logs yet. Start chatting or enable SHOW_DETAILED_LOGS in .env!</p>'
      : `<table>
 <thead><tr><th>Time</th><th>Level</th><th>Category</th><th>Message</th><th>Details</th></tr></thead>
 <tbody>
 ${logs.map(log => {
        const logData = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {});
        const metadataDisplay = Object.keys(logData).length > 0 ?
          `<details><summary>View metadata</summary><div class="metadata">${JSON.stringify(logData, null, 2)}</div></details>` : '';

        return `
 <tr>
 <td>${new Date(log.created_at).toLocaleString()}</td>
 <td><span class="level level-${log.log_level}">${log.log_level.toUpperCase()}</span></td>
 <td><span class="category">${log.log_category}</span></td>
 <td class="message">${log.message || ''}</td>
 <td>${metadataDisplay}${log.user_ip ? `<div style="margin-top:8px;font-size:11px;color:#666;">IP: ${log.user_ip}</div>` : ''}</td>
 </tr>`;
      }).join('')}
 </tbody>
 </table>`
    }
 <div class="btn-group">
 <button onclick="location.reload()" class="btn btn-refresh"> Refresh</button>
 <a href="/" class="btn btn-home"> Home</a>
 <a href="/test.html" class="btn btn-refresh"> Open Chatbot</a>
 </div>
 </div>
 </body>
 </html>
 `);
});

// ============================================================================
// DATE PARSING UTILITIES - Returns YYYY-MM-DD (date only, no time)
// ============================================================================
function parseHumanDateToMysql(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const now = new Date();
  const toDateOnly = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  if (raw === 'today') return toDateOnly(new Date(now));
  if (raw === 'tonight') return toDateOnly(new Date(now));
  if (raw === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate() + 1); return toDateOnly(d); }
  if (raw === 'next week') { const d = new Date(now); d.setDate(d.getDate() + 7); return toDateOnly(d); }
  if (raw === 'next month') { const d = new Date(now); d.setMonth(d.getMonth() + 1); return toDateOnly(d); }

  const relativeMatch = raw.match(/(?:after|in)\s+(\d+)\s*(day|days|week|weeks|month|months)/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const d = new Date(now);
    if (unit === 'day' || unit === 'days') d.setDate(d.getDate() + amount);
    if (unit === 'week' || unit === 'weeks') d.setDate(d.getDate() + amount * 7);
    if (unit === 'month' || unit === 'months') d.setMonth(d.getMonth() + amount);
    return toDateOnly(d);
  }

  const fromNowMatch = raw.match(/(\d+)\s*(day|days|week|weeks|month|months)\s+from\s+now/i);
  if (fromNowMatch) {
    const amount = parseInt(fromNowMatch[1]);
    const unit = fromNowMatch[2].toLowerCase();
    const d = new Date(now);
    if (unit === 'day' || unit === 'days') d.setDate(d.getDate() + amount);
    if (unit === 'week' || unit === 'weeks') d.setDate(d.getDate() + amount * 7);
    if (unit === 'month' || unit === 'months') d.setMonth(d.getMonth() + amount);
    return toDateOnly(d);
  }

  const weekdays = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  if (weekdays[raw] !== undefined) {
    const target = weekdays[raw];
    const d = new Date(now);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return toDateOnly(d);
  }

  const dateMatch = raw.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
  if (dateMatch) {
    const months = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
    const d = new Date(parseInt(dateMatch[3]), months[dateMatch[2].toLowerCase()], parseInt(dateMatch[1]));
    return toDateOnly(d);
  }

  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? 2000 + parseInt(slashMatch[3]) : parseInt(slashMatch[3]);
    const d = new Date(year, parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
    return toDateOnly(d);
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;

  const direct = new Date(input);
  if (!isNaN(direct.getTime())) return toDateOnly(direct);

  return null;
}

function extractEventAndDatetime(eventText, dateStr) {
  if (!eventText) return { event: '', datetime: null };
  let event = eventText.trim();
  // Strip leading colon/dash/quote artifacts (e.g. ': "Coresi meeting"' → 'Coresi meeting')
  event = event.replace(/^[\s:"'\-\u2013,;]+/, '').trim();
  // Strip surrounding/inner quotes (e.g. '"Coresi meeting"' → 'Coresi meeting')
  event = event.replace(/^["']|["']$/g, '').replace(/"/g, '').trim();
  let datetime = dateStr ? parseHumanDateToMysql(dateStr) : null;
  const timeMatch = event.match(/\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*$/i);
  if (timeMatch) event = event.replace(timeMatch[0], '').trim();
  return { event, datetime };
}

// ============================================================================
// NLP CHATBOT ENDPOINT
// 6-step routing: Language -> Regex -> Keywords -> NLP -> Groq LLM -> Fallback
// ============================================================================
app.post('/api/chatbot-nlp', async (req, res) => {
  const { text, language } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    try {
      const result = payload?.result || {};
      const action = payload?.action || {};
      const entities = payload?.entities || {};
      const responseText = result.response || action.message || payload?.message || '';

      if (result.intent) {
        loggingService.logChatbotAction('intent_detected', {
          intent: result.intent,
          confidence: result.confidence,
          method: result.method,
          detectedLanguage: result.detectedLanguage || language,
          extractedItems: entities
        }, userIp);
      }

      loggingService.logChatbotResponse(
        responseText,
        result.intent || null,
        result.confidence || null,
        result.method || null,
        result.detectedLanguage || language || 'en',
        userIp,
        { action, extractedItems: entities }
      );
    } catch (_) {
      // Never block API response because of logging
    }

    return originalJson(payload);
  };

  if (!nlpService) {
    return res.json({ success: false, message: 'NLP service not available' });
  }

  VARIABLES.incrementStat('totalRequests');
  VARIABLES.incrementStat('totalConversations');

  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(` Received: "${text}" [${language}] [IP: ${userIp}]`);

    loggingService.info('user_message', `Received message from user`, { text, language, userIp }, userIp);

    // =========================================================================
    // LIVE CHAT GUARD
    // If a human operator thread is active, bypass AI and send directly to thread
    // =========================================================================
    const liveSession = authSession.getAuthSession(userIp);
    const liveThreadId = liveSession?.liveChatThreadId;
    const liveSupportId = liveSession?.liveChatSupportUserId;
    const liveUserToken = authSession.getUserToken(userIp);
    if (liveThreadId && liveSupportId && liveUserToken) {
      const lang = liveSession?.lang || language || 'en';
      try {
        loggingService.logOperatorAction('message_sent', liveThreadId, String(liveSupportId), `User message sent to operator: ${text.substring(0, 100)}`, userIp);

        const sendResult = await vogoApi.postThreadAnswer(liveUserToken, liveThreadId, text);
        if (!sendResult.success) {
          return res.json({
            success: true,
            result: { intent: 'transfer_to_human', confidence: 1.0, method: 'live_chat', response: 'Failed to send message. Please try again.', detectedLanguage: lang },
            action: { liveChatStarted: true, threadId: liveThreadId, supportUserId: String(liveSupportId), supportUserName: liveSession?.liveChatSupportUserName || 'Support Agent' },
            entities: {}
          });
        }

        const transferMsgs = CONSTANTS.SUCCESS_MESSAGES[lang] || CONSTANTS.SUCCESS_MESSAGES['en'] || {};
        return res.json({
          success: true,
          result: { intent: 'transfer_to_human', confidence: 1.0, method: 'live_chat', response: '', detectedLanguage: lang },
          action: {
            liveChatStarted: true,
            threadId: liveThreadId,
            supportUserId: String(liveSupportId),
            supportUserName: liveSession?.liveChatSupportUserName || 'Support Agent',
            userEmail: liveSession?.userEmail || '',
            message: transferMsgs.TRANSFER_CONNECTED || 'You are now connected with a support agent.',
            routedToHuman: true
          },
          entities: {}
        });
      } catch (err) {
        return res.json({
          success: true,
          result: { intent: 'transfer_to_human', confidence: 1.0, method: 'live_chat', response: 'Live chat is currently unavailable. Please try again.', detectedLanguage: lang },
          action: { liveChatStarted: true, threadId: liveThreadId, supportUserId: String(liveSupportId), supportUserName: liveSession?.liveChatSupportUserName || 'Support Agent' },
          entities: {}
        });
      }
    }

    // =========================================================================
    // PENDING CONFIRMATION CHECK
    // If user has a pending action (e.g. duplicate item warning), handle it first
    // =========================================================================
    const pending = getPending(userIp);
    if (pending) {
      // -----------------------------------------------------------------------
      // PENDING GUARD: If the user's reply looks like a navigation command
      // (e.g. "show list", "cancel", "show agenda") — clear pending and let it
      // be processed normally by NLP. Do NOT treat it as an item/event name.
      // -----------------------------------------------------------------------
      const looksLikeCommand = /^\s*(?:show|view|see|display|open|check|list|cancel|stop|nevermind|never mind|help|no|nope)\b/i.test(text) ||
        /\b(?:shopping\s+list|my\s+list|the\s+list|agenda|calendar|schedule)\b/i.test(text);
      if (looksLikeCommand) {
        clearPending(userIp);
        console.log(` [PENDING] cleared — reply looks like a command: "${text}"`);
        // Fall through to normal NLP processing
      } else {

        // -----------------------------------------------------------------------
        // PENDING: awaiting event name for agenda_mark_done
        // User previously got "Which event would you like to mark as done?"
        // Their next message IS the event name — treat it directly as agenda_mark_done
        // -----------------------------------------------------------------------
        if (pending.action === 'awaiting_agenda_mark_done_event') {
          clearPending(userIp);
          const lang = pending.lang;
          const eventName = text.trim();
          console.log(` [PENDING] agenda_mark_done awaiting event name: "${eventName}"`);
          try {
            const agendaResult = await vogoApi.getAgendaItems(null, null, lang);
            const events = agendaResult.events || [];
            const searchName = eventName.toLowerCase();
            const nameOf = e => (e.event_name || e.name || e.title || '').toLowerCase();
            const wordRe = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            let found = events.find(e => !e._done && nameOf(e) === searchName)
              || events.find(e => nameOf(e) === searchName)
              || events.find(e => !e._done && wordRe.test(nameOf(e)))
              || events.find(e => wordRe.test(nameOf(e)))
              || events.find(e => nameOf(e).includes(searchName) || searchName.includes(nameOf(e)));
            if (found) {
              const eventId = found.id || found.event_id;
              const foundName = found.event_name || found.name || eventName;
              const doneResult = await vogoApi.markAgendaItemDone(eventId);
              const doneMsgs = {
                en: `Marked "${foundName}" as done in your calendar!`,
                ro: `Am marcat "${foundName}" ca finalizat în calendar!`,
                it: `"${foundName}" segnato come fatto nel calendario!`,
                fr: `"${foundName}" marqué comme fait dans votre agenda!`,
                de: `"${foundName}" als erledigt markiert im Kalender!`
              };
              const msg = doneMsgs[lang] || doneMsgs['en'];
              return res.json({ success: true, result: { intent: 'agenda_mark_done', confidence: 1.0, method: 'pending_followup', response: msg, detectedLanguage: lang }, action: { success: doneResult.success, message: msg, overrideResponse: true }, entities: { event: foundName } });
            } else {
              const notFoundMsgs = {
                en: `I couldn't find "${eventName}" in your calendar.`,
                ro: `Nu am găsit "${eventName}" în calendar.`,
                it: `Non ho trovato "${eventName}" nel calendario.`,
                fr: `Je n'ai pas trouvé "${eventName}" dans votre agenda.`,
                de: `"${eventName}" wurde nicht im Kalender gefunden.`
              };
              const msg = notFoundMsgs[lang] || notFoundMsgs['en'];
              return res.json({ success: true, result: { intent: 'agenda_mark_done', confidence: 1.0, method: 'pending_followup', response: msg, detectedLanguage: lang }, action: { success: false, message: msg, overrideResponse: true }, entities: { event: eventName } });
            }
          } catch (err) {
            return res.json({ success: false, message: `Failed to mark event: ${err.message}` });
          }
        }

        // -----------------------------------------------------------------------
        // PENDING: awaiting event name for agenda_unmark_done
        // -----------------------------------------------------------------------
        if (pending.action === 'awaiting_agenda_unmark_done_event') {
          clearPending(userIp);
          const lang = pending.lang;
          const eventName = text.trim();
          console.log(` [PENDING] agenda_unmark_done awaiting event name: "${eventName}"`);
          try {
            const agendaResult = await vogoApi.getAgendaItems(null, null, lang);
            const events = agendaResult.events || [];
            const searchName = eventName.toLowerCase();
            const nameOf = e => (e.event_name || e.name || e.title || '').toLowerCase();
            const wordRe = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            let found = events.find(e => e._done && nameOf(e) === searchName)
              || events.find(e => nameOf(e) === searchName)
              || events.find(e => e._done && wordRe.test(nameOf(e)))
              || events.find(e => wordRe.test(nameOf(e)))
              || events.find(e => nameOf(e).includes(searchName) || searchName.includes(nameOf(e)));
            if (found) {
              const eventId = found.id || found.event_id;
              const foundName = found.event_name || found.name || eventName;
              const unmarkResult = await vogoApi.unmarkAgendaItemDone(eventId);
              const unmarkMsgs = {
                en: `Unmarked "${foundName}" in your calendar.`,
                ro: `Am demarcat "${foundName}" în calendar.`,
                it: `"${foundName}" deselezionato nel calendario.`,
                fr: `"${foundName}" décoché dans votre agenda.`,
                de: `"${foundName}" im Kalender abgehakt.`
              };
              const msg = unmarkMsgs[lang] || unmarkMsgs['en'];
              return res.json({ success: true, result: { intent: 'agenda_unmark_done', confidence: 1.0, method: 'pending_followup', response: msg, detectedLanguage: lang }, action: { success: unmarkResult.success, message: msg, overrideResponse: true }, entities: { event: foundName } });
            } else {
              const notFoundMsgs = { en: `I couldn't find "${eventName}" in your calendar.`, ro: `Nu am găsit "${eventName}" în calendar.`, it: `Non ho trovato "${eventName}" nel calendario.`, fr: `Je n'ai pas trouvé "${eventName}" dans votre agenda.`, de: `"${eventName}" wurde nicht im Kalender gefunden.` };
              const msg = notFoundMsgs[lang] || notFoundMsgs['en'];
              return res.json({ success: true, result: { intent: 'agenda_unmark_done', confidence: 1.0, method: 'pending_followup', response: msg, detectedLanguage: lang }, action: { success: false, message: msg, overrideResponse: true }, entities: { event: eventName } });
            }
          } catch (err) {
            return res.json({ success: false, message: `Failed to unmark event: ${err.message}` });
          }
        }

        // -----------------------------------------------------------------------
        // PENDING: awaiting item name for shopping_list_mark_done
        // -----------------------------------------------------------------------
        if (pending.action === 'awaiting_shopping_mark_done_item') {
          clearPending(userIp);
          const lang = pending.lang;
          const itemName = text.trim();
          console.log(` [PENDING] shopping_list_mark_done awaiting item name: "${itemName}"`);
          try {
            const listResult = await vogoApi.getShoppingList(lang);
            const items = listResult.items || [];
            const searchName = itemName.toLowerCase();
            const nameOf = i => (i.item_name || i.name || i.item_text || '').toLowerCase();
            const wordRe = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            let found = items.find(i => !i._done && nameOf(i) === searchName)
              || items.find(i => nameOf(i) === searchName)
              || items.find(i => !i._done && wordRe.test(nameOf(i)))
              || items.find(i => wordRe.test(nameOf(i)))
              || items.find(i => nameOf(i).includes(searchName) || searchName.includes(nameOf(i)));
            if (found) {
              const itemId = found.id || found.item_id || found.list_id;
              const foundName = found.item_name || found.name || itemName;
              const doneResult = await vogoApi.markShoppingItemDone(itemId);
              const doneMsgs = { en: `Marked "${foundName}" as done in your shopping list!`, ro: `Am marcat "${foundName}" ca finalizat în lista de cumpărături!`, it: `"${foundName}" segnato come acquistato!`, fr: `"${foundName}" marqué comme acheté!`, de: `"${foundName}" als erledigt markiert!` };
              const msg = doneMsgs[lang] || doneMsgs['en'];
              return res.json({ success: true, result: { intent: 'shopping_list_mark_done', confidence: 1.0, method: 'pending_followup', response: msg, detectedLanguage: lang }, action: { success: doneResult.success, message: msg, overrideResponse: true }, entities: { item: foundName } });
            } else {
              const notFoundMsgs = { en: `I couldn't find "${itemName}" in your shopping list.`, ro: `Nu am găsit "${itemName}" în lista de cumpărături.`, it: `Non ho trovato "${itemName}" nella lista della spesa.`, fr: `Je n'ai pas trouvé "${itemName}" dans votre liste.`, de: `"${itemName}" wurde nicht in der Einkaufsliste gefunden.` };
              const msg = notFoundMsgs[lang] || notFoundMsgs['en'];
              return res.json({ success: true, result: { intent: 'shopping_list_mark_done', confidence: 1.0, method: 'pending_followup', response: msg, detectedLanguage: lang }, action: { success: false, message: msg, overrideResponse: true }, entities: { item: itemName } });
            }
          } catch (err) {
            return res.json({ success: false, message: `Failed to mark item: ${err.message}` });
          }
        }

      } // end: else (looksLikeCommand guard) — awaiting-name handlers end here

      if (pending.action === 'confirm_add_shopping_item') {
        if (isPositiveConfirmation(text)) {
          clearPending(userIp);
          console.log(` Confirmed duplicate add: "${pending.item}"`);
          try {
            const apiResult = await vogoApi.addShoppingItem(pending.item, 1, null, null, null, pending.lang);
            const lang = pending.lang;
            const addedMsgs = {
              en: `Done! Added "${pending.item}" to your shopping list again. `,
              ro: `Gata! Am adăugat din nou "${pending.item}" în lista de cumpărături. `,
              it: `Fatto! "${pending.item}" aggiunto di nuovo alla lista della spesa. `,
              fr: `Fait ! "${pending.item}" ajouté à nouveau à votre liste de courses. `,
              de: `Erledigt! "${pending.item}" wurde erneut zur Einkaufsliste hinzugefügt. `
            };
            const finalMsg = apiResult.success ? (addedMsgs[lang] || addedMsgs['en']) : apiResult.message;
            return res.json({
              success: true,
              result: { intent: 'shopping_list_add', confidence: 1.0, method: 'confirmation', response: finalMsg, detectedLanguage: lang },
              action: { success: apiResult.success, message: finalMsg, item: apiResult.item, overrideResponse: true },
              entities: { item: pending.item }
            });
          } catch (err) {
            return res.json({ success: false, message: `Failed to add item: ${err.message}` });
          }
        } else if (isNegativeConfirmation(text)) {
          clearPending(userIp);
          const lang = pending.lang;
          const cancelMsgs = {
            en: `No problem! "${pending.item}" was not added again.`,
            ro: `Nicio problemă! "${pending.item}" nu a mai fost adăugat.`,
            it: `Nessun problema! "${pending.item}" non è stato aggiunto di nuovo.`,
            fr: `Pas de problème ! "${pending.item}" n'a pas été ajouté à nouveau.`,
            de: `Kein Problem! "${pending.item}" wurde nicht erneut hinzugefügt.`
          };
          return res.json({
            success: true,
            result: { intent: 'conversational', confidence: 1.0, method: 'confirmation', response: cancelMsgs[lang] || cancelMsgs['en'], detectedLanguage: lang },
            action: { success: true, message: cancelMsgs[lang] || cancelMsgs['en'], overrideResponse: true },
            entities: {}
          });
        }
        // Not a clear yes/no — clear the pending and process normally
        clearPending(userIp);
      }
    }

    // Extract user role from JWT token (for AI model routing)
    const userRole = (() => {
      try {
        const auth = req.headers['authorization'] || req.headers['x-auth-token'] || '';
        const token = auth.replace('Bearer ', '').trim();
        if (!token) return 'general';
        // Decode JWT payload (no verification needed here - just read the role)
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        // vogo.family JWT stores role in payload.role or payload.user_role
        const role = (payload.role || payload.user_role || payload.capabilities?.[0] || 'general').toLowerCase();
        // Map WordPress roles to our AI model roles
        if (role.includes('vip') || role.includes('premium') || role.includes('client')) return 'vip';
        if (role.includes('admin') || role.includes('administrator')) return 'admin';
        return 'general';
      } catch (e) {
        return 'general';
      }
    })();
    console.log(` User role: ${userRole}`);

    // =========================================================================
    // AUTH SESSION STEP HANDLER
    // Every message is intercepted here if the user is mid-login flow.
    // Credentials are NEVER forwarded to the LLM.
    // =========================================================================
    const currentAuthState = authSession.getAuthSession(userIp);

    // --- STEP: awaiting_username ---
    if (currentAuthState && currentAuthState.step === 'awaiting_username') {
      const usernameInput = text.trim();
      const lang = currentAuthState.lang || language || 'en';

      // FIX 1: Validate the input looks like a real username/email.
      // If the user typed something clearly wrong (too short, looks like a
      // chat message, no @ for emails) — ask again instead of accepting it.
      const looksLikeChatMessage = usernameInput.length < 3 ||
        /^(yes|no|ok|hi|hello|bye|thanks|cancel|stop|what|why|how|help)/i.test(usernameInput) ||
        /[?!]{2,}/.test(usernameInput) ||
        usernameInput.split(' ').length > 6; // more than 6 words = sentence not username

      if (looksLikeChatMessage) {
        // Not a valid username — ask again, keep step as awaiting_username
        const tryAgainMsgs = {
          en: 'That does not look like a username. Please enter your Vogo Family email or username:',
          ro: 'Acesta nu pare un nume de utilizator. Introdu email-ul sau utilizatorul Vogo Family:',
          it: 'Questo non sembra un nome utente. Inserisci la tua email o nome utente Vogo Family:',
          fr: 'Cela ne ressemble pas a un nom d utilisateur. Entrez votre email ou nom d utilisateur Vogo Family:',
          de: 'Das sieht nicht wie ein Benutzername aus. Gib deine Vogo Family E-Mail oder deinen Benutzernamen ein:'
        };
        const tryAgainMsg = tryAgainMsgs[lang] || tryAgainMsgs['en'];
        return res.json({
          success: true,
          result: { intent: 'user_connect', confidence: 1.0, method: 'auth_flow', response: tryAgainMsg, detectedLanguage: lang },
          action: { awaitingUsername: true, message: tryAgainMsg, overrideResponse: true },
          entities: {}
        });
      }

      console.log('[AUTH] Received username: ' + usernameInput);
      authSession.setAuthSession(userIp, { step: 'awaiting_password', username: usernameInput });
      const askPwMsgs = {
        en: 'Got it! Now please enter your password:',
        ro: 'Multumesc! Acum te rog sa introduci parola:',
        it: 'Capito! Ora inserisci la tua password:',
        fr: 'Compris! Maintenant entrez votre mot de passe:',
        de: 'Verstanden! Bitte gib jetzt dein Passwort ein:'
      };
      const askPwMsg = askPwMsgs[lang] || askPwMsgs['en'];
      return res.json({
        success: true,
        result: { intent: 'user_connect', confidence: 1.0, method: 'auth_flow', response: askPwMsg, detectedLanguage: lang },
        action: { awaitingPassword: true, message: askPwMsg, overrideResponse: true },
        entities: {}
      });
    }

    // --- STEP: awaiting_password ---
    if (currentAuthState && currentAuthState.step === 'awaiting_password') {
      const passwordInput = text.trim();
      const username = currentAuthState.username;
      const lang = currentAuthState.lang || language || 'en';

      // FIX 2: Validate password is not obviously wrong (too short)
      if (passwordInput.length < 3) {
        const shortPwMsgs = {
          en: 'Password seems too short. Please enter your correct password:',
          ro: 'Parola pare prea scurta. Introdu parola corecta:',
          it: 'La password sembra troppo corta. Inserisci la password corretta:',
          fr: 'Le mot de passe semble trop court. Entrez votre mot de passe correct:',
          de: 'Das Passwort scheint zu kurz. Bitte gib dein korrektes Passwort ein:'
        };
        const shortPwMsg = shortPwMsgs[lang] || shortPwMsgs['en'];
        return res.json({
          success: true,
          result: { intent: 'user_connect', confidence: 1.0, method: 'auth_flow', response: shortPwMsg, detectedLanguage: lang },
          action: { awaitingPassword: true, message: shortPwMsg, overrideResponse: true },
          entities: {}
        });
      }

      console.log('[AUTH] Attempting login for user: ' + username);
      const loginResult = await vogoApi.loginUserJwt(username, passwordInput);

      if (loginResult.success) {
        authSession.completeAuth(userIp, loginResult.token, loginResult.userRoles, loginResult.userEmail);
        // Don't replay if the original intent was user_connect — nothing to retry
        const pendingText = (currentAuthState.pendingIntent === 'user_connect') ? null : (currentAuthState.pendingText || null);
        const successMsgs = {
          en: 'Connected successfully! Welcome, ' + loginResult.userEmail + '! 🎉',
          ro: 'Conectat cu succes! Bun venit, ' + loginResult.userEmail + '! 🎉',
          it: 'Connesso con successo! Benvenuto, ' + loginResult.userEmail + '! 🎉',
          fr: 'Connecte avec succes! Bienvenue, ' + loginResult.userEmail + '! 🎉',
          de: 'Erfolgreich verbunden! Willkommen, ' + loginResult.userEmail + '! 🎉'
        };
        const successMsg = successMsgs[lang] || successMsgs['en'];
        console.log('[AUTH] Login SUCCESS for ' + username + ' | aiEngine: ' + loginResult.aiEngine);
        return res.json({
          success: true,
          result: { intent: 'user_connect', confidence: 1.0, method: 'auth_flow', response: successMsg, detectedLanguage: lang },
          action: {
            authSuccess: true,
            userToken: loginResult.token,
            aiEngine: loginResult.aiEngine,
            userRoles: loginResult.userRoles,
            retryText: pendingText,
            message: successMsg,
            overrideResponse: true
          },
          entities: {}
        });
      } else {
        // FIX 3: Clear session AND explicitly reset password mode on the frontend
        authSession.clearAuthSession(userIp);
        const failMsgs = {
          en: 'Login failed: ' + loginResult.message + '. Type "I want to connect" to try again.',
          ro: 'Autentificare esuata: ' + loginResult.message + '. Scrie "vreau sa ma conectez" pentru a reincerca.',
          it: 'Accesso fallito: ' + loginResult.message + '. Scrivi "voglio connettermi" per riprovare.',
          fr: 'Connexion echouee: ' + loginResult.message + '. Ecrivez "je veux me connecter" pour reessayer.',
          de: 'Anmeldung fehlgeschlagen: ' + loginResult.message + '. Schreibe "ich mochte mich verbinden" zum Wiederholen.'
        };
        const failMsg = failMsgs[lang] || failMsgs['en'];
        console.log('[AUTH] Login FAILED for ' + username + ': ' + loginResult.message);
        return res.json({
          success: true,
          result: { intent: 'user_connect', confidence: 1.0, method: 'auth_flow', response: failMsg, detectedLanguage: lang },
          action: { success: false, message: failMsg, overrideResponse: true, authFailed: true },
          entities: {}
        });
      }
    }

    // =========================================================================
    // LLM PRE-PROCESSING LAYER
    // EVERY message — regardless of language or phrasing — is FIRST sent to
    // Groq LLM which understands what the user really means, detects language,
    // classifies intent, and extracts entities. Only then does the action
    // switch() below execute the correct API call or response.
    //
    // Pipeline inside nlpService.processMessage():
    //   Step 1: Groq PRIMARY BRAIN — full NLU in any language (returns JSON)
    //   Step 2: Offline fallback  — regex/keyword/node-nlp (Groq down/timeout)
    // =========================================================================
    const result = await nlpService.processMessage(text, language, userRole);
    console.log(` Intent: ${result.intent} | Method: ${result.method}`);

    // Use AI-provided entities whenever an AI model produced them.
    // Fall back to regex extraction only when AI entities are missing.
    const hasAiEntities = result.entities && Object.keys(result.entities).length > 0;
    const usedAiModel = result.method && (result.method === 'groq_primary' || result.method.startsWith('ai_'));
    const entities = (hasAiEntities && usedAiModel)
      ? result.entities
      : nlpService.extractEntities(text, result.intent);

    console.log(` Entities: ${JSON.stringify(entities)}`);
    loggingService.logChatbotAction('entities_extracted', {
      intent: result.intent,
      method: result.method,
      extractedItems: entities,
      usedAiModel
    }, userIp);

    const isUnclearIntent = result.intent === 'fallback' || result.method === 'fallback';
    const unclearCount = updateUnclearCount(userIp, isUnclearIntent);
    if (isUnclearIntent && unclearCount >= UNCLEAR_INTENT_LIMIT) {
      console.log(` [ESCALATE] Unclear intent ${unclearCount}x — transferring to human operator`);
      result.intent = 'transfer_to_human';
      result.confidence = 1.0;
      result.response = null;
    }
    let actionResult = null;

    switch (result.intent) {

      // =====================================================================
      // SHOPPING LIST - ADD (with duplicate detection)
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.SHOPPING_LIST_ADD: {
        const lang_add = result.detectedLanguage || language || 'en';
        // Only require auth if this is a genuine shopping list add request (has an item entity)
        // Prevents misclassified general messages from triggering the auth flow
        if (entities.item) {
          if (requireAuth(userIp, result.intent, text, lang_add, res)) return;
          const lang = lang_add;
          console.log(` API: Checking duplicates before adding "${entities.item}"...`);
          try {
            // Fetch current list to check for duplicates
            const listResult = await vogoApi.getShoppingList(lang);
            const existingItems = listResult.items || [];
            const newItemLower = entities.item.toLowerCase().trim();

            // Find if an item with the same base name already exists
            const duplicate = existingItems.find(i => {
              const existingName = (i.product_name || i.name || i.title || '').toLowerCase().trim();
              // Exact match OR existing name is contained in new item text
              return existingName === newItemLower || newItemLower === existingName ||
                (existingName.length > 2 && newItemLower.startsWith(existingName));
            });

            if (duplicate) {
              const existingName = (duplicate.product_name || duplicate.name || duplicate.title || '').toLowerCase().trim();
              // Check if the new item has more specific context (e.g. "milk for baby" vs "milk")
              if (isMoreSpecificItem(existingName, newItemLower)) {
                // Different item with extra context — add directly without asking
                console.log(` More specific item detected, adding directly: "${entities.item}"`);
                const apiResult = await vogoApi.addShoppingItem(entities.item, 1, null, null, null, lang);
                actionResult = { success: apiResult.success, message: apiResult.message, item: apiResult.item, overrideResponse: true };
              } else {
                // Same item — ask for confirmation
                console.log(` Duplicate found: "${existingName}", asking user to confirm`);
                setPending(userIp, { action: 'confirm_add_shopping_item', item: entities.item, lang });
                const dupMsgs = {
                  en: `"${entities.item}" is already in your shopping list. Do you still want to add it again?`,
                  ro: `"${entities.item}" este deja în lista de cumpărături. Vrei totuși să îl adaugi din nou?`,
                  it: `"${entities.item}" è già nella tua lista della spesa. Vuoi aggiungerlo di nuovo?`,
                  fr: `"${entities.item}" est déjà dans votre liste de courses. Voulez-vous l'ajouter à nouveau ?`,
                  de: `"${entities.item}" ist bereits in Ihrer Einkaufsliste. Möchten Sie es trotzdem erneut hinzufügen?`
                };
                actionResult = { success: true, message: dupMsgs[lang] || dupMsgs['en'], overrideResponse: true, awaitingConfirmation: true };
              }
            } else {
              // No duplicate — add directly
              console.log(` No duplicate, adding "${entities.item}"...`);
              const apiResult = await vogoApi.addShoppingItem(entities.item, 1, null, null, null, lang);
              actionResult = { success: apiResult.success, message: apiResult.message, item: apiResult.item, overrideResponse: true };
              console.log(`${apiResult.success ? '' : ''} ${apiResult.message}`);
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to add item: ${error.message}`, overrideResponse: true };
          }
        } else {
          const lang = result.detectedLanguage || language || 'en';
          const askMsgs = {
            en: "What would you like to add to your shopping list?",
            ro: "Ce doreti s adaugi Ã®n lista de cumprturi?",
            it: "Cosa vuoi aggiungere alla lista della spesa?",
            fr: "Que voulez-vous ajouter Ã  votre liste de courses?",
            de: "Was mÃ¶chten Sie zur Einkaufsliste hinzufÃ¼gen?"
          };
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // SHOPPING LIST - SHOW
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.SHOPPING_LIST_SHOW: {
        const lang_show = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang_show, res)) return;
        console.log(` API: Getting shopping list...`);
        try {
          const apiResult = await vogoApi.getShoppingList(result.detectedLanguage || language);
          const mappedItems = (apiResult.items || []).map(item => ({
            id: item.id || item.item_id || item.list_id,
            name: item._name || item.product_name || item.item_name || item.name || item.title || item.item_text || item.product || 'Item',
            quantity: item.quantity || item.qty || 1,
            done: item._done === true,        // boolean — already parsed by vogoApi parseDone()
            done_checked: item._done ? 1 : 0  // numeric form for chatbot.js parseDone() fallback
          }));
          console.log(` Done items sent to UI: [${mappedItems.filter(i => i.done).map(i => `${i.name}(id:${i.id})`).join(', ') || 'none'}]`);
          console.log(` You have ${mappedItems.length} items in your shopping list`);
          actionResult = {
            success: apiResult.success,
            message: apiResult.message,
            items: mappedItems
          };
          console.log(`${apiResult.success ? '' : ''} ${apiResult.message}`);
        } catch (error) {
          console.error(' API Error:', error.message);
          actionResult = { success: false, message: `Failed to get shopping list: ${error.message}`, items: [] };
        }
        break;
      }

      // =====================================================================
      // SHOPPING LIST - DELETE
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.SHOPPING_LIST_DELETE:
      case 'shopping_list_delete': {
        const lang = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang, res)) return;
        if (entities.item) {
          console.log(` API: Deleting "${entities.item}" from shopping list...`);
          try {
            const listResult = await vogoApi.getShoppingList(lang);
            const items = listResult.items || [];
            const searchName = (entities.item || '').toLowerCase().trim();

            let found = null;

            // Index-based: "delete item 1", "remove 2", "delete #3", "delete first" → searchName = "1"/"2"/"3"
            const idxMatch = searchName.match(/^(?:item\s+|point\s+|number\s+|no\.?\s*|#\s*|entry\s+|row\s+|line\s+|position\s+|produsul\s+|articolul\s+|elementul\s+|articolo\s+|elemento\s+|article\s+|artikel\s+|eintrag\s+)?(\d+)$/i);
            if (idxMatch) {
              const idx = parseInt(idxMatch[1]) - 1;
              found = items[idx] || null;
              console.log(` Index-based delete: #${idx + 1} = ${found ? (found.product_name || found.name || 'item') : 'not found'}`);
            } else {
              // Name-based search
              found = items.find(i => {
                const name = (i.product_name || i.name || i.title || '').toLowerCase();
                return name.includes(searchName) || searchName.includes(name);
              });
            }

            if (found) {
              const itemId = found.id || found.item_id;
              const foundName = found.product_name || found.name || found.title || entities.item;
              const deleteResult = await vogoApi.deleteShoppingItem(itemId);
              const deleteMsgs = {
                en: `Removed "${foundName}" from your shopping list!`,
                ro: `Am șters "${foundName}" din lista de cumpărături!`,
                it: `"${foundName}" rimosso dalla lista della spesa!`,
                fr: `"${foundName}" supprimé de votre liste de courses!`,
                de: `"${foundName}" wurde aus der Einkaufsliste entfernt!`
              };
              actionResult = { success: deleteResult.success, message: deleteMsgs[lang] || deleteMsgs['en'], overrideResponse: true };
              console.log(` Deleted item ID ${itemId}: ${foundName}`);
            } else {
              const notFoundMsgs = {
                en: `I couldn't find item "${entities.item}" in your shopping list.`,
                ro: `Nu am găsit "${entities.item}" în lista de cumpărături.`,
                it: `Non ho trovato "${entities.item}" nella lista della spesa.`,
                fr: `Je n'ai pas trouvé "${entities.item}" dans votre liste de courses.`,
                de: `"${entities.item}" wurde nicht in Ihrer Einkaufsliste gefunden.`
              };
              actionResult = { success: false, message: notFoundMsgs[lang] || notFoundMsgs['en'], overrideResponse: true };
              console.log(` Item "${entities.item}" not found in list`);
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to remove item: ${error.message}`, overrideResponse: true };
          }
        } else {
          const askMsgs = {
            en: "Which item would you like to remove? You can say the name or 'delete item 1', 'delete item 2', etc.",
            ro: "Ce produs dorești să ștergi? Poți spune numele sau 'șterge produsul 1', etc.",
            it: "Quale articolo vuoi rimuovere? Puoi dire il nome o 'elimina articolo 1', ecc.",
            fr: "Quel article voulez-vous supprimer? Vous pouvez dire le nom ou 'supprimer article 1', etc.",
            de: "Welchen Artikel möchten Sie entfernen? Sie können den Namen oder 'lösche Artikel 1' sagen."
          };
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // SHOPPING LIST - MARK DONE
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.SHOPPING_LIST_MARK_DONE:
      case 'shopping_list_mark_done': {
        const lang = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang, res)) return;
        if (entities.item) {
          console.log(` API: Marking "${entities.item}" as done in shopping list...`);
          try {
            const listResult = await vogoApi.getShoppingList(lang);
            const items = listResult.items || [];
            const searchName = (entities.item || '').toLowerCase().trim();
            const nameOf = i => (i._name || i.product_name || i.name || i.title || '').toLowerCase();

            // Index-based: "mark complete point 3 in shopping list" → searchName = "3"
            const idxMatch = searchName.match(/^(?:point|item|number|no\.?|#)?\s*(\d+)$/i);
            let found;
            if (idxMatch) {
              const idx = parseInt(idxMatch[1]) - 1;
              found = items[idx] || null;
              console.log(` Index-based shopping match: #${idx + 1} = ${found ? nameOf(found) : 'not found'}`);
            } else {
              // Smart match: prefer UNCHECKED items first when marking done
              const wordRegex = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
              const findSmartMatch = (items, preferUnchecked) => {
                const pool = preferUnchecked ? items.filter(i => !i._done) : items;
                const fallback = preferUnchecked ? items : [];
                let m = pool.find(i => nameOf(i) === searchName) || fallback.find(i => nameOf(i) === searchName);
                if (m) return m;
                m = pool.find(i => wordRegex.test(nameOf(i))) || fallback.find(i => wordRegex.test(nameOf(i)));
                if (m) return m;
                if (searchName.length >= 3) {
                  m = pool.find(i => nameOf(i).includes(searchName)) || fallback.find(i => nameOf(i).includes(searchName));
                  if (m) return m;
                }
                return null;
              };
              found = findSmartMatch(items, true);
            }
            if (found) {
              const itemId = found.id || found.item_id;
              const foundName = nameOf(found) || entities.item;
              const doneResult = await vogoApi.markShoppingItemDone(itemId);
              const doneMsgs = {
                en: `Marked "${foundName}" as done in your shopping list!`,
                ro: `Am marcat "${foundName}" ca finalizat în lista de cumpărături!`,
                it: `"${foundName}" segnato come fatto nella lista della spesa!`,
                fr: `"${foundName}" marqué comme fait dans votre liste de courses!`,
                de: `"${foundName}" als erledigt markiert in Ihrer Einkaufsliste!`
              };
              actionResult = { success: doneResult.success, message: doneMsgs[lang] || doneMsgs['en'], overrideResponse: true, markedItem: foundName, markedId: itemId, markedType: 'shopping' };
              console.log(` Marked item ID ${itemId} as done: ${foundName}`);
            } else {
              const notFoundMsgs = {
                en: `I couldn't find "${entities.item}" in your shopping list.`,
                ro: `Nu am găsit "${entities.item}" în lista de cumpărături.`,
                it: `Non ho trovato "${entities.item}" nella lista della spesa.`,
                fr: `Je n'ai pas trouvé "${entities.item}" dans votre liste de courses.`,
                de: `"${entities.item}" wurde nicht in Ihrer Einkaufsliste gefunden.`
              };
              actionResult = { success: false, message: notFoundMsgs[lang] || notFoundMsgs['en'], overrideResponse: true };
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to mark item: ${error.message}`, overrideResponse: true };
          }
        } else {
          const askMsgs = {
            en: "Which item would you like to mark as done?",
            ro: "Ce produs dorești să marchezi ca finalizat?",
            it: "Quale articolo vuoi segnare come fatto?",
            fr: "Quel article voulez-vous marquer comme fait?",
            de: "Welchen Artikel möchten Sie als erledigt markieren?"
          };
          setPending(userIp, { action: 'awaiting_shopping_mark_done_item', lang });
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // SHOPPING LIST - UNMARK DONE
      // =====================================================================
      case 'shopping_list_unmark_done': {
        const lang = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang, res)) return;
        if (entities.item) {
          console.log(` API: Unmarking "${entities.item}" in shopping list...`);
          try {
            const listResult = await vogoApi.getShoppingList(lang);
            const items = listResult.items || [];
            const searchName = (entities.item || '').toLowerCase().trim();
            const nameOfU = i => (i._name || i.product_name || i.name || i.title || '').toLowerCase();

            // Index-based: "unmark point 3 in shopping list" → searchName = "3"
            const idxMatchU = searchName.match(/^(?:point|item|number|no\.?|#)?\s*(\d+)$/i);
            let found;
            if (idxMatchU) {
              const idx = parseInt(idxMatchU[1]) - 1;
              found = items[idx] || null;
              console.log(` Index-based unmark match: #${idx + 1} = ${found ? nameOfU(found) : 'not found'}`);
            } else {
              // Smart match: prefer CHECKED items first when unmarking
              const wordRegexU = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
              const findSmartUnmark = (items) => {
                const checkedPool = items.filter(i => i._done);
                const allPool = items;
                let m = checkedPool.find(i => nameOfU(i) === searchName) || allPool.find(i => nameOfU(i) === searchName);
                if (m) return m;
                m = checkedPool.find(i => wordRegexU.test(nameOfU(i))) || allPool.find(i => wordRegexU.test(nameOfU(i)));
                if (m) return m;
                if (searchName.length >= 3) {
                  m = checkedPool.find(i => nameOfU(i).includes(searchName)) || allPool.find(i => nameOfU(i).includes(searchName));
                  if (m) return m;
                }
                return null;
              };
              found = findSmartUnmark(items);
            }
            if (found) {
              const itemId = found.id || found.item_id;
              const foundNameU = nameOfU(found) || entities.item;
              const unmarkResult = await vogoApi.unmarkShoppingItemDone(itemId);
              const unmarkMsgs = {
                en: `Unmarked "${foundNameU}" in your shopping list!`,
                ro: `Am demarcat "${foundNameU}" din lista de cumpărături!`,
                it: `"${foundNameU}" deselezionato nella lista della spesa!`,
                fr: `"${foundNameU}" décoché dans votre liste de courses!`,
                de: `"${foundNameU}" wurde in der Einkaufsliste abgehakt!`
              };
              actionResult = { success: unmarkResult.success, message: unmarkMsgs[lang] || unmarkMsgs['en'], overrideResponse: true, markedItem: foundNameU, markedId: itemId, markedType: 'shopping', isUnmark: true };
              console.log(` Unmarked item ID ${itemId}: ${foundNameU}`);
            } else {
              const notFoundMsgs = {
                en: `I couldn't find a checked "${entities.item}" in your shopping list.`,
                ro: `Nu am găsit "${entities.item}" bifat în lista de cumpărături.`,
                it: `Non ho trovato "${entities.item}" selezionato nella lista.`,
                fr: `Je n'ai pas trouvé "${entities.item}" coché dans votre liste.`,
                de: `"${entities.item}" wurde nicht als erledigt in der Liste gefunden.`
              };
              actionResult = { success: false, message: notFoundMsgs[lang] || notFoundMsgs['en'], overrideResponse: true };
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to unmark item: ${error.message}`, overrideResponse: true };
          }
        } else {
          const askMsgs = {
            en: "Which item would you like to unmark?",
            ro: "Ce produs dorești să demarezi?",
            it: "Quale articolo vuoi deselezionare?",
            fr: "Quel article voulez-vous décocher?",
            de: "Welchen Artikel möchten Sie abhaken?"
          };
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // AGENDA - ADD
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.AGENDA_ADD: {
        const lang_agadd = result.detectedLanguage || language || 'en';
        // Only require auth if this is a genuine agenda add (has an event entity)
        if (entities.event) {
          if (requireAuth(userIp, result.intent, text, lang_agadd, res)) return;
          const { event: cleanEvent, datetime: extractedDatetime } = extractEventAndDatetime(entities.event, entities.date);
          let eventDatetime = extractedDatetime || parseHumanDateToMysql(entities.date);

          if (!eventDatetime) {
            const relativeDateInText = text.match(/(?:after|in)\s+\d+\s*(?:day|days|week|weeks|month|months)|(?:\d+\s*(?:day|days|week|weeks|month|months)\s+from\s+now)/i);
            if (relativeDateInText) eventDatetime = parseHumanDateToMysql(relativeDateInText[0]);
          }

          if (!eventDatetime) {
            const namedDateInText = text.match(/\b(tomorrow|tonight|next\s+week|next\s+month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s+\w+\s+\d{4})\b/i);
            if (namedDateInText) eventDatetime = parseHumanDateToMysql(namedDateInText[1]);
          }

          const pad = (n) => String(n).padStart(2, '0');
          const todayDate = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
          eventDatetime = eventDatetime || todayDate;

          let eventName = cleanEvent || entities.event;
          eventName = eventName
            .replace(/(?:after|in)\s+\d+\s*(?:day|days|week|weeks|month|months)/gi, '')
            .replace(/\d+\s*(?:day|days|week|weeks|month|months)\s+from\s+now/gi, '')
            .replace(/\b(tomorrow|tonight|today|next\s+week|next\s+month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
            .replace(/\s+/g, ' ').trim();
          if (!eventName) eventName = 'event';

          const confirmDate = (() => {
            try {
              const d = new Date(eventDatetime + 'T00:00:00');
              return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            } catch (e) { return eventDatetime; }
          })();

          console.log(` API: Adding "${eventName}" to calendar on ${eventDatetime}...`);
          try {
            const apiResult = await vogoApi.addAgendaItem(eventName, eventDatetime, null, null, null, result.detectedLanguage || language);
            const confirmLang = result.detectedLanguage || language || 'en';
            const confirmMsgs = {
              en: `Added "${eventName}" to your calendar for ${confirmDate} `,
              ro: `Am adugat "${eventName}" Ã®n calendar pe ${confirmDate} `,
              it: `"${eventName}" aggiunto al calendario per ${confirmDate} `,
              fr: `"${eventName}" ajoutÃ© au calendrier pour le ${confirmDate} `,
              de: `"${eventName}" wurde fÃ¼r ${confirmDate} im Kalender eingetragen `
            };
            actionResult = {
              success: apiResult.success,
              message: apiResult.success ? (confirmMsgs[confirmLang] || confirmMsgs['en']) : apiResult.message,
              event: apiResult.event
            };
            console.log(`${apiResult.success ? '' : ''} ${actionResult.message}`);
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to add event: ${error.message}` };
          }
        }
        break;
      }

      // =====================================================================
      // AGENDA - DELETE
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.AGENDA_DELETE:
      case 'agenda_delete': {
        const lang = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang, res)) return;
        if (entities.event) {
          console.log(` API: Deleting event "${entities.event}" from calendar...`);
          try {
            const agendaResult = await vogoApi.getAgendaItems(null, null, lang);
            const events = agendaResult.events || [];
            const searchName = (entities.event || '').toLowerCase().trim();
            const found = events.find(e => {
              const name = (e.event_name || e.name || e.title || '').toLowerCase();
              return name.includes(searchName) || searchName.includes(name);
            });
            if (found) {
              const eventId = found.id || found.event_id;
              const deleteResult = await vogoApi.deleteAgendaItem(eventId);
              const deleteMsgs = {
                en: `Removed "${entities.event}" from your calendar!`,
                ro: `Am șters "${entities.event}" din calendar!`,
                it: `"${entities.event}" rimosso dal calendario!`,
                fr: `"${entities.event}" supprimé de votre agenda!`,
                de: `"${entities.event}" wurde aus dem Kalender entfernt!`
              };
              actionResult = { success: deleteResult.success, message: deleteMsgs[lang] || deleteMsgs['en'], overrideResponse: true };
              console.log(` Deleted event ID ${eventId}: ${entities.event}`);
            } else {
              const notFoundMsgs = {
                en: `I couldn't find "${entities.event}" in your calendar.`,
                ro: `Nu am găsit "${entities.event}" în calendar.`,
                it: `Non ho trovato "${entities.event}" nel calendario.`,
                fr: `Je n'ai pas trouvé "${entities.event}" dans votre agenda.`,
                de: `"${entities.event}" wurde nicht im Kalender gefunden.`
              };
              actionResult = { success: false, message: notFoundMsgs[lang] || notFoundMsgs['en'], overrideResponse: true };
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to delete event: ${error.message}`, overrideResponse: true };
          }
        } else {
          const askMsgs = {
            en: "Which event would you like to remove from your calendar?",
            ro: "Ce eveniment dorești să ștergi din calendar?",
            it: "Quale evento vuoi rimuovere dal calendario?",
            fr: "Quel événement voulez-vous supprimer de votre agenda?",
            de: "Welches Ereignis möchten Sie aus dem Kalender entfernen?"
          };
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // AGENDA - MARK DONE
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.AGENDA_MARK_DONE:
      case 'agenda_mark_done': {
        const lang = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang, res)) return;
        if (entities.event) {
          console.log(` API: Marking event "${entities.event}" as done...`);
          try {
            const agendaResult = await vogoApi.getAgendaItems(null, null, lang);
            const events = agendaResult.events || [];
            const searchName = (entities.event || '').toLowerCase().trim();

            // Support index-based: "mark complete point 2"
            const idxMatch = searchName.match(/^(?:point|item|number|no\.?|#)?\s*(\d+)$/i);
            let found;
            if (idxMatch) {
              const idx = parseInt(idxMatch[1]) - 1;
              found = events[idx] || null;
              console.log(` Index-based agenda match: #${idx + 1} = ${found ? (found.event_name || found.name) : 'not found'}`);
            } else {
              // FIX: Smart match — prefer UNDONE events first (same name, not yet marked)
              // "mark complete dentist appointment" with 3 dentist entries → marks the FIRST UNDONE one
              // _done field normalized by vogoApi (parseDoneVal removed — use e._done directly)
              const nameOf = e => (e.event_name || e.name || e.title || '').toLowerCase();
              const wordRe = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');

              const findSmartEvent = () => {
                // 1. Exact name match — undone first
                let m = events.find(e => !e._done && nameOf(e) === searchName);
                if (m) return m;
                m = events.find(e => nameOf(e) === searchName); // exact, any done state
                if (m) return m;
                // 2. Word boundary match — undone first
                m = events.find(e => !e._done && wordRe.test(nameOf(e)));
                if (m) return m;
                m = events.find(e => wordRe.test(nameOf(e)));
                if (m) return m;
                // 3. Contains match — undone first
                m = events.find(e => !e._done && (nameOf(e).includes(searchName) || searchName.includes(nameOf(e))));
                if (m) return m;
                m = events.find(e => nameOf(e).includes(searchName) || searchName.includes(nameOf(e)));
                return m || null;
              };
              found = findSmartEvent();
            }

            if (found) {
              const eventId = found.id || found.event_id;
              const foundName = found.event_name || found.name || entities.event;
              const doneResult = await vogoApi.markAgendaItemDone(eventId);
              const doneMsgs = {
                en: `Marked "${foundName}" as done in your calendar!`,
                ro: `Am marcat "${foundName}" ca finalizat în calendar!`,
                it: `"${foundName}" segnato come fatto nel calendario!`,
                fr: `"${foundName}" marqué comme fait dans votre agenda!`,
                de: `"${foundName}" als erledigt markiert im Kalender!`
              };
              actionResult = { success: doneResult.success, message: doneMsgs[lang] || doneMsgs['en'], overrideResponse: true };
              console.log(` Marked event ID ${eventId} as done: ${foundName}`);
            } else {
              const notFoundMsgs = {
                en: `I couldn't find "${entities.event}" in your calendar.`,
                ro: `Nu am găsit "${entities.event}" în calendar.`,
                it: `Non ho trovato "${entities.event}" nel calendario.`,
                fr: `Je n'ai pas trouvé "${entities.event}" dans votre agenda.`,
                de: `"${entities.event}" wurde nicht im Kalender gefunden.`
              };
              actionResult = { success: false, message: notFoundMsgs[lang] || notFoundMsgs['en'], overrideResponse: true };
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to mark event: ${error.message}`, overrideResponse: true };
          }
        } else {
          const askMsgs = {
            en: "Which event would you like to mark as done?",
            ro: "Ce eveniment dorești să marchezi ca finalizat?",
            it: "Quale evento vuoi segnare come fatto?",
            fr: "Quel événement voulez-vous marquer comme fait?",
            de: "Welches Ereignis möchten Sie als erledigt markieren?"
          };
          // Store pending so the user's next reply is treated as the event name
          setPending(userIp, { action: 'awaiting_agenda_mark_done_event', lang });
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // AGENDA - UNMARK DONE
      // =====================================================================
      case 'agenda_unmark_done': {
        const lang = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang, res)) return;
        if (entities.event) {
          console.log(` API: Unmarking event "${entities.event}" in calendar...`);
          try {
            const agendaResult = await vogoApi.getAgendaItems(null, null, lang);
            const events = agendaResult.events || [];
            const searchName = (entities.event || '').toLowerCase().trim();
            // _done field normalized by vogoApi (use e._done directly)
            const nameOf = e => (e.event_name || e.name || e.title || '').toLowerCase();
            const wordRe = new RegExp('\\b' + searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');

            // Smart match: prefer DONE (checked) events first when unmarking
            const findSmartUnmarkEvent = () => {
              const donePool = events.filter(e => e._done);
              const allPool = events;
              let m = donePool.find(e => nameOf(e) === searchName) || allPool.find(e => nameOf(e) === searchName);
              if (m) return m;
              m = donePool.find(e => wordRe.test(nameOf(e))) || allPool.find(e => wordRe.test(nameOf(e)));
              if (m) return m;
              m = donePool.find(e => nameOf(e).includes(searchName) || searchName.includes(nameOf(e)));
              if (m) return m;
              m = allPool.find(e => nameOf(e).includes(searchName) || searchName.includes(nameOf(e)));
              return m || null;
            };
            const found = findSmartUnmarkEvent();

            if (found) {
              const eventId = found.id || found.event_id;
              const foundName = found.event_name || found.name || entities.event;
              const unmarkResult = await vogoApi.unmarkAgendaItemDone(eventId);
              const unmarkMsgs = {
                en: `Unmarked "${foundName}" in your calendar!`,
                ro: `Am demarcat "${foundName}" din calendar!`,
                it: `"${foundName}" deselezionato nel calendario!`,
                fr: `"${foundName}" décoché dans votre agenda!`,
                de: `"${foundName}" wurde im Kalender abgehakt!`
              };
              actionResult = { success: unmarkResult.success, message: unmarkMsgs[lang] || unmarkMsgs['en'], overrideResponse: true, markedItem: foundName, markedId: eventId, markedType: 'agenda', isUnmark: true };
              console.log(` Unmarked event ID ${eventId}: ${foundName}`);
            } else {
              const notFoundMsgs = {
                en: `I couldn't find a checked "${entities.event}" in your calendar.`,
                ro: `Nu am găsit "${entities.event}" bifat în calendar.`,
                it: `Non ho trovato "${entities.event}" selezionato nel calendario.`,
                fr: `Je n'ai pas trouvé "${entities.event}" coché dans votre agenda.`,
                de: `"${entities.event}" wurde nicht als erledigt im Kalender gefunden.`
              };
              actionResult = { success: false, message: notFoundMsgs[lang] || notFoundMsgs['en'], overrideResponse: true };
            }
          } catch (error) {
            console.error(' API Error:', error.message);
            actionResult = { success: false, message: `Failed to unmark event: ${error.message}`, overrideResponse: true };
          }
        } else {
          const askMsgs = {
            en: "Which calendar event would you like to unmark?",
            ro: "Ce eveniment dorești să demarezi din calendar?",
            it: "Quale evento vuoi deselezionare dal calendario?",
            fr: "Quel événement voulez-vous décocher de votre agenda?",
            de: "Welches Ereignis möchten Sie im Kalender abhaken?"
          };
          setPending(userIp, { action: 'awaiting_agenda_unmark_done_event', lang });
          actionResult = { success: true, message: askMsgs[lang] || askMsgs['en'], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // AGENDA - SHOW
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.AGENDA_SHOW: {
        const lang_agshow = result.detectedLanguage || language || 'en';
        if (requireAuth(userIp, result.intent, text, lang_agshow, res)) return;
        console.log(` API: Getting agenda...`);
        try {
          const apiResult = await vogoApi.getAgendaItems(null, null, result.detectedLanguage || language);
          let events = (apiResult.events || []).map(event => ({
            id: event.id || event.event_id,
            name: event.event_name || event.name || event.title,
            datetime: event.event_datetime || event.datetime,
            location: event.location,
            done: event._done !== undefined ? event._done : (event.done_checked === 1 || event.done_checked === '1' || event.done_checked === true || !!(event.is_done || event.done || event.completed))
          }));
          const term = (entities.searchTerm || '').trim().toLowerCase();
          if (term) events = events.filter(e => String(e.name || '').toLowerCase().includes(term));
          actionResult = {
            success: apiResult.success,
            message: term ? `Found ${events.length} event(s) for "${term}"` : `You have ${events.length} events in your calendar`,
            events
          };
          console.log(`${apiResult.success ? '' : ''} ${actionResult.message}`);
        } catch (error) {
          console.error(' API Error:', error.message);
          actionResult = { success: false, message: `Failed to get agenda: ${error.message}`, events: [] };
        }
        break;
      }

      // =====================================================================
      // PRODUCT SEARCH
      // =====================================================================
      case CONSTANTS.NLP.INTENTS.SEARCH_PRODUCT: {
        const searchTerm = (entities.searchTerm || '').trim();
        const searchLang = result.detectedLanguage || language || 'en';

        if (!searchTerm) {
          // No valid search term extracted — route to Groq as a general/conversational message.
          // This handles cases like "I want to fix my bicycle" being misclassified as search_product.
          // NOTE: requireAuth is NOT called here — no searchTerm means this is not a real search request.
          console.log(` No searchTerm extracted — routing to Groq as general_knowledge`);
          result.intent = 'general_knowledge';
          result.method = 'groq_llm';
          // actionResult stays null; the Groq fallback block below will handle the response.
          break;
        }

        // Only require auth for genuine search requests (searchTerm is present)
        if (requireAuth(userIp, result.intent, text, searchLang, res)) return;

        console.log(` API: Searching for "${searchTerm}" (30s timeout)...`);
        try {
          const apiResult = await vogoApi.searchProducts(searchTerm);
          if (apiResult.success) {
            const products = (apiResult.products || []).map(p => ({
              type: p.type,
              title: p.title || p.product_title || p.name,
              link: p.link || p.product_link || p.url
            }));
            const foundCount = products.length;
            const friendlyMsgs = {
              en: foundCount > 0 ? `Found ${foundCount} result(s) for "${searchTerm}" 🔍` : `No results found for "${searchTerm}". Try a different term?`,
              ro: foundCount > 0 ? `Am găsit ${foundCount} rezultat(e) pentru "${searchTerm}" 🔍` : `Niciun rezultat pentru "${searchTerm}". Încearcă alt termen?`,
              it: foundCount > 0 ? `Trovati ${foundCount} risultato/i per "${searchTerm}" 🔍` : `Nessun risultato per "${searchTerm}". Prova un termine diverso?`,
              fr: foundCount > 0 ? `${foundCount} résultat(s) trouvé(s) pour "${searchTerm}" 🔍` : `Aucun résultat pour "${searchTerm}". Essayez un autre terme?`,
              de: foundCount > 0 ? `${foundCount} Ergebnis(se) für "${searchTerm}" gefunden 🔍` : `Keine Ergebnisse für "${searchTerm}". Anderen Begriff versuchen?`
            };
            actionResult = {
              success: true,
              message: friendlyMsgs[searchLang] || friendlyMsgs['en'],
              results: products,
              overrideResponse: true
            };
            console.log(` Search: ${foundCount} results for "${searchTerm}"`);
          } else {
            const isTimeout = (apiResult.error || '').includes('timed out');
            const timeoutMsgs = { en: `The search is taking longer than usual. Please try again! ⏳`, ro: `Căutarea durează mai mult. Te rog încearcă din nou! ⏳`, it: `La ricerca richiede più tempo. Riprova! ⏳`, fr: `La recherche prend plus de temps. Veuillez réessayer! ⏳`, de: `Die Suche dauert länger. Bitte versuchen Sie es erneut! ⏳` };
            const noResultMsgs = { en: `Sorry, no results for "${searchTerm}". Try a different term?`, ro: `Scuze, fără rezultate pentru "${searchTerm}". Încearcă alt termen?`, it: `Nessun risultato per "${searchTerm}". Prova un termine diverso?`, fr: `Aucun résultat pour "${searchTerm}". Essayez un autre terme?`, de: `Keine Ergebnisse für "${searchTerm}". Anderen Begriff versuchen?` };
            actionResult = { success: false, message: isTimeout ? (timeoutMsgs[searchLang] || timeoutMsgs['en']) : (noResultMsgs[searchLang] || noResultMsgs['en']), results: [], overrideResponse: true };
            console.log(` Search failed: ${apiResult.error}`);
          }
        } catch (error) {
          console.error(' API Error:', error.message);
          actionResult = { success: false, message: `Search failed: ${error.message}`, results: [], overrideResponse: true };
        }
        break;
      }

      // =====================================================================
      // FAREWELL / SMALL TALK / FEEDBACK
      // =====================================================================
      // =====================================================================
      // USER CONNECT - Auth required for account-specific features
      // =====================================================================
      case 'user_connect': {
        const lang = result.detectedLanguage || language || 'en';
        // Check if user is already authenticated
        if (authSession.isAuthenticated(userIp)) {
          const alreadyMsgs = {
            en: 'You are already connected! You can use shopping list, calendar, and product search.',
            ro: 'Esti deja conectat! Poti folosi lista de cumparaturi, calendarul si cautarea de produse.',
            it: 'Sei gia connesso! Puoi usare la lista della spesa, il calendario e la ricerca prodotti.',
            fr: 'Vous etes deja connecte! Vous pouvez utiliser la liste de courses, le calendrier et la recherche.',
            de: 'Du bist bereits verbunden! Du kannst Einkaufsliste, Kalender und Produktsuche nutzen.'
          };
          actionResult = { success: true, message: alreadyMsgs[lang] || alreadyMsgs['en'], overrideResponse: true };
        } else {
          // Start auth flow — save pending intent so we can retry after login
          authSession.startAuthFlow(userIp, result.intent, text, lang);
          const askUserMsgs = {
            en: 'Welcome! Please enter your username (email):',
            ro: 'Bine ai venit! Te rog introdu numele de utilizator (email):',
            it: 'Benvenuto! Inserisci il tuo nome utente (email):',
            fr: 'Bienvenue! Veuillez entrer votre nom d utilisateur (email):',
            de: 'Willkommen! Bitte gib deinen Benutzernamen (E-Mail) ein:'
          };
          const askMsg = askUserMsgs[lang] || askUserMsgs['en'];
          actionResult = { awaitingUsername: true, message: askMsg, overrideResponse: true };
        }
        break;
      }

      case 'farewell':
        actionResult = { success: true, message: result.response || 'Goodbye! Have a great day! ' };
        break;

      case 'small_talk':
        actionResult = { success: true, message: result.response || "I'm VOGO, your Vogo Family assistant! " };
        break;

      case 'positive_feedback':
        actionResult = { success: true, message: result.response || 'Glad I could help! Anything else?' };
        break;

      case 'negative_feedback':
        actionResult = { success: true, message: result.response || "I'm sorry! Could you rephrase that? I'll try again." };
        break;

      // =====================================================================
      // TRANSFER TO HUMAN - Live Chat via Forum API (Phase C)
      // =====================================================================
      case 'transfer_to_human': {
        const lang = result.detectedLanguage || language || 'en';
        const transferMsgs = CONSTANTS.SUCCESS_MESSAGES[lang] || CONSTANTS.SUCCESS_MESSAGES['en'] || {};

        if (!CONSTANTS.HUMAN_OPERATOR.AVAILABLE) {
          actionResult = { success: false, message: transferMsgs.TRANSFER_UNAVAILABLE || 'Human operator is currently unavailable.' };
          break;
        }

        // User must be logged in to start live chat
        if (!authSession.isAuthenticated(userIp)) {
          authSession.startAuthFlow(userIp, 'transfer_to_human', text, lang);
          const loginPrompt = {
            en: 'To connect you with a human operator, I need to verify your identity. Please enter your username:',
            ro: 'Pentru a te conecta cu un operator uman, trebuie sa verific identitatea ta. Te rog introdu numele de utilizator:',
            it: 'Per metterti in contatto con un operatore, devo verificare la tua identita. Inserisci il tuo nome utente:'
          };
          actionResult = {
            success: true,
            message: loginPrompt[lang] || loginPrompt['en'],
            awaitingUsername: true,
            overrideResponse: true
          };
          break;
        }

        // User is authenticated — start live chat thread
        const userToken = authSession.getUserToken(userIp);
        const userSession = authSession.getAuthSession(userIp);
        const userEmail = userSession.userEmail || userSession.username || 'user';

        try {
          // Always start a NEW chat session for each transfer request.
          authSession.setAuthSession(userIp, {
            liveChatThreadId: null,
            liveChatSupportUserId: null,
            liveChatSupportUserName: null
          });

          // Step 1: Get a random support user (retry up to 5 times to get preferred agent)
          let supportResult = null;
          const preferredAgentId = CONSTANTS.HUMAN_OPERATOR.PREFERRED_AGENT_ID || null;
          for (let attempt = 0; attempt < 5; attempt++) {
            supportResult = await vogoApi.getRandomSupportUser(userToken);
            if (!supportResult.success) break;
            if (!preferredAgentId || String(supportResult.supportUserId) === String(preferredAgentId)) break;
            console.log(` [TRANSFER] Got agent ${supportResult.supportUserId}, retrying for preferred ${preferredAgentId}...`);
          }
          if (!supportResult || !supportResult.success) {
            console.error(' [TRANSFER] Failed to get support user:', supportResult?.error);
            actionResult = { success: false, message: transferMsgs.TRANSFER_UNAVAILABLE || 'Human operator is currently unavailable.' };
            break;
          }

          // Start a new thread with the assigned operator
          const threadResult = await vogoApi.startChatThread(userToken, supportResult.supportUserId, userEmail);
          if (!threadResult.success) {
            console.error(' [TRANSFER] Failed to start thread:', threadResult.error);
            actionResult = { success: false, message: transferMsgs.TRANSFER_UNAVAILABLE || 'Human operator is currently unavailable.' };
            break;
          }
          const threadId = threadResult.threadId;

          console.log(` [TRANSFER] Live chat started | threadId: ${threadId} | support: ${supportResult.supportUserName}`);

          loggingService.logOperatorAction('thread_created', threadId, String(supportResult.supportUserId), `Live chat thread created: ${threadId}`, userIp);

          loggingService.logOperatorAction('transfer_started', threadId, String(supportResult.supportUserId), `User transferred to human operator: ${supportResult.supportUserName}`, userIp);

          // Store thread info in session so reconnects reuse the same thread
          authSession.setAuthSession(userIp, {
            liveChatThreadId: threadId,
            liveChatSupportUserId: String(supportResult.supportUserId),
            liveChatSupportUserName: supportResult.supportUserName || 'Support Agent'
          });

          actionResult = {
            success: true,
            liveChatStarted: true,
            threadId: threadId,
            supportUserId: String(supportResult.supportUserId),
            supportUserName: supportResult.supportUserName || 'Support Agent',
            userEmail: userSession.userEmail || '',
            message: transferMsgs.TRANSFER_CONNECTED || 'You are now connected with a support agent.',
            overrideResponse: true
          };
        } catch (err) {
          console.error(' [TRANSFER] Error:', err.message);
          actionResult = { success: false, message: transferMsgs.TRANSFER_UNAVAILABLE || 'Human operator is currently unavailable.' };
        }
        break;
      }

      case 'groq_llm':
      case 'groq_local':
        // Response already set in result.response - nothing extra needed
        break;
    }

    // =========================================================================
    // RESPONSE ASSEMBLY
    // If Groq was the primary (groq_primary method), result.response is already
    // the final conversational reply. For structured API actions (shopping list,
    // calendar, search), actionResult.message overrides it with the API outcome.
    // For offline fallback path, askGroq() still handles conversational intents.
    // =========================================================================
    const displayResponse = (actionResult && actionResult.overrideResponse && actionResult.message)
      ? actionResult.message
      : result.response;

    // Offline fallback path: if we got here via regex/NLP (Groq was down),
    // conversational intents still need a Groq response if possible
    const isOfflinePath = result.method !== 'groq_primary' && result.method !== 'offline_pattern';
    const needsGroqResponse = isOfflinePath && (
      GROQ_INTENTS.has(result.intent) ||
      !displayResponse ||
      displayResponse === 'null'
    );

    let finalResponse = displayResponse;

    if (needsGroqResponse) {
      const lang = result.detectedLanguage || language || 'en';
      if (groqEnabled) {
        console.log(` Groq fallback response -> intent=${result.intent} lang=${lang}...`);
        const groqResponse = await askGroq(text, lang, result.intent);
        if (groqResponse) {
          finalResponse = groqResponse;
          result.method = 'groq_llm';
          console.log(` Groq (${lang}): ${groqResponse.substring(0, 120)}`);
        } else {
          finalResponse = getSmartFallback(lang);
          result.method = 'fallback';
        }
      } else {
        finalResponse = displayResponse || getSmartFallback(result.detectedLanguage || language || 'en');
        result.method = displayResponse ? result.method : 'fallback';
      }
    }

    // Log conversation
    conversationLogs.push({
      timestamp: new Date().toISOString(),
      message: text,
      intent: result.intent,
      confidence: result.confidence,
      method: result.method,
      language: result.detectedLanguage || language
    });
    while (conversationLogs.length > 100) conversationLogs.shift();

    console.log(` Response: ${(finalResponse || '').substring(0, 100)}`);
    console.log(`${'='.repeat(60)}\n`);

    loggingService.logUserMessage(text, result.intent, result.confidence, result.method, result.detectedLanguage || language, userIp);

    res.json({
      success: true,
      result: {
        intent: result.intent,
        confidence: result.confidence,
        method: result.method,
        response: finalResponse,
        detectedLanguage: result.detectedLanguage || language
      },
      action: actionResult,
      entities: entities
    });

  } catch (error) {
    console.error(' NLP Error:', error);
    loggingService.logError('nlp_error', error, { text, language }, userIp);
    VARIABLES.recordError('nlp', error);
    res.json({ success: false, message: error.message });
  }
});

// ============================================================================
// PREDEFINED QA ENDPOINT
// Uses smart cache - <1ms on hit, fetches live on miss
// ============================================================================
// ============================================================================
// DIRECT MARK-DONE ENDPOINT
// Called by checkbox UI directly with item ID — no NLP parsing needed
// POST /api/mark-done  { type: 'shopping'|'agenda', id: <item_id> }
// ============================================================================
app.post('/api/mark-done', async (req, res) => {
  const { type, id, action } = req.body;
  if (!type || !id) {
    return res.json({ success: false, message: 'Missing type or id' });
  }
  const isUnmark = action === 'unmark';

  try {
    let result;
    if (type === 'shopping') {
      console.log(` [MARK-DONE] Shopping ID: ${id} | action: ${isUnmark ? 'UNMARK' : 'MARK'}`);
      result = isUnmark
        ? await vogoApi.unmarkShoppingItemDone(id)
        : await vogoApi.markShoppingItemDone(id);
    } else if (type === 'agenda') {
      console.log(` [MARK-DONE] Agenda ID: ${id} | action: ${isUnmark ? 'UNMARK' : 'MARK'}`);
      result = isUnmark
        ? await vogoApi.unmarkAgendaItemDone(id)
        : await vogoApi.markAgendaItemDone(id);
    } else {
      return res.json({ success: false, message: 'Unknown type: ' + type });
    }
    console.log(` [MARK-DONE] Result: ${result.success ? 'OK' : 'FAIL'} - ${result.message}`);
    res.json({ success: result.success, message: result.message });
  } catch (error) {
    console.error(' [MARK-DONE] Error:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// ============================================================================
// IMAGE UPLOAD ENDPOINT
// POST /api/upload-image - multipart/form-data with 'image' field
// Returns: { success: true, imageUrl: '/uploads/filename.jpg' }
// RESTRICTION: Only allowed when user is connected to a human operator
// ============================================================================
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    const session = authSession.getAuthSession(userIp);
    const liveThreadId = session?.liveChatThreadId;
    const liveSupportId = session?.liveChatSupportUserId;

    if (!liveThreadId || !liveSupportId) {
      return res.json({
        success: false,
        message: 'Image upload is only available when connected to a human operator. Please request human support first.'
      });
    }

    if (!req.file) {
      return res.json({ success: false, message: 'No image file provided' });
    }

    const imageUrl = '/uploads/' + req.file.filename;

    loggingService.logOperatorAction('image_uploaded', liveThreadId, String(liveSupportId), `Image uploaded: ${req.file.originalname} (${req.file.size} bytes)`, userIp);

    console.log(` [UPLOAD] Image uploaded: ${req.file.originalname} -> ${imageUrl} (Live Chat: Thread ${liveThreadId})`);

    res.json({
      success: true,
      imageUrl: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    loggingService.logError('upload_error', error, { filename: req.file?.originalname }, userIp);
    console.error(' [UPLOAD] Error:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// Handle multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.json({ success: false, message: 'File too large. Maximum size is 5MB.' });
    }
    return res.json({ success: false, message: 'Upload error: ' + err.message });
  } else if (err) {
    return res.json({ success: false, message: err.message });
  }
  next();
});

app.post('/api/chatbot', async (req, res) => {
  const { action, data } = req.body;
  try {
    if (action === 'getPredefinedQA') {
      const parentId = data?.parent_id ?? null;
      const lang = data?.lang || 'en';

      const cached = qaCache.get(parentId, lang);
      if (cached) {
        const age = qaCache.ageMs(parentId, lang);
        console.log(` [CACHE] Hit parent=${parentId} lang=${lang} age=${Math.round(age / 1000)}s (${cached.length} items)`);
        if (age > 8 * 60 * 1000) qaCache.backgroundRefresh(parentId, lang);
        return res.json({ success: true, data: cached, source: 'cache' });
      }

      console.log(` [QA] Cache miss - fetching from API parent=${parentId} lang=${lang}...`);
      try {
        const live = await vogoApi.fetchPredefinedQA(parentId, lang);
        const list = Array.isArray(live) ? live : Array.isArray(live?.data) ? live.data : [];
        const normalized = list.map(q => ({ ...q, text: q.text || q.question || String(q) }));
        qaCache.set(parentId, lang, normalized);
        console.log(` [QA] Fetched and cached ${normalized.length} questions`);
        return res.json({ success: true, data: normalized, source: 'api' });
      } catch (e) {
        console.error(' Predefined QA failed:', e.message);
        return res.json({ success: false, message: e.message, data: [] });
      }
    }
    return res.json({ success: false, message: 'Unknown action' });
  } catch (error) {
    console.error('API Error:', error);
    res.json({ success: false, message: error.message });
  }
});

// ============================================================================
// HUMAN OPERATOR - Proxy Endpoints (Phase C: Live Chat)
// Chatbot-side: send/receive messages in a live chat thread
// ============================================================================
app.post('/api/human-operator/messages', async (req, res) => {
  const { threadId } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userToken = authSession.getUserToken(userIp);
  const session = authSession.getAuthSession(userIp) || {};
  const supportUserId = session.liveChatSupportUserId ? String(session.liveChatSupportUserId) : null;
  const currentUserId = extractUserIdFromToken(userToken);

  if (!userToken) {
    loggingService.warn('operator_action', 'Operator messages fetch failed: not authenticated', { threadId }, userIp);
    return res.json({ success: false, message: 'Not authenticated' });
  }
  if (!threadId) {
    loggingService.warn('operator_action', 'Operator messages fetch failed: missing threadId', {}, userIp);
    return res.json({ success: false, message: 'Missing threadId' });
  }

  try {
    const result = await vogoApi.getThreadAnswers(userToken, threadId);
    if (!result.success || !Array.isArray(result.answers)) {
      loggingService.warn('operator_action', 'Failed to fetch thread messages', { threadId, error: result.error || result.message }, userIp);
      return res.json(result);
    }

    const answers = result.answers.map(msg => {
      const msgId = getMsgId(msg);
      const hintedRole = getThreadMessageRole(threadId, msgId);

      let isAgent = false;

      if (hintedRole === 'operator') {
        isAgent = true;
      } else if (hintedRole === 'user') {
        isAgent = false;
      } else if (typeof msg.isOperator === 'boolean') {
        isAgent = msg.isOperator;
      }

      return { ...msg, isAgent };
    });

    loggingService.logOperatorAction('thread_messages_fetched', threadId, supportUserId, `Fetched ${answers.length} thread messages`, userIp);
    res.json({ ...result, answers });
  } catch (err) {
    loggingService.logError('operator_error', err, { threadId, event: 'messages_fetch' }, userIp);
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/human-operator/send', async (req, res) => {
  const { threadId, message, imageUrl } = req.body;
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userToken = authSession.getUserToken(userIp);
  const session = authSession.getAuthSession(userIp) || {};
  const supportUserId = session.liveChatSupportUserId ? String(session.liveChatSupportUserId) : null;

  if (!userToken) {
    loggingService.warn('operator_action', 'User->operator send failed: not authenticated', { threadId }, userIp);
    return res.json({ success: false, message: 'Not authenticated' });
  }
  if (!threadId) {
    loggingService.warn('operator_action', 'User->operator send failed: missing threadId', { threadId }, userIp);
    return res.json({ success: false, message: 'Missing threadId' });
  }

  const messageText = message || '';
  if (!messageText && !imageUrl) {
    loggingService.warn('operator_action', 'User->operator send failed: missing message or imageUrl', { threadId }, userIp);
    return res.json({ success: false, message: 'Missing message or imageUrl' });
  }

  try {
    const currentUserId = extractUserIdFromToken(userToken);
    const fullMessage = imageUrl ? (messageText + (messageText ? '\n\n' : '') + '[image]' + imageUrl + '[/image]') : messageText;
    const result = await vogoApi.postThreadAnswer(userToken, threadId, fullMessage, imageUrl);
    if (result.success) {
      const insertId = result?.data?.insert_id || result?.data?.id || result?.data?.comment_id || null;
      if (insertId) {
        rememberThreadMessageRole(threadId, insertId, 'user');
      } else {
        scheduleThreadMessageRoleMark(userToken, threadId, fullMessage, 'user');
      }

      const logPreview = imageUrl ? `[Image] ${messageText.substring(0, 80)}` : messageText.substring(0, 120);
      loggingService.logOperatorAction('user_message_sent', threadId, supportUserId, `User sent message to operator: ${logPreview}`, userIp);
    } else {
      loggingService.warn('operator_action', 'User->operator send failed', {
        threadId,
        error: result.error || result.message,
        messagePreview: String(fullMessage).substring(0, 120)
      }, userIp);
    }
    res.json({ ...result, userId: currentUserId });
  } catch (err) {
    loggingService.logError('operator_error', err, {
      threadId,
      event: 'user_send_message',
      messagePreview: String(messageText).substring(0, 120)
    }, userIp);
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/human-operator/end-chat', (req, res) => {
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const session = authSession.getAuthSession(userIp);
  const threadId = session?.liveChatThreadId || null;
  const supportUserId = session?.liveChatSupportUserId ? String(session.liveChatSupportUserId) : null;

  if (threadId) {
    loggingService.logOperatorAction('chat_ended', threadId, supportUserId, 'Live chat ended by user', userIp);
  }

  if (session) {
    // Clear live chat state so next transfer creates a fresh thread
    authSession.setAuthSession(userIp, {
      liveChatThreadId: null,
      liveChatSupportUserId: null,
      liveChatSupportUserName: null
    });
  }
  res.json({ success: true });
});

// ============================================================================
// HUMAN OPERATOR - Dashboard Proxy Endpoints (Phase C)
// Operator dashboard: login, list threads, view/reply to messages
// ============================================================================
app.post('/api/human-operator/login', async (req, res) => {
  const { step, username, password, bearer } = req.body;

  try {
    if (step === 'get_bearer') {
      // Step 1: Get a public bearer token
      const result = await vogoApi.loginJwt();
      return res.json({ success: true, bearer: result });
    }

    if (step === 'login') {
      // Step 2: Login operator with their credentials
      const loginResult = await vogoApi.loginUserJwt(username, password);
      if (loginResult.success) {
        return res.json({
          success: true,
          token: loginResult.token,
          userEmail: loginResult.userEmail,
          userId: loginResult.userId,
          userRoles: loginResult.userRoles
        });
      }
      return res.json({ success: false, message: loginResult.message });
    }

    return res.json({ success: false, message: 'Invalid step' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/human-operator/discussions', async (req, res) => {
  const { token, page, perPage } = req.body;
  if (!token) return res.json({ success: false, message: 'Missing token' });

  try {
    const result = await vogoApi.getDiscussionsByUser(token, page || 1, perPage || 10);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/human-operator/thread-answers', async (req, res) => {
  const { token, threadId, operatorUserId, peerUserId } = req.body;
  if (!token || !threadId) return res.json({ success: false, message: 'Missing token or threadId' });

  try {
    const result = await vogoApi.getThreadAnswers(token, threadId);
    if (!result.success || !Array.isArray(result.answers)) return res.json(result);

    const opId = operatorUserId ? String(operatorUserId) : extractUserIdFromToken(token);
    const answers = result.answers.map(msg => {
      const msgId = getMsgId(msg);
      const hintedRole = getThreadMessageRole(threadId, msgId);
      let isOperator = false;

      if (hintedRole === 'operator') {
        isOperator = true;
      } else if (hintedRole === 'user') {
        isOperator = false;
      } else if (typeof msg.isOperator === 'boolean') {
        isOperator = msg.isOperator;
      }

      return { ...msg, isOperator };
    });

    res.json({ ...result, operatorUserId: opId || null, answers });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/human-operator/reply', async (req, res) => {
  const { token, threadId, message, imageUrl } = req.body;
  if (!token || !threadId) {
    loggingService.warn('operator_action', 'Operator reply failed: missing token or threadId', { threadId }, req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
    return res.json({ success: false, message: 'Missing token or threadId' });
  }

  const messageText = message || '';
  if (!messageText && !imageUrl) {
    loggingService.warn('operator_action', 'Operator reply failed: missing message or imageUrl', { threadId }, req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
    return res.json({ success: false, message: 'Missing message or imageUrl' });
  }

  try {
    const fullMessage = imageUrl ? (messageText + (messageText ? '\n\n' : '') + '[image]' + imageUrl + '[/image]') : messageText;
    const result = await vogoApi.postThreadAnswer(token, threadId, fullMessage, imageUrl);
    const operatorUserId = extractUserIdFromToken(token);
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    if (result.success) {
      const insertId = result?.data?.insert_id || result?.data?.id || result?.data?.comment_id || null;
      if (insertId) {
        rememberThreadMessageRole(threadId, insertId, 'operator');
      } else {
        scheduleThreadMessageRoleMark(token, threadId, fullMessage, 'operator');
      }

      const logPreview = imageUrl ? `[Image] ${messageText.substring(0, 80)}` : messageText.substring(0, 120);
      loggingService.logOperatorAction('operator_message_sent', threadId, operatorUserId, `Operator replied in thread: ${logPreview}`, userIp);
    } else {
      loggingService.warn('operator_action', 'Operator reply failed', {
        threadId,
        operatorUserId,
        error: result.error || result.message,
        messagePreview: String(fullMessage).substring(0, 120)
      }, userIp);
    }
    res.json(result);
  } catch (err) {
    loggingService.logError('operator_error', err, {
      threadId,
      operatorUserId: extractUserIdFromToken(token),
      event: 'operator_reply',
      messagePreview: String(messageText).substring(0, 120)
    }, req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
    res.json({ success: false, message: err.message });
  }
});

// Serve operator dashboard page
app.get('/human-operator', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'human-operator.html'));
});

// ============================================================================
// VOICE AI INTEGRATION - STT & TTS PROXY ROUTES
// Proxies requests to the Python FastAPI voice backend (port 8000)
// Python backend uses: Faster-Whisper (STT) + Edge-TTS (TTS)
// Start Python backend: cd voice-backend && python main.py
// ============================================================================
const VOICE_BACKEND_URL = process.env.VOICE_BACKEND_URL || 'http://127.0.0.1:8000';

// TTS Route - Text to Speech (STREAMING - playback starts immediately)
// POST /api/voice/tts  { text: string, language: string }
// Returns: audio/mpeg piped directly — no full-file wait
app.post('/api/voice/tts', async (req, res) => {
  try {
    const { text, language = 'en' } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const response = await fetch(`${VOICE_BACKEND_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[VOICE] TTS backend error:', response.status, errText);
      return res.status(502).json({ error: 'TTS backend unavailable', detail: errText });
    }

    // Stream directly — browser can start playing before full download completes
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');
    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length'));
    }

    // Pipe: Python backend → Node → Browser (zero extra buffering)
    const { Readable } = require('stream');
    Readable.fromWeb(response.body).pipe(res);

  } catch (err) {
    console.error('[VOICE] TTS proxy error:', err.message);
    if (!res.headersSent) {
      res.status(503).json({ error: 'Voice backend not running. Start Python backend first.', detail: err.message });
    }
  }
});

// STT Route - Speech to Text
// POST /api/voice/stt  multipart/form-data  file: audio blob
// Returns: { text: string, detected_language: string }
app.post('/api/voice/stt', (req, res) => {
  const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
  audioUpload.single('audio')(req, res, async (err) => {
    if (err) {
      console.error('[VOICE] Multer error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      console.error('[VOICE] STT: No audio file received');
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const fname = req.file.originalname || 'audio.webm';
    const mime = req.file.mimetype || 'audio/webm';
    console.log(`[VOICE] STT received: ${fname} (${req.file.size} bytes, ${mime})`);

    // Write buffer to temp file, then stream it to Python FastAPI
    const fs = require('fs');
    const os = require('os');
    const tmpPath = path.join(os.tmpdir(), `vogo_stt_${Date.now()}_${fname}`);
    try {
      fs.writeFileSync(tmpPath, req.file.buffer);

      // Use Node.js 18+ built-in FormData + Blob for clean multipart
      const { Blob } = require('buffer');
      const nativeFormData = new globalThis.FormData();
      const audioBlob = new Blob([req.file.buffer], { type: mime });
      nativeFormData.append('audio', audioBlob, fname);

      const response = await fetch(`${VOICE_BACKEND_URL}/api/stt`, {
        method: 'POST',
        body: nativeFormData
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[VOICE] STT backend error:', response.status, errText);
        return res.status(502).json({ error: 'STT backend error', detail: errText });
      }

      const data = await response.json();
      console.log(`[VOICE] STT result: "${data.text}" (lang: ${data.detected_language})`);
      res.json(data);
    } catch (err) {
      console.error('[VOICE] STT proxy error:', err.message);
      res.status(503).json({ error: 'Voice backend not running. Start Python backend first.', detail: err.message });
    } finally {
      try { require('fs').unlinkSync(tmpPath); } catch (_) { }
    }
  });
});

// Voice health check
app.get('/api/voice/status', async (req, res) => {
  try {
    const response = await fetch(`${VOICE_BACKEND_URL}/docs`, { method: 'GET' });
    res.json({ voiceBackend: response.ok ? 'online' : 'unreachable', url: VOICE_BACKEND_URL });
  } catch {
    res.json({ voiceBackend: 'offline', url: VOICE_BACKEND_URL, hint: 'Run: cd voice-backend && python main.py' });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
async function startServer() {
  const initialized = await initializeServices();
  if (!initialized) {
    console.error('\n Server startup failed');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(70));
    console.log(` Server running: http://localhost:${PORT}`);
    console.log(` Test chatbot: http://localhost:${PORT}/test.html`);
    console.log(` View logs: http://localhost:${PORT}/logs`);
    console.log(` Health check: http://localhost:${PORT}/health`);
    console.log('='.repeat(70) + '\n');
    console.log(' API-POWERED MODE:');
    console.log(' Shopping list -> REST API');
    console.log(' Calendar/agenda -> REST API');
    console.log(' Product search -> REST API');
    console.log(' Predefined QA -> REST API + Smart Cache (10min TTL)');
    console.log(` Groq LLM -> ${groqEnabled ? 'ENABLED (' + (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile') + ')' : 'DISABLED - add GROQ_API_KEY to .env'}`);
    console.log(` API Base: ${process.env.VOGO_API_BASE || 'https://vogo.family/wp-json'}`);
    console.log('\n' + '='.repeat(70) + '\n');
  });
}

process.on('SIGINT', () => {
  console.log('\n Shutting down...');
  process.exit(0);
});

startServer();