// =============================================================================
// ai_service.js - AI MODEL SWITCHER
// =============================================================================
// Supports multiple AI providers configurable per user role:
//
//   ai_rasa    - Rasa NLU HTTP API (DIET classifier). No API key needed.
//   ai_basic   - Offline only (regex + keyword + node-nlp). No API key needed.
//   ai_ollama  - Native Llama 3.1 via Ollama (runs on VPS). No API key needed.
//   ai_groq    - Groq LLM (llama-3.3-70b-versatile). Free tier.
//   ai_openai  - OpenAI GPT (gpt-4o-mini). Requires OPENAI_API_KEY.
//   ai_gemini  - Google Gemini (gemini-1.5-flash). Requires GEMINI_API_KEY.
//   ai_claude  - Anthropic Claude (claude-3-haiku-20240307). Requires ANTHROPIC_API_KEY.
//
// ROLE → MODEL MAPPING (set in .env or chatbot.ini):
//   AI_MODEL_GENERAL=ai_groq      (default for all users)
//   AI_MODEL_VIP=ai_openai        (VIP/premium users)
//
// The active model for a request is determined by:
//   1. User's JWT role (general / vip / admin)
//   2. AI_MODEL_* config in .env
//   3. Falls back to ai_basic if configured model is unavailable
//
// ALL models return the same standard response object:
//   { matched, intent, entities, confidence, method, response, detectedLanguage }
// =============================================================================

const https = require('https');
const http  = require('http');

// ---------------------------------------------------------------------------
// SHARED SYSTEM PROMPT (same intent/entity rules for all models)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Vogo, the smart AI assistant for Vogo Family - a multilingual family platform for discovering local products, managing shopping, and organizing schedules.

YOU MUST ALWAYS respond with a single valid JSON object. No text before or after. No markdown.

JSON FORMAT:
{
  "intent": "<intent_name>",
  "lang": "<2-letter language code: en/ro/it/fr/de/es/pt>",
  "entities": { <extracted data> },
  "response": "<your reply — MUST be in the same language the user wrote in>"
}

LANGUAGE DETECTION IS MANDATORY:
- Always detect language from the actual message text
- "salut"/"salutam"/"buna" = Romanian (ro)
- "ciao"/"buongiorno" = Italian (it)
- "bonjour"/"merci" = French (fr)
- "hallo"/"danke" = German (de)
- "hola" = Spanish (es)
- "hello"/"hi"/"thanks" = English (en)
- NEVER respond in English if the user did not write in English

AVAILABLE INTENTS:
- "greeting"            : hello, hi, salut, ciao, bonjour, hallo
- "farewell"            : bye, goodbye, la revedere, arrivederci
- "thanks"              : thank you, merci, grazie, danke, multumesc
- "how_are_you"         : how are you, ce mai faci, come stai, wie geht es
- "help_capabilities"   : what can you do, cosa puoi fare, was kannst du
- "small_talk"          : jokes, casual chat, are you a bot
- "general_knowledge"   : factual questions, advice, recommendations, how-to, opinions, anything that is NOT a direct platform action
- "positive_feedback"   : great, perfect, awesome, bravo, super
- "negative_feedback"   : wrong, not correct, bad, complaints
- "shopping_list_add"   : EXPLICIT command to add a specific item to shopping list — entities: { "item": "full item name with qualifiers" }
- "shopping_list_show"  : show/view shopping list — entities: {}
- "shopping_list_delete": remove item from shopping list — entities: { "item": "item name" }
- "shopping_list_mark_done": mark item as bought — entities: { "item": "item name" }
- "shopping_list_unmark_done": unmark/uncheck an item — entities: { "item": "item name" }
- "agenda_add"          : EXPLICIT command to add a specific event to calendar — entities: { "event": "event name", "date": "date as written" }
- "agenda_show"         : show calendar/agenda — entities: {}
- "agenda_delete"       : delete calendar event — entities: { "event": "event name" }
- "agenda_mark_done"    : mark event as done — entities: { "event": "event name" }
- "agenda_unmark_done"  : unmark/undo done on a calendar event — entities: { "event": "event name" }
- "search_product"      : EXPLICIT request to search/find/locate a specific product or food item on the Vogo Family platform — entities: { "searchTerm": "clean search term" }
- "user_connect"        : user wants to login, connect, sign in, or link their account — entities: {}
- "transfer_to_human"   : user explicitly wants to speak to a human, real person, live agent, customer support, or operator. Also triggered for legal, financial, medical topics, refund requests, or formal complaints — entities: { "reason": "brief reason for transfer" }
- "conversational"      : user is hungry, wants suggestions, general chat without a clear action
- "fallback"            : completely unintelligible message

