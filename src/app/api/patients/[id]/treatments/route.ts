import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";

const treatmentSchema = z.object({
  phase: z.string().trim().min(1).max(80),
  treatment: z.string().trim().min(1).max(255),
  teeth: z.string().trim().max(120).default(""),
  amount: z.number().min(0),
  status: z.enum(["À faire", "En cours", "Terminé"]).default("À faire"),
  dentist: z.string().trim().min(1).max(160),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Params = { id: string };

function patientId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant patient invalide.");
  return id;
}

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

export const GET = withAuth<Params>(async (_request, session, { id }) => {
  await ensureTable();
  const rows = await getPool().query(
    `SELECT id, phase, treatment, teeth, amount, status, dentist, planned_date AS plannedDate
       FROM patient_treatments
      WHERE tenant_id = ? AND patient_id = ?
      ORDER BY planned_date, id`,
    [session.tenantId, patientId(id)],
  );
  return NextResponse.json({ data: rows });
});

export const POST = withAuth<Params>(
  async (request, session, { id }) => {
    const parsed = treatmentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Traitement invalide.");
    await ensureTable();
    await getPool().query(
      `INSERT INTO patient_treatments
        (tenant_id, patient_id, phase, treatment, teeth, amount, status, dentist, planned_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.tenantId, patientId(id), parsed.data.phase, parsed.data.treatment, parsed.data.teeth || null,
        parsed.data.amount, parsed.data.status, parsed.data.dentist, parsed.data.plannedDate, session.userId],
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);
