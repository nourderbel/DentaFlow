import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { nextDocumentNumber } from "@/server/numbering";
import { audit } from "@/server/audit";
import { ensureConsultationRecordingsTable } from "@/server/modules/consultations/recordings";

const consultationSchema = z.object({
  patientId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(255),
  diagnosis: z.string().trim().max(4000).default(""),
  anamnesis: z.string().trim().max(4000).default(""),
  treatment: z.string().trim().max(4000).default(""),
  recommendations: z.string().trim().max(4000).default(""),
  nextAppointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

async function ensureConsultationsTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS patient_consultations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      consultation_number VARCHAR(40) NOT NULL,
      consultation_date DATE NOT NULL,
      reason VARCHAR(255) NOT NULL,
      diagnosis TEXT NULL,
      anamnesis TEXT NULL,
      treatment TEXT NULL,
      recommendations TEXT NULL,
      next_appointment_date DATE NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX patient_consultations_lookup (tenant_id, patient_id, consultation_date),
      UNIQUE KEY tenant_consultation_number (tenant_id, consultation_number)
    ) ENGINE=InnoDB
  `);
}

export const GET = withAuth(async (_request, session) => {
  await ensureConsultationsTable();
  await ensureConsultationRecordingsTable();
  const [appointmentRows, consultationRows] = await Promise.all([
    getPool().query(
    `SELECT a.id,
            a.appointment_number AS consultationNumber,
            'appointment' AS source,
            a.patient_id AS patientId,
            CONCAT(p.first_name, ' ', p.last_name) AS patientName,
            p.patient_number AS patientNumber,
            p.phone AS patientPhone,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS consultationDate,
            TIME_FORMAT(a.start_time, '%H:%i') AS consultationTime,
            COALESCE(a.appointment_type, 'Consultation') AS consultationType,
            a.notes,
            NULL AS diagnosis,
            NULL AS anamnesis,
            NULL AS treatment,
            NULL AS recommendations,
            NULL AS nextAppointmentDate,
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
    ),
    getPool().query(
      `SELECT c.id,
              c.consultation_number AS consultationNumber,
              'clinical' AS source,
              c.patient_id AS patientId,
              CONCAT(p.first_name, ' ', p.last_name) AS patientName,
              p.patient_number AS patientNumber,
              p.phone AS patientPhone,
              DATE_FORMAT(c.consultation_date, '%Y-%m-%d') AS consultationDate,
              NULL AS consultationTime,
              c.reason AS consultationType,
              NULL AS notes,
              c.diagnosis,
              c.anamnesis,
              c.treatment,
              c.recommendations,
              DATE_FORMAT(c.next_appointment_date, '%Y-%m-%d') AS nextAppointmentDate,
              'COMPLETED' AS status,
              COALESCE(u.full_name, 'Praticien') AS practitioner
         FROM patient_consultations c
         INNER JOIN patients p ON p.id = c.patient_id AND p.tenant_id = c.tenant_id
         LEFT JOIN users u ON u.id = c.created_by AND u.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?
        ORDER BY c.consultation_date DESC, c.id DESC
        LIMIT 500`,
      [session.tenantId],
    ),
  ]);
  const recordings = consultationRows.length
    ? await getPool().query(
      `SELECT id, consultation_id AS consultationId, mime_type AS mimeType,
              size_bytes AS sizeBytes, duration_ms AS durationMs, created_at AS createdAt
         FROM consultation_recordings
        WHERE tenant_id = ? AND consultation_id IN (${consultationRows.map(() => "?").join(", ")})
        ORDER BY created_at DESC`,
      [session.tenantId, ...consultationRows.map((consultation: { id: number }) => consultation.id)],
    )
    : [];
  const recordingsByConsultation = new Map<number, typeof recordings>();
  for (const recording of recordings) {
    const consultationId = Number(recording.consultationId);
    const existing = recordingsByConsultation.get(consultationId) ?? [];
    existing.push(recording);
    recordingsByConsultation.set(consultationId, existing);
  }
  const rows = [...appointmentRows.map((appointment: Record<string, unknown>) => ({
    ...appointment,
    recordings: [],
  })), ...consultationRows.map((consultation: { id: number }) => ({
    ...consultation,
    recordings: recordingsByConsultation.get(Number(consultation.id)) ?? [],
  }))]
    .sort((left, right) => String(right.consultationDate).localeCompare(String(left.consultationDate)));

  const [appointmentSummary] = await getPool().query(
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

  return NextResponse.json({
    data: rows,
    summary: {
      total: Number(appointmentSummary.total) + consultationRows.length,
      patients: new Set(rows.map((row: { patientId: number }) => row.patientId)).size,
      upcoming: Number(appointmentSummary.upcoming),
      completed: Number(appointmentSummary.completed) + consultationRows.length,
    },
  });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = consultationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Données de consultation invalides.");
    await ensureConsultationsTable();
    const data = await withTransaction(async (connection) => {
      const patients = await connection.query(
        "SELECT id FROM patients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [parsed.data.patientId, session.tenantId],
      );
      if (!patients.length) throw new HttpError(404, "Patient introuvable.");
      const number = await nextDocumentNumber(connection, session.tenantId, "consultation", "CONS", 5);
      const result = await connection.query(
        `INSERT INTO patient_consultations
          (tenant_id, patient_id, consultation_number, consultation_date, reason, diagnosis,
           anamnesis, treatment, recommendations, next_appointment_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.tenantId, parsed.data.patientId, number, parsed.data.date, parsed.data.reason,
          parsed.data.diagnosis || null, parsed.data.anamnesis || null, parsed.data.treatment || null,
          parsed.data.recommendations || null, parsed.data.nextAppointmentDate, session.userId,
        ],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "patient_consultation", result.insertId, {
        consultation_number: number,
        patient_id: parsed.data.patientId,
      });
      return { id: result.insertId, consultationNumber: number };
    });
    return NextResponse.json({ data }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);
