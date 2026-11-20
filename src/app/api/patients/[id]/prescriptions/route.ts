import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";

type Params = { id: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Date de prescription invalide.");

const prescriptionSchema = z.object({
  prescriptionNumber: z.string().trim().max(80).default(""),
  date: dateSchema,
  practitioner: z.string().trim().min(1).max(160),
  registrationNumber: z.string().trim().min(1).max(80),
  practitionerAddress: z.string().trim().max(255).default(""),
  practitionerPhone: z.string().trim().max(40).default(""),
  patientName: z.string().trim().min(1).max(240),
  patientNumber: z.string().trim().min(1).max(40),
  medicines: z.string().trim().min(1).max(12000),
  instructions: z.string().trim().max(4000).default(""),
});

function parsePatientId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant patient invalide.");
  return id;
}

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS patient_prescriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      prescription_number VARCHAR(80) NOT NULL,
      prescription_date DATE NOT NULL,
      practitioner VARCHAR(160) NOT NULL,
      registration_number VARCHAR(80) NOT NULL,
      practitioner_address VARCHAR(255) NULL,
      practitioner_phone VARCHAR(40) NULL,
      patient_name VARCHAR(240) NOT NULL,
      patient_number VARCHAR(40) NOT NULL,
      medicines TEXT NOT NULL,
      instructions TEXT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX patient_prescriptions_lookup (tenant_id, patient_id, created_at)
    ) ENGINE=InnoDB
  `);
}

async function ensurePatientExists(tenantId: number, patientId: number) {
  const rows = await getPool().query(
    "SELECT id FROM patients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1",
    [patientId, tenantId],
  );
  if (!rows.length) throw new HttpError(404, "Patient introuvable.");
}

export const GET = withAuth<Params>(async (_request, session, { id }) => {
  const patientId = parsePatientId(id);
  await ensureTable();
  await ensurePatientExists(session.tenantId, patientId);
  const rows = await getPool().query(
    `SELECT id, prescription_number AS prescriptionNumber,
            DATE_FORMAT(prescription_date, '%Y-%m-%d') AS date,
            practitioner, registration_number AS registrationNumber,
            practitioner_address AS practitionerAddress, practitioner_phone AS practitionerPhone,
            patient_name AS patientName, patient_number AS patientNumber,
            medicines, instructions, created_at AS createdAt
       FROM patient_prescriptions
      WHERE tenant_id = ? AND patient_id = ?
      ORDER BY prescription_date DESC, id DESC`,
    [session.tenantId, patientId],
  );
  return NextResponse.json({ data: rows });
});

export const POST = withAuth<Params>(
  async (request, session, { id }) => {
    const parsed = prescriptionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Ordonnance invalide.");
    const patientId = parsePatientId(id);
    await ensureTable();
    await ensurePatientExists(session.tenantId, patientId);

    const result = await getPool().query(
      `INSERT INTO patient_prescriptions
        (tenant_id, patient_id, prescription_number, prescription_date, practitioner,
         registration_number, practitioner_address, practitioner_phone, patient_name,
         patient_number, medicines, instructions, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.tenantId, patientId, parsed.data.prescriptionNumber || "À générer",
        parsed.data.date, parsed.data.practitioner, parsed.data.registrationNumber,
        parsed.data.practitionerAddress || null, parsed.data.practitionerPhone || null,
        parsed.data.patientName, parsed.data.patientNumber, parsed.data.medicines,
        parsed.data.instructions || null, session.userId,
      ],
    );
    const prescriptionNumber = parsed.data.prescriptionNumber
      || `${parsed.data.patientNumber}-${parsed.data.date.replaceAll("-", "")}-${result.insertId}`;
    if (!parsed.data.prescriptionNumber) {
      await getPool().query(
        "UPDATE patient_prescriptions SET prescription_number = ? WHERE id = ? AND tenant_id = ?",
        [prescriptionNumber, result.insertId, session.tenantId],
      );
    }
    return NextResponse.json({
      data: {
        id: result.insertId,
        ...parsed.data,
        prescriptionNumber,
        createdAt: new Date().toISOString(),
      },
    }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);
