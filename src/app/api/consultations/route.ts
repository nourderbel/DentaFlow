import { NextResponse } from "next/server";
import { withAuth } from "@/server/http";
import { getPool } from "@/server/db";

export const GET = withAuth(async (_request, session) => {
  const rows = await getPool().query(
    `SELECT a.id,
            a.appointment_number AS consultationNumber,
            a.patient_id AS patientId,
            CONCAT(p.first_name, ' ', p.last_name) AS patientName,
            p.patient_number AS patientNumber,
            p.phone AS patientPhone,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS consultationDate,
            TIME_FORMAT(a.start_time, '%H:%i') AS consultationTime,
            COALESCE(a.appointment_type, 'Consultation') AS consultationType,
            a.notes,
            a.status,
            COALESCE(u.full_name, 'Praticien') AS practitioner
       FROM appointments a
       INNER JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
       LEFT JOIN users u ON u.id = a.dentist_id AND u.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
        AND a.deleted_at IS NULL
        AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
      ORDER BY a.appointment_date DESC, a.start_time DESC
      LIMIT 500`,
    [session.tenantId],
  );

  const [summary] = await getPool().query(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT patient_id) AS patients,
       COUNT(CASE WHEN appointment_date >= CURRENT_DATE() THEN 1 END) AS upcoming,
       COUNT(CASE WHEN appointment_date < CURRENT_DATE() THEN 1 END) AS completed
       FROM appointments
      WHERE tenant_id = ? AND deleted_at IS NULL
        AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
    [session.tenantId],
  );

  return NextResponse.json({ data: rows, summary });
});
