-- ============================================================================
-- VOGO CHATBOT - SERVER LOGS TABLE
-- Stores detailed server logs when SHOW_DETAILED_LOGS is enabled
-- ============================================================================

CREATE TABLE IF NOT EXISTS `server_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `log_level` ENUM('info', 'warn', 'error', 'debug') NOT NULL DEFAULT 'info',
  `log_category` VARCHAR(50) NOT NULL DEFAULT 'general',
  `message` TEXT NOT NULL,
  `metadata` JSON NULL,
  `user_ip` VARCHAR(45) NULL,
  `user_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_log_level` (`log_level`),
  INDEX `idx_log_category` (`log_category`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_user_ip` (`user_ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABLE DESCRIPTION:
-- - log_level: Severity level (info, warn, error, debug)
-- - log_category: Category for filtering (api_call, user_message, operator_action, etc.)
-- - message: Human-readable log message
-- - metadata: Additional structured data in JSON format
-- - user_ip: IP address of the user who triggered the log
-- - user_id: User ID if authenticated
-- - created_at: Timestamp when log was created
-- ============================================================================