CRITICAL INTENT RULES — read carefully:

search_product: ONLY use this when the user explicitly wants to SEARCH or FIND a specific product/food/item on the platform.
  ✅ search_product: "find pizza near me", "search for bread", "look up coffee shops", "where can I buy milk", "show me restaurants"
  ❌ NOT search_product: "I want a service for my car" → general_knowledge (advice/recommendation question)
  ❌ NOT search_product: "I need to fix my bike" → general_knowledge
  ❌ NOT search_product: "I want to eat something" → conversational
  ❌ NOT search_product: "I need help" → general_knowledge
  ❌ NOT search_product: "I want to learn cooking" → general_knowledge
  KEY: if the user says "I want X" or "I need X" where X is an activity, service, or general need — it is general_knowledge, NOT search_product.
  KEY: search_product requires a concrete PRODUCT or FOOD ITEM being searched, not a vague need or desire.

shopping_list_add: ONLY use when user explicitly says ADD/PUT/BUY a specific item.
  ✅ "add milk", "put eggs on my list", "buy bread" → shopping_list_add
  ❌ "I need milk" (no explicit add command) → general_knowledge or conversational
  ❌ "i need to train you better" → general_knowledge (no item, no add command)

agenda_add: ONLY use when user explicitly says ADD/SCHEDULE/REMIND a specific event.
  ✅ "add dentist appointment friday", "remind me meeting tomorrow" → agenda_add
  ❌ "I have a meeting" (no command to add) → general_knowledge

user_connect: use ONLY when user EXPLICITLY says they want to login, connect, or sign in.
  ✅ "i want to connect", "login", "sign in", "connect my account", "log in"
  ❌ NEVER use for random text, gibberish, test messages, or when user is just chatting
  ❌ NEVER use because user seems unauthenticated — only use when they explicitly ask to login

transfer_to_human: ONLY when user explicitly asks for a human/agent/operator.
  ✅ "speak to a human", "real person", "customer support", "transfer to agent"
  ❌ NEVER use for random text or gibberish

WHEN IN DOUBT — ALWAYS use "general_knowledge" or "conversational".
Random characters ("jkhkjg", "asdfgh", "zxcvbn") → use "fallback" intent.
Test/status sentences ("chat is working", "testing") → use "conversational" intent.
Information statements → use "conversational" or "general_knowledge".
NEVER trigger user_connect or transfer_to_human unless explicitly requested.

RESPONSE RULES:
- Keep "response" SHORT: 1-3 sentences, warm and natural
- For actions (shopping_list_add, agenda_add, search_product): confirm what you are doing
- For general_knowledge and conversational: give a SHORT accurate answer, then naturally suggest a relevant Vogo Family feature if it makes sense (shopping list, product search, or calendar).
  Examples:
  "Who is Obama?" → "Barack Obama was the 44th U.S. President. Planning a get-together? I can help add snacks to your shopping list! 🛒"
  "I want a service for my car" → "For car service, I'd recommend checking local garages or dealerships. Want me to search Vogo Family for car service providers near you? 🚗"
  "I need to train you better" → "I appreciate the feedback! I'm always learning. Feel free to tell me what didn't work and I'll do my best to improve. 😊"
- NEVER mention the underlying AI model name — you are simply Vogo
- NEVER use bullet points or markdown in the response field

ENTITY EXTRACTION:
- shopping_list_add: extract ONLY the item phrase, keep qualifiers but NEVER include command words or list words.
  Do NOT return the full sentence. No verbs like "add/put/buy" and no "list/cart" words.
  "add milk for baby" → { "item": "milk for baby" }
  "add organic eggs" → { "item": "organic eggs" }
  "adauga lapte in lista" → { "item": "lapte" }
- agenda_add: extract event and date as user wrote them
  "remind me doctor friday" → { "event": "doctor", "date": "friday" }
