// ============================================================================
// VOGO CHATBOT - GENERAL VARIABLES
// Phase B: All runtime variables
// File: config/general_variable.js
// ============================================================================

/**
 * DeliveryRequirement: All general project variables shall be defined 
 * into a single file at project level
 * 
 * NOTE: Constants go in general_constant.js
 *       Variables (mutable state) go here
 */

// ============================================================================
// RUNTIME STATE
// ============================================================================
let runtimeState = {
  // Application state
  isInitialized: false,
  startTime: null,
  environment: process.env.NODE_ENV || 'development',
  
  // Server state
  serverRunning: false,
  serverPort: null,
  
  // Database state
  dbConnected: false,
  dbConnectionPool: null,
  
  // NLP state
  nlpInitialized: false,
  nlpManager: null,
  
  // Statistics
  totalRequests: 0,
  totalConversations: 0,
  totalApiCalls: 0,
  uptime: 0
};

// ============================================================================
// AUTHENTICATION STATE
// ============================================================================
let authState = {
  // JWT Token
  currentJwtToken: null,
  jwtTokenExpiry: null,
  jwtRefreshInProgress: false,
  
  // User session
  activeUsers: new Map(), // userId -> sessionData
  activeSessions: new Map(), // sessionId -> userData
  
  // Rate limiting
  loginAttempts: new Map(), // userId -> { count, lastAttempt }
  lockedAccounts: new Set()
};

// ============================================================================
// CACHE STATE
// ============================================================================
let cacheState = {
  // Predefined QA cache
  predefinedQaCache: new Map(), // questionId -> questionData
  predefinedQaLastUpdate: null,
  
  // Product search cache
  productSearchCache: new Map(), // searchTerm -> results
  
  // NLP rules cache
  nlpRulesCache: new Map(), // language -> rules
  nlpRulesLastUpdate: null,
  
  // API response cache
  apiResponseCache: new Map() // endpoint+params -> response
};

// ============================================================================
// CONFIGURATION STATE (Loaded from INI/Database)
// ============================================================================
let configState = {
  // Loaded from chatbot.ini
  appConfig: null,
  
  // Loaded from database system_config table
  dbConfig: new Map(), // configKey -> configValue
  
  // Feature flags
  features: {
    shoppingListEnabled: true,
    calendarEnabled: true,
    productSearchEnabled: true,
    predefinedQaEnabled: true,
    apiCallsEnabled: false, // Phase B: false, Phase C: true
    openAiEnabled: false
  }
};

// ============================================================================
// NLP STATE
// ============================================================================
let nlpState = {
  // Active rules
  activeRules: [],
  rulesCount: 0,
  
  // Language detection state
  detectedLanguages: new Map(), // userId -> detectedLanguage
  
  // Conversation context
  conversationContexts: new Map(), // userId -> { lastIntent, lastEntity, history }
  
  // Performance metrics
  averageProcessingTime: 0,
  totalProcessed: 0
};

// ============================================================================
// QUEUE STATE (for async operations)
// ============================================================================
let queueState = {
  // API call queue (when API is temporarily down)
  apiCallQueue: [],
  
  // Database sync queue
  dbSyncQueue: [],
  
  // Processing flags
  isProcessingQueue: false,
  queueProcessInterval: null
};

// ============================================================================
// ERROR TRACKING
// ============================================================================
let errorState = {
  // Recent errors
  recentErrors: [],
  maxRecentErrors: 100,
  
  // Error counts by type
  errorCounts: {
    database: 0,
    api: 0,
    nlp: 0,
    validation: 0,
    authentication: 0
  },
  
  // Last error timestamp
  lastErrorTime: null
};

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================
let performanceMetrics = {
  // Request times
  requestTimes: [],
  averageRequestTime: 0,
  
  // Database query times
  dbQueryTimes: [],
  averageDbQueryTime: 0,
  
  // API call times
  apiCallTimes: [],
  averageApiCallTime: 0,
  
  // Memory usage
  memoryUsage: {
    current: 0,
    peak: 0,
    history: []
  }
};

// ============================================================================
// TEMPORARY STORAGE (Demo Mode - Phase B)
// ============================================================================
let tempStorage = {
  // Demo user ID (Phase B only)
  demoUserId: 1,
  
  // In-memory storage for demo (will be replaced by database queries)
  demoShoppingList: [],
  demoAgenda: [],
  demoSearchResults: []
};

// ============================================================================
// GETTER/SETTER FUNCTIONS
// ============================================================================

/**
 * Get current JWT token
 */
function getJwtToken() {
  if (!authState.currentJwtToken || Date.now() >= authState.jwtTokenExpiry) {
    return null;
  }
  return authState.currentJwtToken;
}

/**
 * Set JWT token with expiry
 */
function setJwtToken(token, expiryDate) {
  authState.currentJwtToken = token;
  authState.jwtTokenExpiry = expiryDate;
}

