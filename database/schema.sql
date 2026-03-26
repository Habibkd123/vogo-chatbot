-- ============================================================================
-- VOGO CHATBOT - DATABASE SCHEMA
-- Phase B: MySQL Database Setup
-- ============================================================================

CREATE DATABASE IF NOT EXISTS vogo_chatbot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE vogo_chatbot;

-- ============================================================================
-- NLP MODEL
-- ============================================================================
CREATE TABLE IF NOT EXISTS nlp_model (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  language      VARCHAR(10)   NOT NULL DEFAULT 'en',
  intent        VARCHAR(100)  NOT NULL,
  keywords      TEXT,
  regex_pattern TEXT,
  response      TEXT,
  priority      INT           NOT NULL DEFAULT 5,
  active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_language (language),
  INDEX idx_intent   (intent),
  INDEX idx_active   (active),
  INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username           VARCHAR(100)  NOT NULL UNIQUE,
  email              VARCHAR(255)  NOT NULL UNIQUE,
  subscription_level ENUM('standard','vip','premium') NOT NULL DEFAULT 'standard',
  preferred_language VARCHAR(10)   NOT NULL DEFAULT 'en',
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email    (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED,
  session_key VARCHAR(255) NOT NULL UNIQUE,
  expires_at  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_session_key (session_key),
  INDEX idx_expires_at  (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED,
  session_id        INT UNSIGNED,
  message_text      TEXT          NOT NULL,
  detected_language VARCHAR(10)   NOT NULL DEFAULT 'en',
  detected_intent   VARCHAR(100)  NOT NULL DEFAULT 'unknown',
  confidence_score  DECIMAL(5,4)  NOT NULL DEFAULT 0,
  detection_method  ENUM('regex','keyword','nlp','fallback') NOT NULL DEFAULT 'fallback',
  response_text     TEXT,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  INDEX idx_user_id    (user_id),
  INDEX idx_session_id (session_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SHOPPING LISTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS shopping_lists (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED  NOT NULL,
  item_name    VARCHAR(255)  NOT NULL,
  quantity     INT           NOT NULL DEFAULT 1,
  is_done      BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at DATETIME,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id  (user_id),
  INDEX idx_is_done  (is_done)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- AGENDA ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS agenda_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED  NOT NULL,
  event_name      VARCHAR(255)  NOT NULL,
  event_datetime  DATETIME,
  location        VARCHAR(255),
  participants    TEXT,
  is_done         BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at    DATETIME,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id        (user_id),
  INDEX idx_event_datetime (event_datetime),
  INDEX idx_is_done        (is_done)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- PRODUCT CACHE
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_cache (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  search_term      VARCHAR(255)  NOT NULL,
  location         VARCHAR(255),
  product_type     VARCHAR(100)  NOT NULL DEFAULT 'product',
  product_title    VARCHAR(500)  NOT NULL,
  product_link     TEXT          NOT NULL,
  category         VARCHAR(255),
  price            DECIMAL(10,2),
  in_stock         BOOLEAN       NOT NULL DEFAULT TRUE,
  cache_expires_at DATETIME,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_search_term      (search_term),
  INDEX idx_cache_expires_at (cache_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- PREDEFINED QA CACHE
-- ============================================================================
CREATE TABLE IF NOT EXISTS predefined_qa_cache (
  qa_id         INT UNSIGNED  NOT NULL,
  parent_id     INT UNSIGNED,
  question_text TEXT          NOT NULL,
  html_text     TEXT,
  link          TEXT,
  position      INT           NOT NULL DEFAULT 0,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  question_type VARCHAR(50)   NOT NULL DEFAULT 'label',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (qa_id),
  INDEX idx_parent_id (parent_id),
  INDEX idx_is_active (is_active),
  INDEX idx_position  (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- API LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_logs (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  endpoint         VARCHAR(500)  NOT NULL,
  http_method      VARCHAR(10)   NOT NULL DEFAULT 'GET',
  request_body     TEXT,
  response_status  SMALLINT UNSIGNED,
  response_body    TEXT,
  response_time_ms INT UNSIGNED,
  error_message    TEXT,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_endpoint   (endpoint(100)),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- SYSTEM CONFIG
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_config (
  config_key   VARCHAR(100)  NOT NULL,
  config_value TEXT,
  config_type  VARCHAR(20)   NOT NULL DEFAULT 'string',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW v_active_shopping_lists AS
  SELECT s.*, u.username, u.email
  FROM shopping_lists s
  JOIN users u ON s.user_id = u.id
  WHERE s.is_done = FALSE;

CREATE OR REPLACE VIEW v_upcoming_agenda AS
  SELECT a.*, u.username, u.email
  FROM agenda_items a
  JOIN users u ON a.user_id = u.id
  WHERE a.is_done = FALSE
  ORDER BY a.event_datetime ASC;

CREATE OR REPLACE VIEW v_recent_conversations AS
  SELECT c.*, u.username
  FROM conversations c
  LEFT JOIN users u ON c.user_id = u.id
  ORDER BY c.created_at DESC;

-- ============================================================================
-- SEED DATA
-- ============================================================================
INSERT IGNORE INTO users (id, username, email, subscription_level, preferred_language)
VALUES
  (1, 'demo_user', 'demo@vogo.family',  'standard', 'en'),
  (2, 'vip_user',  'vip@vogo.family',   'vip',      'en');

INSERT IGNORE INTO system_config (config_key, config_value, config_type) VALUES
  ('app_version',    '2.0.0', 'string'),
  ('nlp_enabled',    'true',  'boolean'),
  ('groq_enabled',   'true',  'boolean'),
  ('cache_ttl_mins', '10',    'number');