- search_product: extract ONLY the concrete product/food being searched, strip filler words
  "find pizza near me" → { "searchTerm": "pizza" }
  "look for coffee shops downtown" → { "searchTerm": "coffee shops" }`;

// ---------------------------------------------------------------------------
// Helper: make HTTPS/HTTP POST request (Promise-based, no fetch dependency)
// ---------------------------------------------------------------------------
function httpPost(hostname, path, headers, body, timeoutMs = 15000, useHttp = false) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    };
    const lib = useHttp ? http : https;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helper: parse Groq/OpenAI/Gemini JSON response from LLM text
// ---------------------------------------------------------------------------
function parseLLMJson(rawText) {
  if (!rawText) return null;
  try {
    const clean = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(clean);
  } catch(e) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch(e2) { return null; }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: build standard result object from LLM parsed JSON
// ---------------------------------------------------------------------------
function buildResult(parsed, method) {
  if (!parsed || !parsed.intent || !parsed.response) return null;
  const detectedLang = parsed.lang || parsed.detectedLanguage || 'en';
  return {
    matched: true,
    intent: parsed.intent,
    entities: parsed.entities || {},
    confidence: 0.95,
    method,
    response: parsed.response,
    detectedLanguage: detectedLang
  };
}

// =============================================================================
// PROVIDER: GROQ
// =============================================================================
async function callGroq(text, language, conversationHistory, apiKey, model) {
  const langLabels = { en:'English', ro:'Romanian', fr:'French', it:'Italian', de:'German', es:'Spanish', pt:'Portuguese' };
  const langHint = (language && language !== 'auto' && langLabels[language])
    ? `The system detected the user is writing in ${langLabels[language]}, but VERIFY from the actual text.`
    : 'Detect the language from the user message text.';
  const langInstruction = `CRITICAL: ${langHint} Your "lang" field and "response" MUST match the actual language written.`;

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const recent = (conversationHistory || []).slice(-6);
  for (const t of recent) {
    if (t.userMessage) messages.push({ role: 'user',      content: t.userMessage });
    if (t.botResponse) messages.push({ role: 'assistant', content: t.botResponse });
  }
  messages.push({ role: 'user', content: `${langInstruction}\n\nUser message: ${text}` });

  try {
    const res = await httpPost('api.groq.com', '/openai/v1/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      { model: model || 'llama-3.3-70b-versatile', messages, max_tokens: 300, temperature: 0.3, stream: false, response_format: { type: 'json_object' } }
    );
    if (res.status === 429) {
      console.warn('ai_service: Groq rate limited');
      return null;
    }
    if (res.body?.error) {
      console.error('ai_service: Groq error:', res.body.error.message);
      return null;
    }
    const raw = res.body?.choices?.[0]?.message?.content?.trim();
    return buildResult(parseLLMJson(raw), 'ai_groq');
  } catch(e) {
    console.error('ai_service: Groq call failed:', e.message);
    return null;
  }
}

// =============================================================================
// PROVIDER: OPENAI
// =============================================================================
async function callOpenAI(text, language, conversationHistory, apiKey, model) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const recent = (conversationHistory || []).slice(-6);
  for (const t of recent) {
    if (t.userMessage) messages.push({ role: 'user',      content: t.userMessage });
    if (t.botResponse) messages.push({ role: 'assistant', content: t.botResponse });
  }
  messages.push({ role: 'user', content: `Detect language from text and respond in same language.\n\nUser message: ${text}` });

  try {
    const res = await httpPost('api.openai.com', '/v1/chat/completions',
      { 'Authorization': `Bearer ${apiKey}` },
      { model: model || 'gpt-4o-mini', messages, max_tokens: 300, temperature: 0.3, response_format: { type: 'json_object' } }
    );
    if (res.status === 429) { console.warn('ai_service: OpenAI rate limited'); return null; }
    if (res.body?.error) { console.error('ai_service: OpenAI error:', res.body.error.message); return null; }
    const raw = res.body?.choices?.[0]?.message?.content?.trim();
    return buildResult(parseLLMJson(raw), 'ai_openai');
  } catch(e) {
    console.error('ai_service: OpenAI call failed:', e.message);
    return null;
  }
}

// =============================================================================
// PROVIDER: GEMINI
// =============================================================================
async function callGemini(text, language, conversationHistory, apiKey, model) {
  const modelName = model || 'gemini-1.5-flash';
  const path = `/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Build conversation turns for Gemini format
  const contents = [];
  const recent = (conversationHistory || []).slice(-6);
  for (const t of recent) {
    if (t.userMessage) contents.push({ role: 'user',  parts: [{ text: t.userMessage }] });
    if (t.botResponse) contents.push({ role: 'model', parts: [{ text: t.botResponse }] });
  }
  contents.push({ role: 'user', parts: [{ text: `Detect language from text and respond in same language. Respond ONLY with valid JSON.\n\nUser message: ${text}` }] });

  try {
    const res = await httpPost('generativelanguage.googleapis.com', path,
      {},
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 300, responseMimeType: 'application/json' }
      }
    );
    if (res.status === 429) { console.warn('ai_service: Gemini rate limited'); return null; }
    if (res.body?.error) { console.error('ai_service: Gemini error:', res.body.error.message); return null; }
    const raw = res.body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return buildResult(parseLLMJson(raw), 'ai_gemini');
  } catch(e) {
    console.error('ai_service: Gemini call failed:', e.message);
    return null;
  }
}