/**
 * Check if API calls are enabled (Phase B: false, Phase C: true)
 */
function isApiEnabled() {
  return configState.features.apiCallsEnabled;
}

/**
 * Set API enabled state
 */
function setApiEnabled(enabled) {
  configState.features.apiCallsEnabled = enabled;
}

/**
 * Get user's conversation context
 */
function getUserContext(userId) {
  if (!nlpState.conversationContexts.has(userId)) {
    nlpState.conversationContexts.set(userId, {
      lastIntent: null,
      lastEntity: null,
      history: []
    });
  }
  return nlpState.conversationContexts.get(userId);
}

/**
 * Update user's conversation context
 */
function updateUserContext(userId, intent, entity) {
  const context = getUserContext(userId);
  context.lastIntent = intent;
  context.lastEntity = entity;
  context.history.push({
    intent,
    entity,
    timestamp: Date.now()
  });
  
  // Keep only last 10 messages
  if (context.history.length > 10) {
    context.history.shift();
  }
}

/**
 * Get from cache
 */
function getCached(cacheType, key) {
  const cache = cacheState[`${cacheType}Cache`];
  if (!cache) return null;
  return cache.get(key);
}

/**
 * Set cache
 */
function setCache(cacheType, key, value, ttl = 3600000) {
  const cache = cacheState[`${cacheType}Cache`];
  if (!cache) return;
  
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
}

/**
 * Clear expired cache entries
 */
function clearExpiredCache() {
  const now = Date.now();
  
  for (const [cacheType, cache] of Object.entries(cacheState)) {
    if (cache instanceof Map) {
      for (const [key, data] of cache.entries()) {
        if (data.expiresAt && data.expiresAt < now) {
          cache.delete(key);
        }
      }
    }
  }
}

/**
 * Increment statistics
 */
function incrementStat(statName) {
  if (statName in runtimeState) {
    runtimeState[statName]++;
  }
}

/**
 * Record error
 */
function recordError(errorType, error) {
  errorState.recentErrors.push({
    type: errorType,
    message: error.message,
    stack: error.stack,
    timestamp: Date.now()
  });
  
  // Keep only last 100 errors
  if (errorState.recentErrors.length > errorState.maxRecentErrors) {
    errorState.recentErrors.shift();
  }
  
  if (errorType in errorState.errorCounts) {
    errorState.errorCounts[errorType]++;
  }
  
  errorState.lastErrorTime = Date.now();
}

/**
 * Get system health status
 */
function getSystemHealth() {
  return {
    status: runtimeState.isInitialized && runtimeState.dbConnected ? 'healthy' : 'degraded',
    uptime: Date.now() - runtimeState.startTime,
    totalRequests: runtimeState.totalRequests,
    totalConversations: runtimeState.totalConversations,
    dbConnected: runtimeState.dbConnected,
    nlpInitialized: runtimeState.nlpInitialized,
    apiEnabled: configState.features.apiCallsEnabled,
    cacheSize: {
      predefinedQa: cacheState.predefinedQaCache.size,
      productSearch: cacheState.productSearchCache.size,
      nlpRules: cacheState.nlpRulesCache.size
    },
    recentErrors: errorState.recentErrors.length,
    memoryUsage: process.memoryUsage()
  };
}

/**
 * Reset all state (for testing)
 */
function resetAllState() {
  runtimeState = {
    isInitialized: false,
    startTime: null,
    environment: process.env.NODE_ENV || 'development',
    serverRunning: false,
    serverPort: null,
    dbConnected: false,
    dbConnectionPool: null,
    nlpInitialized: false,
    nlpManager: null,
    totalRequests: 0,
    totalConversations: 0,
    totalApiCalls: 0,
    uptime: 0
  };
  
  authState.activeUsers.clear();
  authState.activeSessions.clear();
  cacheState.predefinedQaCache.clear();
  cacheState.productSearchCache.clear();
  nlpState.conversationContexts.clear();
  errorState.recentErrors = [];
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  // State objects
  runtimeState,
  authState,
  cacheState,
  configState,
  nlpState,
  queueState,
  errorState,
  performanceMetrics,
  tempStorage,
  
  // Helper functions
  getJwtToken,
  setJwtToken,
  isApiEnabled,
  setApiEnabled,
  getUserContext,
  updateUserContext,
  getCached,
  setCache,
  clearExpiredCache,
  incrementStat,
  recordError,
  getSystemHealth,
  resetAllState
};

// ============================================================================
// USAGE EXAMPLE:
// ============================================================================
// const { runtimeState, getUserContext, setJwtToken } = require('./config/general_variable');
// 
// // Set JWT token
// setJwtToken('eyJ0eXA...', Date.now() + 7*24*60*60*1000);
// 
// // Get user context
// const context = getUserContext(userId);
// console.log(context.lastIntent);
// 
// // Check system health
// const health = getSystemHealth();
// console.log(health.status);
// ============================================================================