// ============================================================================
// VOGO CHATBOT - LOGGING SERVICE
// Local SQLite-backed detailed logging (logs/server-logs.db)
// Controlled by SHOW_DETAILED_LOGS environment variable
// ============================================================================

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

let showDetailedLogs = false;
let sqliteDb = null;
let sqliteReady = false;
let sqliteInitPromise = null;
let lastDbError = null;
let lastDbErrorAt = null;

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const LOGS_DB_PATH = path.join(LOGS_DIR, 'server-logs.db');

function parseBooleanEnv(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function openSqliteDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(LOGS_DB_PATH, (error) => {
      if (error) return reject(error);
      return resolve(db);
    });
  });
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!sqliteDb) return reject(new Error('SQLite DB not initialized'));
    sqliteDb.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      return resolve(this);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!sqliteDb) return reject(new Error('SQLite DB not initialized'));
    sqliteDb.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      return resolve(rows || []);
    });
  });
}

async function initializeLocalLogsDb() {
  if (sqliteReady && sqliteDb) return true;
  if (sqliteInitPromise) return sqliteInitPromise;

  sqliteInitPromise = (async () => {
    try {
      ensureLogsDir();
      sqliteDb = await openSqliteDb();

      await runSql('PRAGMA journal_mode = WAL');
      await runSql('PRAGMA synchronous = NORMAL');

      await runSql(`
        CREATE TABLE IF NOT EXISTS server_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          log_level TEXT NOT NULL DEFAULT 'info',
          log_category TEXT NOT NULL DEFAULT 'general',
          message TEXT NOT NULL,
          metadata TEXT NULL,
          user_ip TEXT NULL,
          user_id TEXT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      await runSql('CREATE INDEX IF NOT EXISTS idx_server_logs_category ON server_logs(log_category)');
      await runSql('CREATE INDEX IF NOT EXISTS idx_server_logs_created_at ON server_logs(created_at DESC)');
      await runSql('CREATE INDEX IF NOT EXISTS idx_server_logs_level ON server_logs(log_level)');

      sqliteReady = true;
      lastDbError = null;
      lastDbErrorAt = null;
      return true;
    } catch (error) {
      sqliteReady = false;
      lastDbError = error?.message || 'Failed to initialize local logs DB';
      lastDbErrorAt = new Date().toISOString();
      console.error('[LOGGING] Failed to initialize local logs DB:', lastDbError);
      return false;
    } finally {
      sqliteInitPromise = null;
    }
  })();

  return sqliteInitPromise;
}

function initialize() {
  showDetailedLogs = parseBooleanEnv(process.env.SHOW_DETAILED_LOGS);
  if (!showDetailedLogs) return;

  console.log('[LOGGING] Detailed logging enabled - logs will be saved locally to SQLite');
  initializeLocalLogsDb().then((ready) => {
    if (ready) {
      console.log(`[LOGGING] Local logs DB ready: ${LOGS_DB_PATH}`);
    } else {
      console.error('[LOGGING] Local logs DB unavailable - console logging only');
    }
  });
}

function isEnabled() {
  return showDetailedLogs;
}

function setEnabled(enabled) {
  showDetailedLogs = !!enabled;
}

function formatMetadataForConsole(metadata) {
  if (!metadata || (typeof metadata === 'object' && Object.keys(metadata).length === 0)) {
    return '';
  }

  try {
    return `\n  details=${JSON.stringify(metadata)}`;
  } catch (_) {
    return '\n  details=[unserializable metadata]';
  }
}

async function logToDatabase(data) {
  if (!showDetailedLogs) return null;

  if (!sqliteReady) {
    const ready = await initializeLocalLogsDb();
    if (!ready) return null;
  }

  try {
    const createdAt = data.timestamp || new Date().toISOString();
    const metadataText = data.metadata ? JSON.stringify(data.metadata) : null;

    await runSql(
      `
        INSERT INTO server_logs
          (log_level, log_category, message, metadata, user_ip, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        data.level || 'info',
        data.category || 'general',
        data.message || '',
        metadataText,
        data.userIp || null,
        data.userId != null ? String(data.userId) : null,
        createdAt
      ]
    );

    return { success: true };
  } catch (error) {
    lastDbError = error?.message || 'Failed to write log';
    lastDbErrorAt = new Date().toISOString();
    console.error('[LOGGING] Failed to save log to local DB:', lastDbError);
    return null;
  }
}

async function getRecentLogs(limit = 100, category = null) {
  if (!showDetailedLogs) return [];

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 1000);

  if (!sqliteReady) {
    const ready = await initializeLocalLogsDb();
    if (!ready) return [];
  }

  try {
    let sql = `
      SELECT id, log_level, log_category, message, metadata, user_ip, user_id, created_at
      FROM server_logs
    `;
    const params = [];

    if (category) {
      sql += ' WHERE log_category = ?';
      params.push(String(category));
    }

    sql += ' ORDER BY datetime(created_at) DESC, id DESC LIMIT ?';
    params.push(safeLimit);

    const rows = await allSql(sql, params);
    return rows || [];
  } catch (error) {
    lastDbError = error?.message || 'Failed to fetch logs';
    lastDbErrorAt = new Date().toISOString();
    console.error('[LOGGING] Failed to fetch logs:', lastDbError);
    return [];
  }
}

async function clearOldLogs(daysToKeep = 7) {
  if (!showDetailedLogs) return false;

  if (!sqliteReady) {
    const ready = await initializeLocalLogsDb();
    if (!ready) return false;
  }

  try {
    const keepDays = Math.max(1, parseInt(daysToKeep, 10) || 7);
    await runSql(
      `
        DELETE FROM server_logs
        WHERE datetime(created_at) < datetime('now', ?)
      `,
      [`-${keepDays} days`]
    );
    return true;
  } catch (error) {
    lastDbError = error?.message || 'Failed to clear old logs';
    lastDbErrorAt = new Date().toISOString();
    console.error('[LOGGING] Failed to clear old logs:', lastDbError);
    return false;
  }
}

function log(level, category, message, metadata = {}, userIp = null, userId = null) {
  if (!showDetailedLogs) return;

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    metadata,
    userIp,
    userId
  };

  console.log(`[${level.toUpperCase()}] [${category}] ${message}${formatMetadataForConsole(metadata)}`);
  logToDatabase(logEntry);
}

