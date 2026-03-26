// ============================================================================
// VOGO CHATBOT - DATABASE SERVICE
// Phase B: MySQL Database Layer with Connection Pooling
// File: src/services/database_service.js
// ============================================================================

const mysql = require('mysql2/promise');
const { DATABASE, ERROR_MESSAGES } = require('../../config/general_constant');
const { runtimeState, recordError } = require('../../config/general_variable');

// ============================================================================
// DATABASE CONNECTION POOL
// ============================================================================
let pool = null;
let dbInitialized = false;

/**
 * Initialize database connection pool
 */
async function initializeDatabase(config) {
  if (pool && dbInitialized) {
    return true;
  }

  if (pool && !dbInitialized) {
    try {
      await pool.end();
    } catch (_) {
      // Ignore cleanup errors for stale pools
    }
    pool = null;
  }

  try {
    console.log('🔌 Initializing database connection...');
    
    pool = mysql.createPool({
      host: config.DB_HOST || 'localhost',
      port: config.DB_PORT || 3306,
      user: config.DB_USER || 'root',
      password: config.DB_PASSWORD || config.DB_PASS || '',
      database: config.DB_NAME || 'vogo_chatbot',
      charset: config.DB_CHARSET || 'utf8mb4',
      connectionLimit: config.DB_POOL_MAX || 10,
      waitForConnections: true,
      queueLimit: 0,
      // ✅ FIX: Enable support for multiple statements and better null handling
      multipleStatements: false,
      namedPlaceholders: false
    });
    
    // Test connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    runtimeState.dbConnected = true;
    runtimeState.dbConnectionPool = pool;
    dbInitialized = true;
    
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    const errorMessage = error?.sqlMessage || error?.message || error?.code || 'Unknown database error';
    console.error('❌ Database connection failed:', errorMessage);
    if (error?.code) console.error('   Code:', error.code);
    if (error?.sqlState) console.error('   SQL State:', error.sqlState);
    if (error?.errno) console.error('   Errno:', error.errno);
    recordError('database', error);
    if (pool) {
      try {
        await pool.end();
      } catch (_) {
        // Ignore cleanup errors
      }
    }
    pool = null;
    dbInitialized = false;
    runtimeState.dbConnected = false;
    runtimeState.dbConnectionPool = null;
    return false;
  }
}

/**
 * Close database connection pool
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    dbInitialized = false;
    runtimeState.dbConnected = false;
    console.log('🔌 Database connection closed');
  }
}

/**
 * Sanitize parameter for MySQL - convert undefined to null, ensure proper types
 * @param {*} value - The value to sanitize
 * @returns {*} - Sanitized value safe for MySQL
 */
function sanitizeParam(value) {
  if (value === undefined) return null;
  if (value === '') return null;
  if (typeof value === 'number' && isNaN(value)) return null;
  return value;
}

/**
 * Sanitize all parameters in an array
 * @param {Array} params - Array of parameters
 * @returns {Array} - Sanitized parameters
 */
function sanitizeParams(params) {
  return params.map(sanitizeParam);
}

/**
 * Execute query with error handling
 * Uses pool.query() instead of pool.execute() for better compatibility
 */
async function executeQuery(sql, params = []) {
  if (!pool) {
    return { success: false, error: 'Database is not initialized' };
  }

  try {
    // ✅ FIX: Sanitize all parameters before executing
    const safeParams = sanitizeParams(params);
    
    // ✅ FIX: Use pool.query() instead of pool.execute() for better LIMIT support
    const [rows] = await pool.query(sql, safeParams);
    return { success: true, data: rows };
  } catch (error) {
    const errorMessage = error?.sqlMessage || error?.message || error?.code || 'Unknown query error';
    console.error('❌ Query failed:', errorMessage);
    if (error?.code) console.error('   Code:', error.code);
    if (error?.sqlState) console.error('   SQL State:', error.sqlState);
    if (error?.errno) console.error('   Errno:', error.errno);
    console.error('   SQL:', sql);
    console.error('   Params:', params);
    recordError('database', error);
    return { success: false, error: errorMessage, code: error?.code || null };
  }
}

