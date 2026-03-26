// ============================================================================
// VOGO CHATBOT - GENERAL CONSTANTS
// Phase B: All project-level constants
// File: config/general_constant.js
// ============================================================================

/**
 * DeliveryRequirement: All general project constants shall be defined 
 * into a single file at project level
 */

// ============================================================================
// APPLICATION CONSTANTS
// ============================================================================
const APP = {
  NAME: 'Vogo Chatbot',
  VERSION: '2.0.0',
  BUILD_DATE: '2026-02-11',
  AUTHOR: 'Vogo Team',
  LICENSE: 'Proprietary'
};

// ============================================================================
// API ENDPOINTS
// ============================================================================
const API_ENDPOINTS = {
  // Base URLs
  BASE_URL_TEST: 'https://test07.vogo.family/wp-json/vogo/v1',
  BASE_URL_PROD: 'https://vogo.family/wp-json/vogo/v1',
  
  // Authentication
  LOGIN_JWT: '/public/login_jwt/',
  
  // Predefined Questions
  PREDEFINED_QA: '/predefined_qa',
  
  // Shopping List (Phase C)
  SHOP_LIST_ADD: '/shopListAddItem',
  SHOP_LIST_SHOW: '/shopListShowUserItems',
  SHOP_LIST_MARK_DONE: '/shopListMarkDone',
  SHOP_LIST_DELETE: '/shopListDeleteItem',
  
  // Agenda/Calendar (Phase C)
  AGENDA_ADD: '/agendaAddItem',
  AGENDA_SHOW: '/agendaShowUserItems',
  AGENDA_MARK_DONE: '/agendaMarkDone',
  AGENDA_DELETE: '/agendaDeleteItem',
  
  // Product Search (Phase C)
  SEARCH_KEYWORD: '/search_by_keyword'
};

// ============================================================================
// DEFAULT VALUES
// ============================================================================
const DEFAULTS = {
  // Language
  LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: ['en', 'ro', 'it', 'fr', 'de', 'es'],
  
  // Product Link
  PRODUCT_LINK: 'https://vogo.family/product/oftalmologie-ochelari-glasses/',
  
  // Timeouts
  API_TIMEOUT: 10000, // milliseconds
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  JWT_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
  CACHE_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  
  // Limits
  MAX_MESSAGE_LENGTH: 1000,
  MAX_SHOPPING_ITEMS: 100,
  MAX_AGENDA_ITEMS: 100,
  MAX_SEARCH_RESULTS: 20,
  
  // UI
  TYPING_INDICATOR_DELAY: 500, // milliseconds
  AUTO_SCROLL_DELAY: 100, // milliseconds
  WIDGET_WIDTH: 380,
  WIDGET_HEIGHT: 600
};

// ============================================================================
// NLP CONSTANTS
// ============================================================================
const NLP = {
  // Confidence thresholds
  CONFIDENCE_HIGH: 0.8,
  CONFIDENCE_MEDIUM: 0.5,
  CONFIDENCE_LOW: 0.3,
  
  // Detection methods
  METHOD_REGEX: 'regex',
  METHOD_KEYWORD: 'keyword',
  METHOD_NLP: 'nlp',
  METHOD_FALLBACK: 'fallback',
  
  // Intent names
  INTENTS: {
    SHOPPING_LIST_ADD: 'shopping_list_add',
    SHOPPING_LIST_SHOW: 'shopping_list_show',
    SHOPPING_LIST_DELETE: 'shopping_list_delete',
    SHOPPING_LIST_MARK_DONE: 'shopping_list_mark_done',
    SHOPPING_LIST_UNMARK_DONE: 'shopping_list_unmark_done',
    AGENDA_ADD: 'agenda_add',
    AGENDA_SHOW: 'agenda_show',
    AGENDA_DELETE: 'agenda_delete',
    AGENDA_MARK_DONE: 'agenda_mark_done',
    AGENDA_UNMARK_DONE: 'agenda_unmark_done',
    SEARCH_PRODUCT: 'search_product',
    GREETING: 'greeting',
    THANKS: 'thanks',
    TRANSFER_TO_HUMAN: 'transfer_to_human',
    FALLBACK: 'fallback'
  },
  
  // Priority levels
  PRIORITY_HIGH: 10,
  PRIORITY_MEDIUM: 5,
  PRIORITY_LOW: 1
};