function info(category, message, metadata = {}, userIp = null, userId = null) {
  log('info', category, message, metadata, userIp, userId);
}

function warn(category, message, metadata = {}, userIp = null, userId = null) {
  log('warn', category, message, metadata, userIp, userId);
}

function error(category, message, metadata = {}, userIp = null, userId = null) {
  log('error', category, message, metadata, userIp, userId);
}

function debug(category, message, metadata = {}, userIp = null, userId = null) {
  log('debug', category, message, metadata, userIp, userId);
}

function logApiCall(endpoint, method, requestBody, responseBody, status, responseTime, userIp = null) {
  if (!showDetailedLogs) return;

  const message = `${method} ${endpoint} - ${status} (${responseTime}ms)`;
  const metadata = {
    endpoint,
    method,
    requestBody,
    responseBody,
    status,
    responseTime
  };

  info('api_call', message, metadata, userIp);

  if (Number(status) >= 400 || Number(status) === 0) {
    const errorMessage = responseBody?.error || responseBody?.message || 'API call failed';
    error('api_error', `API error on ${method} ${endpoint}: ${errorMessage}`, metadata, userIp);
  }
}

function logOperatorAction(action, threadId, supportUserId, message, userIp = null) {
  if (!showDetailedLogs) return;

  const metadata = {
    action,
    threadId,
    supportUserId
  };

  info('operator_action', message, metadata, userIp);
}

function logUserMessage(text, intent, confidence, method, language, userIp = null) {
  if (!showDetailedLogs) return;

  const message = `User message: "${String(text || '').substring(0, 100)}"`;
  const metadata = {
    text,
    intent,
    confidence,
    method,
    language
  };

  info('user_message', message, metadata, userIp);
}

function logChatbotResponse(responseText, intent, confidence, method, language, userIp = null, extraMetadata = {}) {
  if (!showDetailedLogs) return;

  const safeResponse = String(responseText || '');
  const message = `Chatbot response: "${safeResponse.substring(0, 120)}"`;
  const metadata = {
    responseText: safeResponse,
    intent,
    confidence,
    method,
    language,
    ...extraMetadata
  };

  info('chatbot_response', message, metadata, userIp);
}

function logChatbotAction(action, details = {}, userIp = null, userId = null) {
  if (!showDetailedLogs) return;

  const message = `Chatbot action: ${action}`;
  info('chatbot_action', message, { action, ...details }, userIp, userId);
}

function logError(category, errorObject, metadata = {}, userIp = null, userId = null) {
  if (!showDetailedLogs) return;

  const errorMessage = errorObject instanceof Error ? errorObject.message : String(errorObject || 'Unknown error');
  const details = {
    ...metadata,
    error: errorMessage,
    stack: errorObject instanceof Error ? errorObject.stack : undefined
  };

  error(category || 'error', errorMessage, details, userIp, userId);
}

function getStatus() {
  return {
    enabled: showDetailedLogs,
    persistentReady: sqliteReady,
    engine: 'sqlite',
    dbPath: LOGS_DB_PATH,
    lastDbError,
    lastDbErrorAt
  };
}

module.exports = {
  initialize,
  isEnabled,
  setEnabled,
  log,
  info,
  warn,
  error,
  debug,
  logApiCall,
  logOperatorAction,
  logUserMessage,
  logChatbotResponse,
  logChatbotAction,
  logError,
  getStatus,
  getRecentLogs,
  clearOldLogs
};
