import { NextResponse } from "next/server";
import { HttpError, withAuth, withTransaction } from "@/server/http";
import { getPool } from "@/server/db";
import { audit } from "@/server/audit";
import { removeMedicalDocument, writeMedicalDocument } from "@/server/modules/patients/medical-documents";
import { ensurePatientRecordingsTable } from "@/server/modules/patients/recordings";
import { ensureConsultationRecordingsTable } from "@/server/modules/consultations/recordings";
import { nextDocumentNumber } from "@/server/numbering";

type Params = { id: string };
const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
const MAX_DURATION_MS = 30 * 60 * 1000;

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identifiant de patient invalide.");
  return id;
}

async function ensurePatientExists(tenantId: number, patientId: number) {
  const rows = await getPool().query(
    "SELECT id FROM patients WHERE id = ? AND tenant_id = ? LIMIT 1",
    [patientId, tenantId],
  );
  if (!rows.length) throw new HttpError(404, "Patient introuvable.");
}

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

export const GET = withAuth<Params>(async (_request, session, { id: rawId }) => {
  const patientId = parseId(rawId);
  await ensurePatientRecordingsTable();
  await ensurePatientExists(session.tenantId, patientId);
  const data = await getPool().query(
    `SELECT id, mime_type AS mimeType, size_bytes AS sizeBytes, duration_ms AS durationMs,
            label, created_at AS createdAt
       FROM patient_recordings
      WHERE tenant_id = ? AND patient_id = ?
      ORDER BY created_at DESC, id DESC`,
    [session.tenantId, patientId],
  );
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withAuth<Params>(async (request, session, { id: rawId }) => {
  const patientId = parseId(rawId);
  await ensurePatientRecordingsTable();
  await ensureConsultationsTable();
  await ensureConsultationRecordingsTable();
  await ensurePatientExists(session.tenantId, patientId);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new HttpError(400, "Fichier audio invalide.");
  }
  const file = formData.get("file");
  const durationValue = formData.get("durationMs");
  const label = formData.get("label");
  if (!(file instanceof File)) throw new HttpError(400, "Sélectionnez un enregistrement audio.");
  if (formData.get("consent") !== "true") throw new HttpError(400, "Confirmez le consentement du patient avant l'enregistrement.");
  if (file.size === 0 || file.size > MAX_AUDIO_SIZE) throw new HttpError(400, "L'enregistrement doit peser au maximum 50 Mo.");
  if (!["audio/webm", "audio/mp4"].includes(file.type)) throw new HttpError(400, "Format audio non pris en charge. Utilisez WebM ou MP4.");
  const durationMs = Number(durationValue);
  if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > MAX_DURATION_MS) {
    throw new HttpError(400, "La durée de l'enregistrement doit être comprise entre 1 seconde et 30 minutes.");
  }
  const labelStr = typeof label === "string" ? label.trim().slice(0, 120) || null : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isWebm = file.type === "audio/webm" && bytes.length >= 4
    && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const isMp4 = file.type === "audio/mp4" && bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";
  if (!isWebm && !isMp4) throw new HttpError(400, "Le contenu du fichier ne correspond pas à un audio WebM ou MP4 valide.");

  const storageKey = await writeMedicalDocument(bytes);
  try {
    const recording = await withTransaction(async (connection) => {
      const result = await connection.query(
        `INSERT INTO patient_recordings
          (tenant_id, patient_id, storage_key, mime_type, size_bytes, duration_ms, label, consent_at, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), ?)`,
        [session.tenantId, patientId, storageKey, file.type, bytes.length, durationMs, labelStr, session.userId],
      );

      const todayRows = await connection.query(
        `SELECT id FROM patient_consultations
          WHERE tenant_id = ? AND patient_id = ? AND consultation_date = CURRENT_DATE()
          ORDER BY id DESC LIMIT 1`,
        [session.tenantId, patientId],
      );
      let consultationId = todayRows[0]?.id ? Number(todayRows[0].id) : null;
      if (!consultationId) {
        const consultationNumber = await nextDocumentNumber(connection, session.tenantId, "consultation", "CONS", 5);
        const consultation = await connection.query(
          `INSERT INTO patient_consultations
            (tenant_id, patient_id, consultation_number, consultation_date, reason, diagnosis,
             anamnesis, treatment, recommendations, next_appointment_date, created_by)
           VALUES (?, ?, ?, CURRENT_DATE(), ?, NULL, NULL, NULL, NULL, NULL, ?)`,
          [session.tenantId, patientId, consultationNumber, labelStr || "Enregistrement vocal du dossier patient", session.userId],
        );
        consultationId = Number(consultation.insertId);
      }
      const consultationRecording = await connection.query(
        `INSERT INTO consultation_recordings
          (tenant_id, consultation_id, storage_key, mime_type, size_bytes, duration_ms, consent_at, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), ?)`,
        [session.tenantId, consultationId, storageKey, file.type, bytes.length, durationMs, session.userId],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "consultation_recording", consultationRecording.insertId, {
        consultation_id: consultationId,
        patient_id: patientId,
        duration_ms: durationMs,
        consent_recorded: true,
        source: "patient_recording",
      });

      await audit(connection, session.tenantId, session.userId, "CREATE", "patient_recording", result.insertId, {
        patient_id: patientId,
        consultation_id: consultationId,
        duration_ms: durationMs,
        size_bytes: bytes.length,
        label: labelStr,
        consent_recorded: true,
      });
      const rows = await connection.query(
        `SELECT id, mime_type AS mimeType, size_bytes AS sizeBytes, duration_ms AS durationMs,
                label, created_at AS createdAt
           FROM patient_recordings WHERE id = ? AND tenant_id = ?`,
        [result.insertId, session.tenantId],
      );
      return rows[0];
    });
    return NextResponse.json({ data: recording }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await removeMedicalDocument(storageKey);
    throw error;
  }
});
