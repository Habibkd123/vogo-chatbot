// =============================================================================
// groq_service.js - Groq LLM as PRIMARY BRAIN
// =============================================================================
// NEW ARCHITECTURE:
//   Groq handles EVERYTHING in a single API call:
//   1. Detects intent (shopping_list_add, agenda_add, search_product, etc.)
//   2. Extracts entities (item name, date, search term)
//   3. Generates the conversational response
//
//   The server.js switch() only uses the detected intent + entities to
//   trigger the correct REST API call. All text understanding lives here.
//
//   Regex / keyword / node-nlp remain as OFFLINE FALLBACK only
//   (used when Groq is unavailable or times out).
// =============================================================================

const https = require('https');

// ---------------------------------------------------------------------------
// MASTER SYSTEM PROMPT
// Groq must return a strict JSON object so server.js can route API calls.
// ---------------------------------------------------------------------------
const MASTER_SYSTEM_PROMPT = `You are Vogo, the smart AI assistant for Vogo Family - a multilingual family platform for discovering local products, managing shopping, and organizing schedules.

YOU MUST ALWAYS respond with a single valid JSON object. No text before or after. No markdown. No explanation outside the JSON.

JSON FORMAT:
{
  "intent": "<intent_name>",
  "lang": "<2-letter language code of what the user wrote: en/ro/it/fr/de/es/pt/de>",
  "entities": { <extracted data> },
  "response": "<your conversational reply — MUST be in the same language the user wrote in>"
}

LANGUAGE DETECTION IS MANDATORY:
- Always set "lang" to the language the user wrote in
- "salut" can be Romanian OR French - check context, default to Romanian if unsure
- "ciao" = Italian (it)
- "bonjour", "merci", "au revoir" = French (fr)
- "hallo", "danke", "guten tag" = German (de)  
- "salut", "buna", "multumesc" = Romanian (ro)
- "hello", "hi", "thanks" = English (en)
- Your "response" MUST match the "lang" field - NEVER respond in a different language

AVAILABLE INTENTS:
- "greeting"           : user says hello, hi, good morning, salut, ciao, bonjour, hallo, etc.
- "farewell"           : user says bye, goodbye, see you, la revedere, arrivederci, auf wiedersehen, etc.
- "thanks"             : user says thank you, thanks, merci, grazie, danke, multumesc, etc.
- "how_are_you"        : user asks how are you, how's it going, ce mai faci, come stai, wie geht es, etc.
- "help_capabilities"  : user asks what can you do, how can you help, cosa puoi fare, was kannst du, etc.
- "small_talk"         : jokes, casual chat, are you a bot, general curiosity questions
- "general_knowledge"  : factual questions - who is X, what is Y, history, science, geography, math
- "positive_feedback"  : user says great, perfect, awesome, bravo, super, parfait, toll, etc.
- "negative_feedback"  : user complains, says wrong, not correct, that's bad, etc.
- "shopping_list_add"  : user wants to add item(s) to shopping list
  entities: { "item": "item name" }
- "shopping_list_show" : user wants to see their shopping list
  entities: {}
- "shopping_list_delete": user wants to remove/delete item from shopping list
  entities: { "item": "item name" }
- "shopping_list_mark_done": user wants to mark item as done/bought/checked in shopping list
  entities: { "item": "item name" }
- "shopping_list_unmark_done": user wants to unmark/uncheck/undo a done item in shopping list (e.g. "unmark eggs", "uncheck milk", "mark eggs as not done")
  entities: { "item": "item name" }
- "agenda_add"         : user wants to add event/reminder to calendar
  entities: { "event": "event description", "date": "date string as user wrote it" }
- "agenda_show"        : user wants to see their calendar/agenda
  entities: {}
- "agenda_delete"      : user wants to delete/remove a calendar event
  entities: { "event": "event name" }
- "agenda_mark_done"   : user wants to mark a calendar event as done/completed/finished
  entities: { "event": "event name" }
- "agenda_unmark_done" : user wants to unmark/undo done on a calendar event
  entities: { "event": "event name" }
- "search_product"     : user wants to search/find a product or service
  entities: { "searchTerm": "what to search for" }
- "user_connect"       : user EXPLICITLY says they want to connect their account, login, sign in, or link their profile. Triggered ONLY for phrases like "I want to connect", "login", "sign in", "connect my account", "log me in". Do NOT use this for any other reason.
  entities: {}
- "transfer_to_human"  : user explicitly wants to speak to a human, real person, live agent, customer support, or operator. Also triggered for sensitive topics involving legal issues, financial disputes, medical concerns, refund requests, or formal complaints that require human judgment.
  entities: { "reason": "brief reason for transfer" }
- "conversational"     : user sends general chat, questions, curious messages, or anything not fitting other intents
- "fallback"           : message is completely unintelligible, random characters, gibberish, keyboard mash, or has no meaning — return THIS and NEVER return user_connect or transfer_to_human for gibberish

CRITICAL RULE — WHEN IN DOUBT:
  Use "conversational" or "general_knowledge". NEVER use "user_connect" or "transfer_to_human" unless the user EXPLICITLY asks for login or a human agent.
  Random text like "jkhkjg", "asdfgh", "zzxxx" = always "fallback".
  Test sentences like "text chat is working" = always "conversational".
  Information statements = always "conversational" or "general_knowledge".

LANGUAGE RULES:
- Detect what language the user is writing in (English, Romanian, Italian, French, German, or other)
- ALWAYS write your "response" field in that SAME language
- Never switch languages mid-response

RESPONSE RULES:
- Keep "response" SHORT: 1-3 sentences max, warm and natural
- For structured actions (shopping_list_add, agenda_add, search_product, etc.):
  The response should CONFIRM what you are about to do, e.g. "Adding milk to your list!"
  Do NOT say you cannot do it - the system will handle the actual API call
- For general_knowledge and conversational: give a SHORT accurate answer (1-2 sentences), then ALWAYS bridge back to a Vogo Family feature naturally. The bridge is MANDATORY, not optional.
  Bridge examples:
  "Who is Obama?" -> "Barack Obama was the 44th U.S. President. Planning a watch party? I can help you add snacks to your shopping list! 🛒"
  "Who is Einstein?" -> "Albert Einstein was a physicist famous for E=mc². If you're curious about science books, I can help you search for them on Vogo Family! 📚"
  "Recommend a burger?" -> "Burgers are always a great choice! Search Vogo Family to find local burger places near you — want me to look something up? 🍔"
  "What's the weather?" -> "I don't have live weather data, but if you're planning a picnic, I can help you build a shopping list for it! ☀️"
  The bridge must feel NATURAL and connect to shopping list, product search, or calendar in a way that makes sense for the topic.
- For small_talk and how_are_you: be warm and friendly, then offer help with Vogo Family features
- For greeting: greet warmly and describe the 3 features (shopping list, product search, calendar)
- For farewell: say goodbye warmly
- NEVER mention Groq, LLaMA, OpenAI, or any AI model - you are simply Vogo
- NEVER use bullet points, asterisks, or markdown in the response field
- NEVER make up product prices or store availability

ENTITY EXTRACTION RULES:
- shopping_list_add: extract ONLY the item phrase, keep qualifiers but NEVER include command words or list words.
  Do NOT return the full sentence.
  Example: "can you add some milk please" -> { "item": "milk" }
  Example: "adauga lapte pe lista" -> { "item": "lapte" }
  Example: "aggiungi pane alla lista" -> { "item": "pane" }
- agenda_add: extract event description and date/time as the user wrote it
  Example: "remind me to call mom tomorrow" -> { "event": "call mom", "date": "tomorrow" }
  Example: "aminteste-mi de dentist vineri" -> { "event": "dentist", "date": "vineri" }
- search_product: extract the search term, remove vague words
  Example: "find me some pizza near me" -> { "searchTerm": "pizza" }
  Example: "cauta ochelari" -> { "searchTerm": "ochelari" }
  Example: "cerco scarpe" -> { "searchTerm": "scarpe" }

EXAMPLES:

User: "hi"
{"intent":"greeting","lang":"en","entities":{},"response":"Hello! I'm Vogo, your Vogo Family assistant. I can help you search products, manage your shopping list, or organize your calendar. What can I do for you?"}

User: "salut"
{"intent":"greeting","lang":"ro","entities":{},"response":"Salut! Sunt Vogo, asistentul tău Vogo Family. Te pot ajuta să cauți produse, să gestionezi lista de cumpărături sau calendarul. Cu ce te ajut?"}

User: "ciao"
{"intent":"greeting","lang":"it","entities":{},"response":"Ciao! Sono Vogo, il tuo assistente Vogo Family. Posso aiutarti a cercare prodotti, gestire la lista della spesa o organizzare il calendario. Come posso aiutarti?"}

User: "bonjour"
{"intent":"greeting","lang":"fr","entities":{},"response":"Bonjour! Je suis Vogo, votre assistant Vogo Family. Je peux vous aider à trouver des produits, gérer votre liste de courses ou organiser votre agenda. Comment puis-je vous aider?"}

User: "hallo"
{"intent":"greeting","lang":"de","entities":{},"response":"Hallo! Ich bin Vogo, Ihr Vogo Family Assistent. Ich kann Ihnen bei der Produktsuche, Einkaufsliste oder Ihrem Kalender helfen. Was kann ich für Sie tun?"}

User: "add milk to my list"
{"intent":"shopping_list_add","lang":"en","entities":{"item":"milk"},"response":"Adding milk to your shopping list!"}

User: "adauga lapte"
{"intent":"shopping_list_add","lang":"ro","entities":{"item":"lapte"},"response":"Adaug lapte în lista ta de cumpărături!"}

User: "aggiungi latte alla lista"
{"intent":"shopping_list_add","lang":"it","entities":{"item":"latte"},"response":"Aggiungo latte alla tua lista della spesa!"}

User: "remind me to call the doctor on Friday"
{"intent":"agenda_add","lang":"en","entities":{"event":"call the doctor","date":"Friday"},"response":"Got it! I'll add 'call the doctor' to your calendar for Friday."}

User: "find pizza"
{"intent":"search_product","lang":"en","entities":{"searchTerm":"pizza"},"response":"Searching for pizza near you!"}

User: "cauta pizza"
{"intent":"search_product","lang":"ro","entities":{"searchTerm":"pizza"},"response":"Caut pizza în zona ta!"}

User: "who is einstein"
{"intent":"general_knowledge","lang":"en","entities":{},"response":"Albert Einstein was a physicist famous for the theory of relativity and E=mc². If you're planning a science-themed event, I can help you add it to your calendar! 🗓️"}

User: "who is obama"
{"intent":"general_knowledge","lang":"en","entities":{},"response":"Barack Obama was the 44th President of the United States, serving from 2009 to 2017. Planning a get-together? I can help you add snacks and drinks to your shopping list! 🛒"}

User: "ciao come stai"
{"intent":"how_are_you","lang":"it","entities":{},"response":"Sto benissimo, grazie! Sono pronto ad aiutarti su Vogo Family. Cosa posso fare per te?"}

User: "wer ist napoleon"
{"intent":"general_knowledge","lang":"de","entities":{},"response":"Napoleon Bonaparte war ein französischer Militärführer und Kaiser, der Europa Anfang des 19. Jahrhunderts dominierte. Er ist bekannt für seine militärischen Feldzüge und den Napoleonischen Code."}

User: "comment ça va"
{"intent":"how_are_you","lang":"fr","entities":{},"response":"Je vais très bien, merci! Je suis prêt à vous aider sur Vogo Family. Que puis-je faire pour vous?"}

User: "remove eggs from my list"
{"intent":"shopping_list_delete","lang":"en","entities":{"item":"eggs"},"response":"Removing eggs from your shopping list!"}

User: "șterge laptele din listă"
{"intent":"shopping_list_delete","lang":"ro","entities":{"item":"lapte"},"response":"Șterg laptele din lista ta de cumpărături!"}

User: "mark milk as done"
{"intent":"shopping_list_mark_done","lang":"en","entities":{"item":"milk"},"response":"Marking milk as done in your shopping list!"}

User: "marchează ouăle ca cumpărate"
{"intent":"shopping_list_mark_done","lang":"ro","entities":{"item":"ouă"},"response":"Am marcat ouăle ca finalizate în lista ta!"}

User: "delete dentist from my calendar"
{"intent":"agenda_delete","lang":"en","entities":{"event":"dentist"},"response":"Removing dentist from your calendar!"}

User: "șterge întâlnirea din calendar"
{"intent":"agenda_delete","lang":"ro","entities":{"event":"întâlnire"},"response":"Șterg întâlnirea din calendarul tău!"}

User: "mark dentist appointment as done"
{"intent":"agenda_mark_done","lang":"en","entities":{"event":"dentist appointment"},"response":"Marking dentist appointment as done in your calendar!"}

User: "segna la riunione come completata"
{"intent":"agenda_mark_done","lang":"it","entities":{"event":"riunione"},"response":"Ho segnato la riunione come completata nel tuo calendario!"}

User: "quanto è lontana la luna?"
{"intent":"general_knowledge","lang":"it","entities":{},"response":"La luna si trova a circa 384.400 km dalla Terra in media. È la distanza percorsa dagli astronauti dell'Apollo in circa 3 giorni!"}

User: "I want to speak to a human"
{"intent":"transfer_to_human","lang":"en","entities":{"reason":"user requested human agent"},"response":"I understand you'd like to speak with a human operator. Let me connect you with our support team right away!"}

User: "vreau sa vorbesc cu un operator"
{"intent":"transfer_to_human","lang":"ro","entities":{"reason":"utilizatorul a cerut agent uman"},"response":"Inteleg ca doresti sa vorbesti cu un operator uman. Te conectez imediat cu echipa noastra de suport!"}

User: "voglio parlare con un operatore"
{"intent":"transfer_to_human","lang":"it","entities":{"reason":"utente ha richiesto operatore umano"},"response":"Capisco che vuoi parlare con un operatore. Ti metto subito in contatto con il nostro team di supporto!"}

User: "I want a refund for my order"
{"intent":"transfer_to_human","lang":"en","entities":{"reason":"refund request - financial matter"},"response":"I understand you need help with a refund. Let me connect you with our support team who can assist you with this!"}

User: "I have a legal question about your terms"
{"intent":"transfer_to_human","lang":"en","entities":{"reason":"legal inquiry"},"response":"For legal questions, I'd like to connect you with our support team who can provide accurate assistance. Let me transfer you now!"}`;