// ============================================================================
// DATABASE CONSTANTS
// ============================================================================
const DATABASE = {
  // Table names
  TABLES: {
    NLP_MODEL: 'nlp_model',
    USERS: 'users',
    SESSIONS: 'sessions',
    CONVERSATIONS: 'conversations',
    SHOPPING_LISTS: 'shopping_lists',
    AGENDA_ITEMS: 'agenda_items',
    PRODUCT_CACHE: 'product_cache',
    PREDEFINED_QA_CACHE: 'predefined_qa_cache',
    API_LOGS: 'api_logs',
    SYSTEM_CONFIG: 'system_config',
    SERVER_LOGS: 'server_logs'
  },
  
  // Views
  VIEWS: {
    ACTIVE_SHOPPING: 'v_active_shopping_lists',
    UPCOMING_AGENDA: 'v_upcoming_agenda',
    RECENT_CONVERSATIONS: 'v_recent_conversations'
  },
  
  // Stored procedures
  PROCEDURES: {
    ADD_SHOPPING_ITEM: 'sp_add_shopping_item',
    ADD_AGENDA_ITEM: 'sp_add_agenda_item',
    SEARCH_PRODUCTS: 'sp_search_products'
  },
  
  // Connection pool
  POOL_MIN: 2,
  POOL_MAX: 10,
  POOL_IDLE_TIMEOUT: 10000
};

// ============================================================================
// USER ROLES & SUBSCRIPTION LEVELS
// ============================================================================
const USER = {
  // Subscription levels (matching specification)
  SUBSCRIPTION: {
    STANDARD: 'standard',  // Level 1: Open-source AI only
    VIP: 'vip',            // Level 2: Open-source + OpenAI
    PREMIUM: 'premium'     // Level 3: Full access + human operator
  },
  
  // Demo users (Phase B)
  DEMO_USER_ID: 1,
  VIP_USER_ID: 2
};

// ============================================================================
// ESCALATION LEVELS (3-Tier System from Specification)
// ============================================================================
const ESCALATION = {
  LEVEL_1: {
    NAME: 'Open-Source AI',
    DESCRIPTION: 'Node-nlp + Compromise + Custom Logic',
    CONFIDENCE_MIN: 0.5,
    ENABLED: true
  },
  
  LEVEL_2: {
    NAME: 'OpenAI Premium',
    DESCRIPTION: 'GPT-4 for VIP Users',
    CONFIDENCE_MIN: 0.0,
    CONFIDENCE_MAX: 0.3,
    ENABLED: false, // Phase C
    SUBSCRIPTION_REQUIRED: 'vip'
  },
  
  LEVEL_3: {
    NAME: 'Human Operator',
    DESCRIPTION: 'Live Agent Handoff via WhatsApp',
    ENABLED: true, // Phase C: NOW ACTIVE
    CONFIDENCE_THRESHOLD: 0.3,
    TRIGGER_KEYWORDS: [
      'speak to human', 'transfer to agent', 'human support', 'talk to a person',
      'real person', 'live agent', 'human operator', 'customer service',
      'vreau un operator', 'agent uman', 'vorbesc cu o persoana', 'suport uman',
      'parlare con un operatore', 'operatore umano', 'agente dal vivo',
      'parler a un humain', 'agent humain', 'support humain', 'operateur',
      'mit einem menschen sprechen', 'menschlicher agent', 'live-agent',
      'hablar con un humano', 'agente humano', 'soporte humano'
    ],
  }
};

// ============================================================================
// HUMAN OPERATOR (Phase C: Live Agent Chat)
// ============================================================================
const HUMAN_OPERATOR = {
  AVAILABLE: true,
  POLL_INTERVAL_MS: 5000,
  PREFERRED_AGENT_ID: 7,  // Force assignment to suport@aab.local (ID 7) — remove for production
  API_ENDPOINTS: {
    GET_RANDOM_USER: '/support/get-random-user',
    START_THREAD: '/forum-chat/start_or_update_chat_thread',
    GET_DISCUSSIONS: '/forum-chat/get_forum_discussions_by_user',
    GET_THREAD_BY_ID: '/forum-chat/get_forum_discussion_by_id',
    GET_ANSWERS: '/forum-chat/get_answers_by_post_id',
    POST_ANSWER: '/forum-chat/forum_post_answer',
    UPLOAD_FILE: '/upload-document/forum/answer'
  }
};

// ============================================================================
// HTTP STATUS CODES
// ============================================================================
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// ============================================================================
// ERROR MESSAGES
// ============================================================================
const ERROR_MESSAGES = {
  // Authentication
  AUTH_FAILED: 'Authentication failed. Please check your credentials.',
  TOKEN_EXPIRED: 'Your session has expired. Please login again.',
  
  // API
  API_UNAVAILABLE: 'Service temporarily unavailable. Please try again later.',
  API_TIMEOUT: 'Request timed out. Please try again.',
  
  // Database
  DB_CONNECTION_FAILED: 'Database connection failed.',
  DB_QUERY_FAILED: 'Database query failed.',
  
  // Validation
  INVALID_INPUT: 'Invalid input. Please check your message.',
  MESSAGE_TOO_LONG: 'Message is too long. Please keep it under 1000 characters.',
  
  // NLP
  NLP_INIT_FAILED: 'NLP service initialization failed.',
  INTENT_NOT_RECOGNIZED: "I'm sorry, I didn't understand that.",
  
  // Features
  FEATURE_DISABLED: 'This feature is currently disabled.',
  SHOPPING_LIST_FULL: 'Your shopping list is full. Please remove some items.',
  AGENDA_FULL: 'Your calendar is full. Please remove some events.'
};