function isDatabaseInitialized() {
  return dbInitialized && !!pool;
}

// ============================================================================
// NLP MODEL OPERATIONS
// ============================================================================

/**
 * Load NLP rules from database
 */
async function loadNlpRules(language = null) {
  let sql = `
    SELECT id, language, intent, keywords, regex_pattern, response, priority, active
    FROM ${DATABASE.TABLES.NLP_MODEL}
    WHERE active = TRUE
  `;
  
  const params = [];
  if (language) {
    sql += ' AND language = ?';
    params.push(language);
  }
  
  sql += ' ORDER BY priority DESC, id ASC';
  
  const result = await executeQuery(sql, params);
  return result.success ? result.data : [];
}

/**
 * Get NLP rule by ID
 */
async function getNlpRule(ruleId) {
  const sql = `SELECT * FROM ${DATABASE.TABLES.NLP_MODEL} WHERE id = ?`;
  const result = await executeQuery(sql, [ruleId]);
  return result.success && result.data.length > 0 ? result.data[0] : null;
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Get or create demo user
 */
async function getDemoUser() {
  let sql = `SELECT * FROM ${DATABASE.TABLES.USERS} WHERE username = 'demo_user'`;
  let result = await executeQuery(sql);
  
  if (result.success && result.data.length > 0) {
    return result.data[0];
  }
  
  // Create demo user if doesn't exist
  sql = `
    INSERT INTO ${DATABASE.TABLES.USERS} (username, email, subscription_level, preferred_language)
    VALUES ('demo_user', 'demo@vogo.family', 'standard', 'en')
  `;
  
  result = await executeQuery(sql);
  if (result.success) {
    return { id: result.data.insertId, username: 'demo_user' };
  }
  
  return null;
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const sql = `SELECT * FROM ${DATABASE.TABLES.USERS} WHERE id = ?`;
  const result = await executeQuery(sql, [userId]);
  return result.success && result.data.length > 0 ? result.data[0] : null;
}

// ============================================================================
// CONVERSATION LOGGING
// ============================================================================

/**
 * Log conversation to database
 */
async function logConversation(data) {
  const sql = `
    INSERT INTO ${DATABASE.TABLES.CONVERSATIONS} 
    (user_id, session_id, message_text, detected_language, detected_intent, 
     confidence_score, detection_method, response_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  // ✅ FIX: Ensure detection_method matches ENUM values exactly
  const validMethods = ['regex', 'keyword', 'nlp', 'fallback'];
  let method = String(data.detectionMethod || 'fallback').toLowerCase();
  if (!validMethods.includes(method)) {
    method = 'fallback';
  }
  
  // ✅ FIX: Ensure all values are properly typed, not undefined
  const params = [
    data.userId != null ? Number(data.userId) : null,
    data.sessionId != null ? Number(data.sessionId) : null,
    String(data.messageText || ''),
    String(data.detectedLanguage || 'en'),
    String(data.detectedIntent || 'unknown'),
    data.confidenceScore != null ? Number(data.confidenceScore) : 0,
    method,  // Now guaranteed to be valid ENUM value
    String(data.responseText || '')
  ];
  
  console.log('📝 Logging conversation:', {
    userId: params[0],
    message: params[2].substring(0, 30),
    intent: params[4],
    method: params[6]
  });
  
  const result = await executeQuery(sql, params);
  
  if (!result.success) {
    console.error('❌ Failed to log conversation:', result.error);
  } else {
    console.log('✅ Conversation logged successfully, ID:', result.data?.insertId);
  }
  
  return result;
}

/**
 * Get recent conversations for a user
 */
async function getRecentConversations(userId, limit = 10) {
  // ✅ FIX: Embed LIMIT directly in SQL to avoid prepared statement issues
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  
  const sql = `
    SELECT * FROM ${DATABASE.TABLES.CONVERSATIONS}
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
  
  const result = await executeQuery(sql, [userId]);
  return result.success ? result.data : [];
}

// ============================================================================
// SHOPPING LIST OPERATIONS
// ============================================================================

/**
 * Add item to shopping list
 */
async function addShoppingItem(userId, itemName, quantity = 1) {
  // ✅ FIX: Use direct INSERT instead of stored procedure for better compatibility
  const sql = `
    INSERT INTO ${DATABASE.TABLES.SHOPPING_LISTS} (user_id, item_name, quantity)
    VALUES (?, ?, ?)
  `;
  
  const result = await executeQuery(sql, [
    Number(userId),
    String(itemName),
    Number(quantity) || 1
  ]);
  
  if (result.success) {
    // Return the inserted item
    return {
      id: result.data.insertId,
      item_name: itemName,
      quantity: quantity,
      created_at: new Date()
    };
  }
  
  return null;
}

/**
 * Get user's shopping list
 */
async function getShoppingList(userId, includeCompleted = false) {
  let sql = `
    SELECT id, item_name, quantity, is_done, created_at, updated_at
    FROM ${DATABASE.TABLES.SHOPPING_LISTS}
    WHERE user_id = ?
  `;
  
  if (!includeCompleted) {
    sql += ' AND is_done = FALSE';
  }
  
  sql += ' ORDER BY created_at DESC';
  
  const result = await executeQuery(sql, [Number(userId)]);
  return result.success ? result.data : [];
}

/**
 * Mark shopping item as done
 */
async function markShoppingItemDone(userId, itemId) {
  const sql = `
    UPDATE ${DATABASE.TABLES.SHOPPING_LISTS}
    SET is_done = TRUE, completed_at = NOW()
    WHERE id = ? AND user_id = ?
  `;
  
  const result = await executeQuery(sql, [Number(itemId), Number(userId)]);
  return result.success && result.data.affectedRows > 0;
}

/**
 * Delete shopping item
 */
async function deleteShoppingItem(userId, itemId) {
  const sql = `
    DELETE FROM ${DATABASE.TABLES.SHOPPING_LISTS}
    WHERE id = ? AND user_id = ?
  `;
  
  const result = await executeQuery(sql, [Number(itemId), Number(userId)]);
  return result.success && result.data.affectedRows > 0;
}

// ============================================================================
// AGENDA OPERATIONS
// ============================================================================

/**
 * Add event to agenda
 */
async function addAgendaItem(userId, eventName, eventDatetime = null, location = null, participants = null) {
  // ✅ FIX: Use direct INSERT instead of stored procedure for better compatibility
  const sql = `
    INSERT INTO ${DATABASE.TABLES.AGENDA_ITEMS} 
    (user_id, event_name, event_datetime, location, participants)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  const result = await executeQuery(sql, [
    Number(userId),
    String(eventName),
    eventDatetime || null,  // Already in MySQL format or null
    location || null,
    participants || null
  ]);
  
  if (result.success) {
    return {
      id: result.data.insertId,
      event_name: eventName,
      event_datetime: eventDatetime,
      location: location,
      created_at: new Date()
    };
  }
  
  return null;
}

/**
 * Get user's agenda items
 */
async function getAgendaItems(userId, includeCompleted = false) {
  let sql = `
    SELECT id, event_name, event_datetime, location, participants, is_done, created_at
    FROM ${DATABASE.TABLES.AGENDA_ITEMS}
    WHERE user_id = ?
  `;
  
  if (!includeCompleted) {
    sql += ' AND is_done = FALSE';
  }
  
  sql += ' ORDER BY event_datetime ASC, created_at DESC';
  
  const result = await executeQuery(sql, [Number(userId)]);
  return result.success ? result.data : [];
}

/**
 * Mark agenda item as done
 */
async function markAgendaItemDone(userId, itemId) {
  const sql = `
    UPDATE ${DATABASE.TABLES.AGENDA_ITEMS}
    SET is_done = TRUE, completed_at = NOW()
    WHERE id = ? AND user_id = ?
  `;
  
  const result = await executeQuery(sql, [Number(itemId), Number(userId)]);
  return result.success && result.data.affectedRows > 0;
}

/**
 * Delete agenda item
 */
async function deleteAgendaItem(userId, itemId) {
  const sql = `
    DELETE FROM ${DATABASE.TABLES.AGENDA_ITEMS}
    WHERE id = ? AND user_id = ?
  `;
  
  const result = await executeQuery(sql, [Number(itemId), Number(userId)]);
  return result.success && result.data.affectedRows > 0;
}

// ============================================================================
// PRODUCT SEARCH OPERATIONS
// ============================================================================

/**
 * Search products in cache
 */
async function searchProducts(searchTerm, location = null) {
  // ✅ FIX: Use direct query instead of stored procedure
  let sql = `
    SELECT 
      id,
      product_title,
      product_link,
      category,
      price,
      in_stock
    FROM ${DATABASE.TABLES.PRODUCT_CACHE}
    WHERE search_term LIKE ?
  `;
  
  const params = [`%${searchTerm}%`];
  
  if (location) {
    sql += ' AND location = ?';
    params.push(location);
  }
  
  sql += ' AND (cache_expires_at IS NULL OR cache_expires_at > NOW())';
  sql += ' ORDER BY created_at DESC';
  
  const result = await executeQuery(sql, params);
  return result.success ? result.data : [];
}

/**
 * Add product to cache
 */
async function cacheProduct(data) {
  const sql = `
    INSERT INTO ${DATABASE.TABLES.PRODUCT_CACHE}
    (search_term, location, product_type, product_title, product_link, category, price, in_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    String(data.searchTerm),
    data.location || null,
    data.productType || 'product',
    String(data.productTitle),
    String(data.productLink),
    data.category || null,
    data.price != null ? Number(data.price) : null,
    data.inStock !== false ? 1 : 0
  ];
  
  return await executeQuery(sql, params);
}

// ============================================================================
// PREDEFINED QA CACHE OPERATIONS
// ============================================================================

/**
 * Get predefined questions from cache
 */
async function getPredefinedQaCache(parentId = null) {
  let sql = `
    SELECT qa_id, parent_id, question_text, html_text, link, position, is_active, question_type
    FROM ${DATABASE.TABLES.PREDEFINED_QA_CACHE}
    WHERE is_active = TRUE
  `;
  
  const params = [];
  if (parentId !== null) {
    sql += ' AND parent_id = ?';
    params.push(Number(parentId));
  } else {
    sql += ' AND parent_id IS NULL';
  }
  
  sql += ' ORDER BY position ASC';
  
  const result = await executeQuery(sql, params);
  return result.success ? result.data : [];
}

/**
 * Cache predefined question
 */
async function cachePredefinedQa(data) {
  const sql = `
    INSERT INTO ${DATABASE.TABLES.PREDEFINED_QA_CACHE}
    (qa_id, parent_id, question_text, html_text, link, position, is_active, question_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
    question_text = VALUES(question_text),
    html_text = VALUES(html_text),
    link = VALUES(link),
    position = VALUES(position),
    is_active = VALUES(is_active),
    question_type = VALUES(question_type)
  `;
  
  const params = [
    Number(data.id),
    data.parent_id != null ? Number(data.parent_id) : null,
    String(data.text || ''),
    data.html_text || null,
    data.link || null,
    Number(data.position) || 0,
    data.active !== false ? 1 : 0,
    String(data.type || 'label')
  ];
  
  return await executeQuery(sql, params);
}

// ============================================================================
// SYSTEM CONFIG OPERATIONS
// ============================================================================

/**
 * Get system configuration
 */
async function getSystemConfig(configKey = null) {
  let sql = `SELECT config_key, config_value, config_type FROM ${DATABASE.TABLES.SYSTEM_CONFIG}`;
  const params = [];
  
  if (configKey) {
    sql += ' WHERE config_key = ?';
    params.push(String(configKey));
  }
  
  const result = await executeQuery(sql, params);
  
  if (!result.success) return null;
  
  if (configKey) {
    return result.data.length > 0 ? result.data[0].config_value : null;
  }
  
  // Return as object
  const config = {};
  result.data.forEach(row => {
    let value = row.config_value;
    
    // Parse based on type
    if (row.config_type === 'number') {
      value = parseFloat(value);
    } else if (row.config_type === 'boolean') {
      value = value === 'true' || value === '1';
    } else if (row.config_type === 'json') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Keep as string if invalid JSON
      }
    }
    
    config[row.config_key] = value;
  });
  
  return config;
}

