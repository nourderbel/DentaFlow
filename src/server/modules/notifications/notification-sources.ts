import { getPool } from "@/server/db";

export async function ensureNotificationSourceTables() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_states (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      notification_key VARCHAR(100) NOT NULL,
      read_at TIMESTAMP(3) NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY notification_state_user (tenant_id, user_id, notification_key),
      INDEX notification_state_lookup (tenant_id, user_id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      notification_key VARCHAR(100) NOT NULL,
      category VARCHAR(30) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      context VARCHAR(500) NOT NULL DEFAULT '',
      href VARCHAR(500) NOT NULL,
      notification_date DATE NULL,
      read_at TIMESTAMP(3) NULL,
      first_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      resolved_at TIMESTAMP(3) NULL,
      UNIQUE KEY notification_history_user (tenant_id, user_id, notification_key),
      INDEX notification_history_lookup (tenant_id, user_id, first_seen_at)
    ) ENGINE=InnoDB
  `);
}