// ============================================================================
// SUCCESS MESSAGES (Multi-language)
// ============================================================================
const SUCCESS_MESSAGES = {
  en: {
    SHOPPING_ADDED: "I'll add that to your shopping list.",
    SHOPPING_SHOWN: "Here's your shopping list.",
    AGENDA_ADDED: "I'll add that to your calendar.",
    AGENDA_SHOWN: "Here's your agenda.",
    SEARCH_RESULTS: "Let me search for that.",
    GREETING: "Hello! How can I help you today?",
    THANKS: "You're welcome! Is there anything else I can help you with?",
    TRANSFER_CONNECTING: 'Connecting you with a human operator...',
    TRANSFER_CONNECTED: 'You are now connected with a support agent. Type your message below.',
    TRANSFER_ENDED: 'Live chat session ended. You are back to AI assistant mode.',
    TRANSFER_UNAVAILABLE: 'Human operator is currently unavailable. Please try again later.'
  },
  ro: {
    SHOPPING_ADDED: "Voi adÄƒuga asta Ã®n lista ta de cumpÄƒrÄƒturi.",
    SHOPPING_SHOWN: "IatÄƒ lista ta de cumpÄƒrÄƒturi.",
    AGENDA_ADDED: "Voi adÄƒuga asta Ã®n calendarul tÄƒu.",
    AGENDA_SHOWN: "IatÄƒ agenda ta.",
    SEARCH_RESULTS: "Caut pentru tine.",
    GREETING: "BunÄƒ! Cu ce te pot ajuta astÄƒzi?",
    THANKS: "Cu plÄƒcere! Mai pot sÄƒ te ajut cu ceva?",
    TRANSFER_CONNECTING: 'Te conectam cu un operator uman...',
    TRANSFER_CONNECTED: 'Esti conectat cu un agent de suport. Scrie mesajul tau mai jos.',
    TRANSFER_ENDED: 'Sesiunea de chat a fost inchisa. Ai revenit la asistentul AI.',
    TRANSFER_UNAVAILABLE: 'Operatorul uman nu este disponibil momentan. Incearca mai tarziu.'
  },
  it: {
    SHOPPING_ADDED: "Lo aggiungerÃ² alla tua lista della spesa.",
    SHOPPING_SHOWN: "Ecco la tua lista della spesa.",
    AGENDA_ADDED: "Lo aggiungerÃ² al tuo calendario.",
    AGENDA_SHOWN: "Ecco la tua agenda.",
    SEARCH_RESULTS: "Cerco per te.",
    GREETING: "Ciao! Come posso aiutarti oggi?",
    THANKS: "Prego! Posso aiutarti con qualcos'altro?",
    TRANSFER_CONNECTING: 'Ti mettiamo in contatto con un operatore...',
    TRANSFER_CONNECTED: 'Sei connesso con un agente di supporto. Scrivi il tuo messaggio qui sotto.',
    TRANSFER_ENDED: 'Sessione di chat terminata. Sei tornato all assistente AI.',
    TRANSFER_UNAVAILABLE: 'Operatore umano non disponibile al momento. Riprova piu tardi.'
  }
};

// ============================================================================
// REGEX PATTERNS
// ============================================================================
const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]+$/,
  DATE: /\d{4}-\d{2}-\d{2}/,
  TIME: /\d{2}:\d{2}/,
  URL: /^https?:\/\/.+/
};

// ============================================================================
// SECURITY
// ============================================================================
const SECURITY = {
  ENCRYPTION_ALGORITHM: 'aes-256-cbc',
  HASH_ALGORITHM: 'sha256',
  SALT_ROUNDS: 10,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000 // 15 minutes
};

// ============================================================================
// LOGGING
// ============================================================================
const LOGGING = {
  LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },
  
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES: 10,
  DATE_FORMAT: 'YYYY-MM-DD HH:mm:ss'
};

// ============================================================================
// PERFORMANCE
// ============================================================================
const PERFORMANCE = {
  MAX_CONCURRENT_REQUESTS: 100,
  RATE_LIMIT_REQUESTS: 60,
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  DEBOUNCE_DELAY: 300 // milliseconds
};

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  APP,
  API_ENDPOINTS,
  DEFAULTS,
  NLP,
  DATABASE,
  USER,
  ESCALATION,
  HUMAN_OPERATOR,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  REGEX_PATTERNS,
  SECURITY,
  LOGGING,
  PERFORMANCE
};

// ============================================================================
// USAGE EXAMPLE:
// ============================================================================
// const { API_ENDPOINTS, NLP, DATABASE } = require('./config/general_constant');
// 
// console.log(API_ENDPOINTS.BASE_URL_TEST);
// console.log(NLP.INTENTS.SHOPPING_LIST_ADD);
// console.log(DATABASE.TABLES.USERS);
// ============================================================================