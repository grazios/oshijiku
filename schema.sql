-- 推し軸 (oshijiku.com) DB Schema
-- MariaDB / MySQL

CREATE TABLE IF NOT EXISTS `maps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `share_id` CHAR(24) NOT NULL,
  `delete_key` CHAR(24) NOT NULL,
  `title` VARCHAR(200) NOT NULL DEFAULT '',
  `data` JSON NOT NULL,
  `ip` VARCHAR(45) NOT NULL DEFAULT '',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_share_id` (`share_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
