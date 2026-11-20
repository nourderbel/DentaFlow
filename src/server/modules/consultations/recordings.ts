import { getPool } from "@/server/db";

export async function ensureConsultationRecordingsTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS consultation_recordings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      consultation_id BIGINT UNSIGNED NOT NULL,
      storage_key CHAR(36) NOT NULL,
      mime_type VARCHAR(80) NOT NULL,
      size_bytes BIGINT UNSIGNED NOT NULL,
      duration_ms INT UNSIGNED NOT NULL,
      consent_at TIMESTAMP(3) NOT NULL,
      recorded_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_consultation_recordings_lookup (tenant_id, consultation_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