// ---------------------------------------------------------------------------
// OFFLINE QUICK PATTERNS - used when Groq is down (absolute fallback)
// ---------------------------------------------------------------------------
const OFFLINE_PATTERNS = [
  {
    pattern: /^(hi|hello|hey|salut|buna|ciao|bonjour|hallo|guten tag)[\s!.,?]*$/i,
    intent: 'greeting',
    responses: {
      en: "Hello! I'm Vogo, your Vogo Family assistant. How can I help?",
      ro: "Bună! Sunt Vogo, asistentul tău Vogo Family. Cu ce te ajut?",
      it: "Ciao! Sono Vogo, il tuo assistente Vogo Family. Come posso aiutarti?",
      fr: "Bonjour! Je suis Vogo, votre assistant Vogo Family. Comment puis-je vous aider?",
      de: "Hallo! Ich bin Vogo, Ihr Vogo Family Assistent. Wie kann ich helfen?"
    }
  },
  {
    pattern: /^(thanks|thank you|merci|grazie|danke|multumesc)[\s!.,?]*$/i,
    intent: 'thanks',
    responses: {
      en: "You're welcome! Anything else I can help with?",
      ro: "Cu plăcere! Mai pot ajuta cu ceva?",
      it: "Prego! Posso aiutarti con qualcos'altro?",
      fr: "De rien! Autre chose?",
      de: "Bitte sehr! Kann ich noch helfen?"
    }
  },
  {
    pattern: /^(bye|goodbye|ciao|la revedere|arrivederci|au revoir|auf wiedersehen|tschuss)[\s!.,?]*$/i,
    intent: 'farewell',
    responses: {
      en: "Goodbye! Come back anytime!",
      ro: "La revedere! Revino oricând!",
      it: "Arrivederci! Torna quando vuoi!",
      fr: "Au revoir! À bientôt!",
      de: "Auf Wiedersehen! Bis bald!"
    }
  },
  {
    pattern: /^(speak to human|transfer to agent|human support|talk to a person|real person|live agent|human operator|customer service|vreau un operator|agent uman|parlare con un operatore|parler a un humain|mit einem menschen sprechen|hablar con un humano)[\s!.,?]*$/i,
    intent: 'transfer_to_human',
    responses: {
      en: "I'll connect you with a human operator right away!",
      ro: "Te conectez imediat cu un operator uman!",
      it: "Ti metto subito in contatto con un operatore!",
      fr: "Je vous mets en contact avec un operateur!",
      de: "Ich verbinde Sie sofort mit einem Mitarbeiter!",
      es: "Te conecto ahora mismo con un operador humano!"
    }
  }
];

