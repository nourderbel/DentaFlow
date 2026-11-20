import { getPool } from "@/server/db";

export async function ensureTreasuryTables() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS treasury_entries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(20) NOT NULL,
      reference VARCHAR(40) NOT NULL,
      entry_date DATE NOT NULL,
      beneficiary VARCHAR(180) NOT NULL,
      method VARCHAR(40) NOT NULL,
      document VARCHAR(80) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      amount DECIMAL(12,3) NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX treasury_entry_lookup (tenant_id, entry_date, id)
    ) ENGINE=InnoDB
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      invoice_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(12,3) NOT NULL,
      payment_date DATE NOT NULL,
      method VARCHAR(40) NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX invoice_payment_lookup (tenant_id, invoice_id, payment_date, id)
    ) ENGINE=InnoDB
  `);
}
