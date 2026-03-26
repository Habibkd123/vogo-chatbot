// =============================================================================
// ai_service.js - AI MODEL SWITCHER
// =============================================================================
// Supports multiple AI providers configurable per user role:
//
//   ai_basic   - Offline only (regex + keyword + node-nlp). No API key needed.
//   ai_groq    - Groq LLM (llama-3.3-70b-versatile). Free tier.
//   ai_openai  - OpenAI GPT (gpt-4o-mini). Requires OPENAI_API_KEY.
//   ai_gemini  - Google Gemini (gemini-1.5-flash). Requires GEMINI_API_KEY.
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

user_connect: use when user explicitly wants to login, connect, or sign in to their account.
  ✅ "i want to connect", "i want to login", "login", "connect my account", "sign in", "log in"
  ✅ "i want to log in", "connect", "i want to connect my account", "please login"

WHEN IN DOUBT: use "general_knowledge". It is always better to give a helpful answer than to trigger a wrong platform action.

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
// AI SERVICE CLASS
// =============================================================================
class AIService {
  constructor() {
    // Model configs loaded from .env
    this.providers = {
      ai_groq:   { enabled: false, apiKey: null, model: 'llama-3.3-70b-versatile' },
      ai_openai: { enabled: false, apiKey: null, model: 'gpt-4o-mini' },
      ai_gemini: { enabled: false, apiKey: null, model: 'gemini-1.5-flash' },
      ai_basic:  { enabled: true,  apiKey: null, model: null } // always available
    };

    // Role → model mapping (overridable via .env)
    this.roleModelMap = {
      general: 'ai_groq',   // default users → Groq
      vip:     'ai_openai', // VIP users → OpenAI
      admin:   'ai_groq',   // admins → Groq
      basic:   'ai_basic'   // no token / guest → offline only
    };
  }

  // ---------------------------------------------------------------------------
  // configure() — call once at server startup
  // ---------------------------------------------------------------------------
  configure() {
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
      case 'ai_groq':
        return callGroq(text, language, conversationHistory, p.apiKey, p.model);
      case 'ai_openai':
        return callOpenAI(text, language, conversationHistory, p.apiKey, p.model);
      case 'ai_gemini':
        return callGemini(text, language, conversationHistory, p.apiKey, p.model);
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
  async processMessage(text, language, conversationHistory, userRole) {
    const targetModel = this.getModelForRole(userRole);
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
    const fallbackOrder = ['ai_groq', 'ai_openai', 'ai_gemini'].filter(m => m !== targetModel);
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