/**
 * Set system configuration
 */
async function setSystemConfig(configKey, configValue) {
  const sql = `
    INSERT INTO ${DATABASE.TABLES.SYSTEM_CONFIG} (config_key, config_value)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
  `;
  
  return await executeQuery(sql, [String(configKey), String(configValue)]);
}

// ============================================================================
// API LOGGING
// ============================================================================

/**
 * Log API call
 */
async function logApiCall(data) {
  const sql = `
    INSERT INTO ${DATABASE.TABLES.API_LOGS}
    (endpoint, http_method, request_body, response_status, response_body, response_time_ms, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    String(data.endpoint || ''),
    String(data.method || 'GET'),
    data.requestBody ? JSON.stringify(data.requestBody) : null,
    data.responseStatus != null ? Number(data.responseStatus) : null,
    data.responseBody ? JSON.stringify(data.responseBody) : null,
    data.responseTime != null ? Number(data.responseTime) : null,
    data.errorMessage || null
  ];
  
  return await executeQuery(sql, params);
}

// ============================================================================
// SERVER LOGGING
// ============================================================================

/**
 * Log server event to database
 */
async function logServerEvent(data) {
  const sql = `
    INSERT INTO ${DATABASE.TABLES.SERVER_LOGS}
    (log_level, log_category, message, metadata, user_ip, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;
  
  const params = [
    String(data.level || 'info'),
    String(data.category || 'general'),
    String(data.message || ''),
    data.metadata ? JSON.stringify(data.metadata) : null,
    data.userIp || null,
    data.userId != null ? Number(data.userId) : null
  ];
  
  return await executeQuery(sql, params);
}

/**
 * Get recent server logs
 */
async function getRecentServerLogs(limit = 100, category = null) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 1000);
  
  let sql = `
    SELECT * FROM ${DATABASE.TABLES.SERVER_LOGS}
    WHERE 1=1
  `;
  
  const params = [];
  
  if (category) {
    sql += ' AND log_category = ?';
    params.push(String(category));
  }
  
  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT ${safeLimit}`;
  
  const result = await executeQuery(sql, params);
  return result.success ? result.data : [];
}

/**
 * Clear old server logs
 */
async function clearOldServerLogs(daysToKeep = 7) {
  const sql = `
    DELETE FROM ${DATABASE.TABLES.SERVER_LOGS}
    WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
  `;
  
  return await executeQuery(sql, [Number(daysToKeep)]);
}

/**
 * Ensure server_logs table exists
 */
async function ensureServerLogsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${DATABASE.TABLES.SERVER_LOGS} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      log_level ENUM('info', 'warn', 'error', 'debug') NOT NULL DEFAULT 'info',
      log_category VARCHAR(50) NOT NULL DEFAULT 'general',
      message TEXT NOT NULL,
      metadata JSON NULL,
      user_ip VARCHAR(45) NULL,
      user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_log_level (log_level),
      INDEX idx_log_category (log_category),
      INDEX idx_created_at (created_at),
      INDEX idx_user_ip (user_ip)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;

  return await executeQuery(sql);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check database health
 */
async function checkHealth() {
  try {
    const result = await executeQuery('SELECT 1 as health');
    return result.success;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  // Connection
  initializeDatabase,
  closeDatabase,
  checkHealth,
  isDatabaseInitialized,
  
  // NLP
  loadNlpRules,
  getNlpRule,
  
  // Users
  getDemoUser,
  getUserById,
  
  // Conversations
  logConversation,
  getRecentConversations,
  
  // Shopping List
  addShoppingItem,
  getShoppingList,
  markShoppingItemDone,
  deleteShoppingItem,
  
  // Agenda
  addAgendaItem,
  getAgendaItems,
  markAgendaItemDone,
  deleteAgendaItem,
  
  // Product Search
  searchProducts,
  cacheProduct,
  
  // Predefined QA
  getPredefinedQaCache,
  cachePredefinedQa,
  
  // System Config
  getSystemConfig,
  setSystemConfig,
  
  // API Logging
  logApiCall,
  
  // Server Logging
  logServerEvent,
  getRecentServerLogs,
  clearOldServerLogs,
  ensureServerLogsTable
};