// =============================================================================
// PROVIDER: CLAUDE (Anthropic)
// =============================================================================
async function callClaude(text, language, conversationHistory, apiKey, model) {
  const messages = [];
  const recent = (conversationHistory || []).slice(-6);
  for (const t of recent) {
    if (t.userMessage) messages.push({ role: 'user', content: t.userMessage });
    if (t.botResponse) messages.push({ role: 'assistant', content: t.botResponse });
  }
  messages.push({ role: 'user', content: `Detect language from text and respond in same language. Respond ONLY with valid JSON.\n\nUser message: ${text}` });

  try {
    const res = await httpPost('api.anthropic.com', '/v1/messages',
      { 
        'x-api-key': apiKey, 
        'anthropic-version': '2023-06-01'
      },
      { 
        model: model || 'claude-3-haiku-20240307', 
        system: SYSTEM_PROMPT,
        messages, 
        max_tokens: 300, 
        temperature: 0.3
      }
    );
    if (res.status === 429) { console.warn('ai_service: Claude rate limited'); return null; }
    if (res.body?.error) { console.error('ai_service: Claude error:', res.body.error.message); return null; }
    const raw = res.body?.content?.[0]?.text?.trim();
    return buildResult(parseLLMJson(raw), 'ai_claude');
  } catch(e) {
    console.error('ai_service: Claude call failed:', e.message);
    return null;
  }
}

