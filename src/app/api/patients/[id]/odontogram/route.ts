import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";

const toothStateSchema = z.object({
  toothNumber: z.number().int().min(11).max(48),
  status: z.string().trim().min(1).max(40),
  note: z.string().trim().max(2000).default(""),
  view: z.enum(["initial", "current"]).default("current"),
});

type Params = { id: string };

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS patient_odontogram (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      tooth_number TINYINT UNSIGNED NOT NULL,
      initial_status VARCHAR(40) NOT NULL DEFAULT 'Sain',
      initial_note TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Sain',
      note TEXT NULL,
      updated_by BIGINT UNSIGNED NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY patient_tooth (tenant_id, patient_id, tooth_number),
      INDEX patient_lookup (tenant_id, patient_id)
    ) ENGINE=InnoDB
  `);
  const columns = await getPool().query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patient_odontogram'
        AND COLUMN_NAME IN ('initial_status', 'initial_note')`,
  );
  const existing = new Set(columns.map((column: { name: string }) => column.name));
  if (!existing.has("initial_status")) {
    await getPool().query("ALTER TABLE patient_odontogram ADD COLUMN initial_status VARCHAR(40) NOT NULL DEFAULT 'Sain' AFTER tooth_number");
    await getPool().query("UPDATE patient_odontogram SET initial_status = status WHERE initial_status = 'Sain' AND status <> 'Sain'");
  }
  if (!existing.has("initial_note")) {
    await getPool().query("ALTER TABLE patient_odontogram ADD COLUMN initial_note TEXT NULL AFTER initial_status");
    await getPool().query("UPDATE patient_odontogram SET initial_note = note WHERE initial_note IS NULL AND note IS NOT NULL");
  }
}

function parsePatientId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant patient invalide.");
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id }) => {
  const patientId = parsePatientId(id);
  await ensureTable();
  const rows = await getPool().query(
    `SELECT tooth_number AS toothNumber,
            COALESCE(initial_status, status) AS initialStatus,
            COALESCE(initial_note, note) AS initialNote,
            status AS currentStatus,
            note AS currentNote
       FROM patient_odontogram
      WHERE tenant_id = ? AND patient_id = ?
      ORDER BY tooth_number`,
    [session.tenantId, patientId],
  );
  return NextResponse.json({ data: rows });
});

export const PUT = withAuth<Params>(
  async (request, session, { id }) => {
    const patientId = parsePatientId(id);
    const parsed = toothStateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "État dentaire invalide.");
    await ensureTable();
    await getPool().query(
      `INSERT INTO patient_odontogram
        (tenant_id, patient_id, tooth_number, initial_status, initial_note, status, note, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         initial_status = IF(? = 'initial', VALUES(initial_status), initial_status),
         initial_note = IF(? = 'initial', VALUES(initial_note), initial_note),
         status = IF(? = 'current', VALUES(status), status),
         note = IF(? = 'current', VALUES(note), note),
         updated_by = VALUES(updated_by)`,
      [
        session.tenantId,
        patientId,
        parsed.data.toothNumber,
        parsed.data.status,
        parsed.data.note || null,
        parsed.data.status,
        parsed.data.note || null,
        session.userId,
        parsed.data.view,
        parsed.data.view,
        parsed.data.view,
        parsed.data.view,
      ],
    );
    return NextResponse.json({ ok: true });
  },
  { roles: WRITE_ROLES },
);
