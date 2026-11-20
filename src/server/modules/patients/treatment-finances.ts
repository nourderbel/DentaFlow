import { getPool } from "@/server/db";

export async function ensureTreatmentFinanceTables() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS patient_treatments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      phase VARCHAR(80) NOT NULL,
      treatment VARCHAR(255) NOT NULL,
      teeth VARCHAR(120) NULL,
      amount DECIMAL(12,3) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'À faire',
      dentist VARCHAR(160) NOT NULL,
      planned_date DATE NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX patient_treatments_lookup (tenant_id, patient_id)
    ) ENGINE=InnoDB
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS treatment_finances (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      treatment_id BIGINT UNSIGNED NOT NULL,
      total_agreed DECIMAL(12,3) NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_treatment_finance (tenant_id, treatment_id),
      INDEX treatment_finance_patient (tenant_id, patient_id)
    ) ENGINE=InnoDB
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS treatment_payments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      treatment_id BIGINT UNSIGNED NOT NULL,
      finance_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(12,3) NOT NULL,
      payment_date DATE NOT NULL,
      method VARCHAR(40) NOT NULL,
      note VARCHAR(255) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX treatment_payment_lookup (tenant_id, patient_id, treatment_id)
    ) ENGINE=InnoDB
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS treatment_price_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      treatment_id BIGINT UNSIGNED NOT NULL,
      old_amount DECIMAL(12,3) NOT NULL,
      new_amount DECIMAL(12,3) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      changed_by BIGINT UNSIGNED NOT NULL,
      changed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX treatment_price_history_lookup (tenant_id, patient_id, treatment_id)
    ) ENGINE=InnoDB
  `);
}

export function decimalToMilli(value: string | number): number {
  const [whole, fraction = ""] = String(value).split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}