// =============================================================================
// PROVIDER: RASA NLU
// Calls Rasa HTTP API: POST /model/parse
// Returns: intent + confidence + extracted entities
// Note: Rasa NLU does NOT generate a response — Groq/Ollama handles that
// Rasa NLU API response format:
//   { "text": "...", "intent": { "name": "...", "confidence": 0.98 },
//     "entities": [ { "entity": "item", "value": "milk", ... } ] }
// =============================================================================
async function callRasa(text, language, rasaUrl) {
  // Parse Rasa URL (default: http://localhost:5005)
  const baseUrl = (rasaUrl || 'http://localhost:5005').replace(/\/+$/, '');
  const isHttp = baseUrl.startsWith('http://');
  const withoutProto = baseUrl.replace(/^https?:\/\//, '');
  const [hostPart, portStr] = withoutProto.split(':');
  const port = portStr ? parseInt(portStr) : (isHttp ? 80 : 443);

  const body = JSON.stringify({ text, lang: language || 'en' });

  return new Promise((resolve) => {
    const lib = isHttp ? http : https;
    const options = {
      hostname: hostPart,
      port,
      path: '/model/parse',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const intentName = parsed?.intent?.name;
          const confidence  = parsed?.intent?.confidence || 0;

          // Rasa confidence threshold: only use if > 0.65
          if (!intentName || intentName === 'fallback' || confidence < 0.65) {
            console.log(` ai_service [Rasa] Low confidence (${confidence.toFixed(2)}) for "${intentName}" — skipping`);
            resolve(null);
            return;
          }

          // Map Rasa entities array → our entities object
          // Rasa: [ { entity: 'item', value: 'milk' }, ... ]
          // Ours: { item: 'milk', event: '...', date: '...', searchTerm: '...' }
          const entities = {};
          if (Array.isArray(parsed.entities)) {
            for (const e of parsed.entities) {
              if (e.entity && e.value) {
                entities[e.entity] = e.value;
              }
            }
          }

          // Rasa NLU does NOT generate a natural language response.
          // We set response=null so nlp_service.js will call Groq/Ollama for the reply.
          // (nlp_service.js checks for rasaResult.response === null and calls AI for text)
          console.log(` ai_service [Rasa] intent=${intentName} confidence=${confidence.toFixed(2)} entities=${JSON.stringify(entities)}`);
          resolve({
            matched: true,
            intent: intentName,
            entities,
            confidence,
            method: 'ai_rasa',
            response: null,          // Rasa NLU has no response — Groq will generate it
            detectedLanguage: parsed?.intent_ranking ? language : language
          });
        } catch (e) {
          console.error('ai_service [Rasa] parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error('ai_service [Rasa] connection failed:', e.message);
      resolve(null);
    });
    req.setTimeout(3000, () => {
      console.warn('ai_service [Rasa] timeout (3s) — skipping Rasa, going to Groq');
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

// =============================================================================
// PROVIDER: OLLAMA (Native Llama 3.1 — runs locally on VPS via Ollama)
// =============================================================================
async function callOllama(text, language, conversationHistory, host, model) {
  const langLabels = { en:'English', ro:'Romanian', fr:'French', it:'Italian', de:'German', es:'Spanish', pt:'Portuguese' };
  const langHint = (language && language !== 'auto' && langLabels[language])
    ? `The system detected the user is writing in ${langLabels[language]}, but VERIFY from the actual text.`
    : 'Detect the language from the user message text.';
  const langInstruction = `CRITICAL: ${langHint} Your "lang" field and "response" MUST match the actual language written.`;

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const recent = (conversationHistory || []).slice(-6);
  for (const t of recent) {
    if (t.userMessage) messages.push({ role: 'user',      content: t.userMessage });
    if (t.botResponse) messages.push({ role: 'assistant', content: t.botResponse });
  }
  messages.push({ role: 'user', content: `${langInstruction}\n\nUser message: ${text}` });

  // Parse Ollama host URL into hostname + path
  let ollamaHost = (host || 'http://localhost:11434').replace(/\/+$/, '');
  const isHttp = ollamaHost.startsWith('http://');
  const hostname = ollamaHost.replace(/^https?:\/\//, '').split(':')[0];
  const portMatch = ollamaHost.match(/:([0-9]+)/);
  const port = portMatch ? parseInt(portMatch[1]) : (isHttp ? 80 : 443);

  const body = JSON.stringify({
    model: model || 'llama3.1:8b',
    messages,
    stream: false,
    format: 'json',
    options: { temperature: 0.3, num_predict: 300 }
  });

  return new Promise((resolve) => {
    const lib = isHttp ? http : https;
    const options = {
      hostname,
      port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const raw = parsed?.message?.content?.trim();
          const result = buildResult(parseLLMJson(raw), 'ai_ollama');
          resolve(result);
        } catch(e) {
          console.error('ai_service: Ollama parse error:', e.message);
          resolve(null);
        }
      });
    });
    req.on('error', (e) => {
      console.error('ai_service: Ollama connection failed:', e.message);
      resolve(null);
    });
    req.setTimeout(60000, () => {
      console.warn('ai_service: Ollama timeout (60s) — CPU inference may be slow');
      req.destroy();
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

// =============================================================================
// AI SERVICE CLASS
// =============================================================================
class AIService {
  constructor() {
    // Model configs loaded from .env
    this.providers = {
      ai_rasa:   { enabled: false, apiKey: null, model: null, host: 'http://localhost:5005' }, // Rasa NLU
      ai_ollama: { enabled: false, apiKey: null, model: 'llama3.1:8b', host: 'http://localhost:11434' },
      ai_groq:   { enabled: false, apiKey: null, model: 'llama-3.3-70b-versatile' },
      ai_openai: { enabled: false, apiKey: null, model: 'gpt-4o-mini' },
      ai_gemini: { enabled: false, apiKey: null, model: 'gemini-1.5-flash' },
      ai_claude: { enabled: false, apiKey: null, model: 'claude-3-haiku-20240307' },
      ai_basic:  { enabled: true,  apiKey: null, model: null } // always available
    };

    // Role → model mapping (overridable via .env)
    // Set AI_MODEL_GENERAL=ai_rasa in .env to use Rasa as primary NLU
    this.roleModelMap = {
      general: 'ai_groq',   // default users → Groq (change to ai_rasa for Rasa NLU)
      vip:     'ai_openai', // VIP users → OpenAI
      admin:   'ai_groq',   // admins → Groq
      basic:   'ai_basic'   // no token / guest → offline only
    };
  }

  // ---------------------------------------------------------------------------
  // configure() — call once at server startup
  // ---------------------------------------------------------------------------
  configure() {
    // Rasa NLU (no API key needed — just needs Rasa server running)
    const rasaUrl = process.env.RASA_URL || '';
    if (rasaUrl) {
      this.providers.ai_rasa.enabled = true;
      this.providers.ai_rasa.host    = rasaUrl;
      console.log(` AIService: ai_rasa ENABLED → ${rasaUrl}`);
    } else {
      console.log(' AIService: ai_rasa DISABLED (no RASA_URL in .env)');
    }

    // Ollama (Native Llama 3 — no API key needed, just needs Ollama running)
    const ollamaHost = process.env.OLLAMA_HOST || '';
    if (ollamaHost) {
      this.providers.ai_ollama.enabled = true;
      this.providers.ai_ollama.host    = ollamaHost;
      this.providers.ai_ollama.model   = process.env.OLLAMA_MODEL || 'llama3.1:8b';
      console.log(` AIService: ai_ollama ENABLED → ${ollamaHost} (model: ${this.providers.ai_ollama.model})`);
    } else {
      console.log(' AIService: ai_ollama DISABLED (no OLLAMA_HOST in .env)');
    }

    // Groq
    const groqKey = process.env.GROQ_API_KEY || '';
    if (groqKey) {
      this.providers.ai_groq.enabled = true;
      this.providers.ai_groq.apiKey  = groqKey;
      this.providers.ai_groq.model   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      console.log(' AIService: ai_groq ENABLED');
    } else {
      console.log(' AIService: ai_groq DISABLED (no GROQ_API_KEY)');
    }

    // OpenAI
    const openaiKey = process.env.OPENAI_API_KEY || '';
    if (openaiKey) {
      this.providers.ai_openai.enabled = true;
      this.providers.ai_openai.apiKey  = openaiKey;
      this.providers.ai_openai.model   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(' AIService: ai_openai ENABLED');
    } else {
      console.log(' AIService: ai_openai DISABLED (no OPENAI_API_KEY)');
    }

    // Gemini
    const geminiKey = process.env.GEMINI_API_KEY || '';
    if (geminiKey) {
      this.providers.ai_gemini.enabled = true;
      this.providers.ai_gemini.apiKey  = geminiKey;
      this.providers.ai_gemini.model   = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      console.log(' AIService: ai_gemini ENABLED');
    } else {
      console.log(' AIService: ai_gemini DISABLED (no GEMINI_API_KEY)');
    }

    // Claude
    const claudeKey = process.env.ANTHROPIC_API_KEY || '';
    if (claudeKey) {
      this.providers.ai_claude.enabled = true;
      this.providers.ai_claude.apiKey  = claudeKey;
      this.providers.ai_claude.model   = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
      console.log(' AIService: ai_claude ENABLED');
    } else {
      console.log(' AIService: ai_claude DISABLED (no ANTHROPIC_API_KEY)');
    }

    // Role → model overrides from .env
    if (process.env.AI_MODEL_GENERAL) this.roleModelMap.general = process.env.AI_MODEL_GENERAL;
    if (process.env.AI_MODEL_VIP)     this.roleModelMap.vip     = process.env.AI_MODEL_VIP;
    if (process.env.AI_MODEL_ADMIN)   this.roleModelMap.admin   = process.env.AI_MODEL_ADMIN;
    if (process.env.AI_MODEL_BASIC)   this.roleModelMap.basic   = process.env.AI_MODEL_BASIC;

    console.log(` AIService: Role map → general=${this.roleModelMap.general}, vip=${this.roleModelMap.vip}, admin=${this.roleModelMap.admin}`);
  }

  // ---------------------------------------------------------------------------
  // getModelForRole() — returns which AI model to use for a given user role
  // ---------------------------------------------------------------------------
  getModelForRole(userRole) {
    const role = (userRole || 'general').toLowerCase();
    const model = this.roleModelMap[role] || this.roleModelMap.general || 'ai_groq';
    return model;
  }

  // ---------------------------------------------------------------------------
  // isAvailable() — checks if a model is enabled and has API key
  // ---------------------------------------------------------------------------
  isAvailable(modelName) {
    if (modelName === 'ai_basic') return true;
    if (modelName === 'ai_rasa')  return this.providers.ai_rasa?.enabled;  // Rasa needs no API key
    if (modelName === 'ai_ollama') return this.providers.ai_ollama?.enabled; // Ollama needs no API key
    const p = this.providers[modelName];
    return p && p.enabled && p.apiKey;
  }

  // ---------------------------------------------------------------------------
  // callModel() — calls a specific AI provider
  // Returns standard result or null on failure
  // ---------------------------------------------------------------------------
  async callModel(modelName, text, language, conversationHistory) {
    const p = this.providers[modelName];
    if (!p || !p.enabled) return null;

    console.log(` AIService: calling ${modelName}...`);

    switch(modelName) {
      case 'ai_rasa':
        return callRasa(text, language, p.host);
      case 'ai_ollama':
        return callOllama(text, language, conversationHistory, p.host, p.model);
      case 'ai_groq':
        return callGroq(text, language, conversationHistory, p.apiKey, p.model);
      case 'ai_openai':
        return callOpenAI(text, language, conversationHistory, p.apiKey, p.model);
      case 'ai_gemini':
        return callGemini(text, language, conversationHistory, p.apiKey, p.model);
      case 'ai_claude':
        return callClaude(text, language, conversationHistory, p.apiKey, p.model);
      case 'ai_basic':
        return null; // handled by offline NLP in nlp_service.js
      default:
        console.warn(` AIService: unknown model "${modelName}"`);
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // processMessage() — main entry point
  // userRole: 'general' | 'vip' | 'admin' | 'basic'
  // Returns standard result or null (null = use offline NLP)
  // ---------------------------------------------------------------------------
  async processMessage(text, language, conversationHistory, userRole, overrideModel = null) {
    const targetModel = overrideModel || this.getModelForRole(userRole);
    console.log(` AIService: role=${userRole || 'general'} → model=${targetModel}`);

    // ai_basic = offline only, skip AI call
    if (targetModel === 'ai_basic') {
      console.log(' AIService: ai_basic selected — using offline NLP only');
      return null;
    }

    // Try the target model
    if (this.isAvailable(targetModel)) {
      const result = await this.callModel(targetModel, text, language, conversationHistory);
      if (result) return result;
      console.log(` AIService: ${targetModel} failed — trying fallback`);
    } else {
      console.log(` AIService: ${targetModel} not available — trying fallback`);
    }

    // Fallback chain: try other available models
    const fallbackOrder = ['ai_rasa', 'ai_ollama', 'ai_groq', 'ai_openai', 'ai_claude', 'ai_gemini'].filter(m => m !== targetModel);
    for (const fallback of fallbackOrder) {
      if (this.isAvailable(fallback)) {
        console.log(` AIService: trying fallback ${fallback}...`);
        const result = await this.callModel(fallback, text, language, conversationHistory);
        if (result) {
          result.method = `${fallback}_fallback`;
          return result;
        }
      }
    }

    // All AI models failed → return null, offline NLP will handle it
    console.log(' AIService: all AI models failed — offline NLP will handle');
    return null;
  }

  // ---------------------------------------------------------------------------
  // getStats() — for health endpoint
  // ---------------------------------------------------------------------------
  getStats() {
    return {
      providers: Object.fromEntries(
        Object.entries(this.providers).map(([name, p]) => [name, { enabled: p.enabled, model: p.model }])
      ),
      roleModelMap: this.roleModelMap
    };
  }
}

module.exports = new AIService();