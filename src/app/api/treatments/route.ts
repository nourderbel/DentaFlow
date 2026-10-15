import { NextResponse } from "next/server";
import { withAuth } from "@/server/http";
import { getPool } from "@/server/db";

async function ensureTable() {
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
}

export const GET = withAuth(async (_request, session) => {
  await ensureTable();
  const rows = await getPool().query(
    `SELECT t.id, t.patient_id AS patientId, t.phase, t.treatment, t.teeth,
            t.amount, t.status, t.dentist, t.planned_date AS plannedDate,
            CONCAT(p.first_name, ' ', p.last_name) AS patientName,
            p.patient_number AS patientNumber
       FROM patient_treatments t
       INNER JOIN patients p ON p.id = t.patient_id AND p.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND p.deleted_at IS NULL
      ORDER BY t.planned_date, t.id`,
    [session.tenantId],
  );
  return NextResponse.json({ data: rows });
});
