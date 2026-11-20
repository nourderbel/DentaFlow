import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";

const toothStateSchema = z.object({
  toothNumber: z.number().int().refine((number) => {
    const quadrant = Math.floor(number / 10);
    const position = number % 10;
    return (quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8)
      || (quadrant >= 5 && quadrant <= 8 && position >= 1 && position <= 5);
  }, "Numéro de dent FDI invalide."),
  status: z.string().trim().min(1).max(40),
  note: z.string().trim().max(2000).default(""),
  view: z.enum(["initial", "current"]).default("current"),
});

const builtInClinicalStatuses = new Set([
  "sain", "carie", "obturation", "couronne", "bridge", "implant", "endodontie",
  "extraction", "absente", "planifié", "prothèse", "facette", "fracture",
  "mobilité", "infection", "autre",
]);

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

async function ensureSettingsTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS patient_odontogram_settings (
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      dentition_type VARCHAR(12) NOT NULL DEFAULT 'adult',
      updated_by BIGINT UNSIGNED NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (tenant_id, patient_id)
    ) ENGINE=InnoDB
  `);
}

async function ensureClinicalStatusesTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS tenant_clinical_statuses (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(40) NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY tenant_status (tenant_id, status),
      INDEX tenant_lookup (tenant_id)
    ) ENGINE=InnoDB
  `);
}

function parsePatientId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant patient invalide.");
  return id;
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
  await ensureSettingsTable();
  await ensureClinicalStatusesTable();
  await ensurePatientExists(session.tenantId, patientId);
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
  const settings = await getPool().query(
    "SELECT dentition_type AS dentitionType FROM patient_odontogram_settings WHERE tenant_id = ? AND patient_id = ? LIMIT 1",
    [session.tenantId, patientId],
  );
  const clinicalStatuses = await getPool().query(
    "SELECT status FROM tenant_clinical_statuses WHERE tenant_id = ? ORDER BY status",
    [session.tenantId],
  );
  return NextResponse.json({
    data: rows,
    dentitionType: settings[0]?.dentitionType === "child" ? "child" : "adult",
    clinicalStatuses: clinicalStatuses.map((item: { status: string }) => item.status),
  });
});

export const POST = withAuth<Params>(
  async (request, session, { id }) => {
    const patientId = parsePatientId(id);
    const parsed = z.object({ status: z.string().trim().min(1).max(40) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "État clinique invalide.");
    if (builtInClinicalStatuses.has(parsed.data.status.toLocaleLowerCase("fr"))) {
      throw new HttpError(409, "Cet état clinique existe déjà.");
    }
    await ensureClinicalStatusesTable();
    await ensurePatientExists(session.tenantId, patientId);
    await getPool().query(
      "INSERT IGNORE INTO tenant_clinical_statuses (tenant_id, status, created_by) VALUES (?, ?, ?)",
      [session.tenantId, parsed.data.status, session.userId],
    );
    const rows = await getPool().query(
      "SELECT status FROM tenant_clinical_statuses WHERE tenant_id = ? ORDER BY status",
      [session.tenantId],
    );
    const savedStatus = rows.find((item: { status: string }) => item.status.toLocaleLowerCase() === parsed.data.status.toLocaleLowerCase())?.status
      ?? parsed.data.status;
    return NextResponse.json({
      status: savedStatus,
      clinicalStatuses: rows.map((item: { status: string }) => item.status),
    }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);

export const PUT = withAuth<Params>(
  async (request, session, { id }) => {
    const patientId = parsePatientId(id);
    const parsed = toothStateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "État dentaire invalide.");
    await ensureTable();
    await ensurePatientExists(session.tenantId, patientId);
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

export const PATCH = withAuth<Params>(
  async (request, session, { id }) => {
    const patientId = parsePatientId(id);
    const parsed = z.object({ dentitionType: z.enum(["adult", "child"]) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Type de dentition invalide.");
    await ensureSettingsTable();
    await ensurePatientExists(session.tenantId, patientId);
    await getPool().query(
      `INSERT INTO patient_odontogram_settings (tenant_id, patient_id, dentition_type, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE dentition_type = VALUES(dentition_type), updated_by = VALUES(updated_by)`,
      [session.tenantId, patientId, parsed.data.dentitionType, session.userId],
    );
    return NextResponse.json({ dentitionType: parsed.data.dentitionType });
  },
  { roles: WRITE_ROLES },
);