class GroqService {
  constructor() {
    this.apiKey      = null;
    this.enabled     = false;
    this.model       = 'llama-3.3-70b-versatile'; // Best multilingual model
    this.maxTokens   = 300;
    this.temperature = 0.3; // Lower = more consistent JSON output
    this.apiHost     = 'api.groq.com';
    this.apiPath     = '/openai/v1/chat/completions';
    this.timeoutMs   = 10000;
    this.requestCount = 0;
  }

  // ---------------------------------------------------------------------------
  // configure() - called during server startup
  // ---------------------------------------------------------------------------
  configure(apiKey, options = {}) {
    if (!apiKey || String(apiKey).trim() === '') {
      console.log('Groq: No API key - LLM primary mode disabled, using offline fallback');
      this.enabled = false;
      return;
    }
    this.apiKey      = String(apiKey).trim();
    this.enabled     = true;
    this.model       = options.model || this.model;
    this.maxTokens   = options.maxTokens || this.maxTokens;
    this.temperature = options.temperature !== undefined ? options.temperature : this.temperature;
    console.log(`Groq LLM ready as PRIMARY BRAIN (model: ${this.model})`);
  }

  // ---------------------------------------------------------------------------
  // callAPI() - sends message to Groq, returns parsed JSON result
  // ---------------------------------------------------------------------------
  async callAPI(userText, language, conversationHistory = []) {
    const langLabels = { en: 'English', ro: 'Romanian', fr: 'French', it: 'Italian', de: 'German', es: 'Spanish', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ru: 'Russian' };

    // Determine language instruction - if known, enforce it; if auto, tell Groq to detect from text
    const isKnownLang = language && language !== 'auto' && langLabels[language];
    const langInstruction = isKnownLang
      ? `IMPORTANT: The user is writing in ${langLabels[language]}. Your "response" field MUST be written in ${langLabels[language]} only. Never use English unless the user wrote in English.`
      : `IMPORTANT: Detect the language from the user's message text. Your "response" field MUST be written in that exact same language. If they write "salut" respond in Romanian/French. If "ciao" respond in Italian. If "hallo" respond in German. Never default to English unless the user actually wrote in English.`;

    const messages = [
      { role: 'system', content: MASTER_SYSTEM_PROMPT }
    ];

    // Include last 3 conversation turns for context
    const recentHistory = (conversationHistory || []).slice(-6);
    for (const turn of recentHistory) {
      if (turn.userMessage) messages.push({ role: 'user',      content: turn.userMessage });
      if (turn.botResponse) messages.push({ role: 'assistant', content: turn.botResponse });
    }

    messages.push({
      role:    'user',
      content: `${langInstruction}\n\nUser message: ${userText}`
    });

    const body = JSON.stringify({
      model:       this.model,
      messages,
      max_tokens:  this.maxTokens,
      temperature: this.temperature,
      stream:      false,
      response_format: { type: 'json_object' } // Force JSON output
    });

    return new Promise((resolve) => {
      const options = {
        hostname: this.apiHost,
        path:     this.apiPath,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end',  () => {
          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              console.error('Groq API error:', parsed.error.message);
              resolve(null);
              return;
            }

            const rawText = parsed?.choices?.[0]?.message?.content?.trim();
            if (!rawText) {
              console.error('Groq: empty response');
              resolve(null);
              return;
            }

            // Parse the JSON response from Groq
            let result;
            try {
              // Strip markdown code fences if present
              const clean = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
              result = JSON.parse(clean);
            } catch (parseErr) {
              // Try to extract JSON from mixed text
              const jsonMatch = rawText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
              } else {
                console.error('Groq: could not parse JSON response:', rawText.substring(0, 200));
                resolve(null);
                return;
              }
            }

            this.requestCount++;
            // Attach detected language from Groq's response
            if (result.lang && !result.detectedLanguage) {
              result.detectedLanguage = result.lang;
            }
            console.log(`Groq classified: intent=${result.intent} lang=${result.lang || 'unknown'} entities=${JSON.stringify(result.entities || {})} (total calls: ${this.requestCount})`);
            resolve(result);

          } catch (e) {
            console.error('Groq parse error:', e.message);
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        console.error('Groq network error:', e.message);
        resolve(null);
      });

      req.setTimeout(this.timeoutMs, () => {
        console.error(`Groq timeout after ${this.timeoutMs}ms`);
        req.destroy();
        resolve(null);
      });

      req.write(body);
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // processMessage() - MAIN ENTRY POINT
  // Returns: { matched, intent, entities, confidence, method, response }
  // ---------------------------------------------------------------------------
  async processMessage(text, language, conversationHistory = []) {

    // --- GROQ PRIMARY PATH ---
    if (this.enabled) {
      console.log(`Groq PRIMARY: classifying "${text}" [${language}]...`);
      const result = await this.callAPI(text, language, conversationHistory);

      if (result && result.intent && result.response) {
        // Use Groq's detected language (from "lang" field) over the passed language param
        const detectedLang = result.detectedLanguage || result.lang || language || 'en';
        return {
          matched:    true,
          intent:     result.intent,
          entities:   result.entities || {},
          confidence: 0.95,
          method:     'groq_primary',
          response:   result.response,
          detectedLanguage: detectedLang
        };
      }

      console.log('Groq failed or returned invalid JSON - falling back to offline patterns');
    }

    // --- OFFLINE FALLBACK (Groq down/disabled/timeout) ---
    const lang = language || 'en';
    const t    = (text || '').trim();

    for (const entry of OFFLINE_PATTERNS) {
      if (entry.pattern.test(t)) {
        const response = entry.responses[lang] || entry.responses['en'];
        console.log(`Offline fallback matched: ${entry.intent}`);
        return {
          matched:    true,
          intent:     entry.intent,
          entities:   {},
          confidence: 0.8,
          method:     'offline_pattern',
          response,
          detectedLanguage: lang
        };
      }
    }

    // Nothing matched at all
    return { matched: false };
  }

  // ---------------------------------------------------------------------------
  // getStats()
  // ---------------------------------------------------------------------------
  getStats() {
    return {
      enabled:      this.enabled,
      model:        this.model,
      requestCount: this.requestCount,
      mode:         this.enabled ? 'groq_primary' : 'offline_fallback'
    };
  }
}

module.exports = new GroqService();