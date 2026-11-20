import { NextResponse } from "next/server";
import { HttpError, withAuth, withTransaction } from "@/server/http";
import { getPool } from "@/server/db";
import { audit } from "@/server/audit";
import { removeMedicalDocument, writeMedicalDocument } from "@/server/modules/patients/medical-documents";
import { ensureConsultationRecordingsTable } from "@/server/modules/consultations/recordings";

type Params = { id: string };
const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
const MAX_DURATION_MS = 30 * 60 * 1000;

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identifiant de consultation invalide.");
  return id;
}

async function ensureConsultationExists(tenantId: number, consultationId: number) {
  const rows = await getPool().query(
    "SELECT id FROM patient_consultations WHERE id = ? AND tenant_id = ? LIMIT 1",
    [consultationId, tenantId],
  );
  if (!rows.length) throw new HttpError(404, "Consultation introuvable.");
}

export const GET = withAuth<Params>(async (_request, session, { id: rawId }) => {
  const consultationId = parseId(rawId);
  await ensureConsultationRecordingsTable();
  await ensureConsultationExists(session.tenantId, consultationId);
  const data = await getPool().query(
    `SELECT id, mime_type AS mimeType, size_bytes AS sizeBytes, duration_ms AS durationMs,
            created_at AS createdAt
       FROM consultation_recordings
      WHERE tenant_id = ? AND consultation_id = ?
      ORDER BY created_at DESC, id DESC`,
    [session.tenantId, consultationId],
  );
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withAuth<Params>(async (request, session, { id: rawId }) => {
  const consultationId = parseId(rawId);
  await ensureConsultationRecordingsTable();
  await ensureConsultationExists(session.tenantId, consultationId);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new HttpError(400, "Fichier audio invalide.");
  }
  const file = formData.get("file");
  const durationValue = formData.get("durationMs");
  if (!(file instanceof File)) throw new HttpError(400, "Sélectionnez un enregistrement audio.");
  if (formData.get("consent") !== "true") throw new HttpError(400, "Confirmez le consentement du patient avant l’enregistrement.");
  if (file.size === 0 || file.size > MAX_AUDIO_SIZE) throw new HttpError(400, "L’enregistrement doit peser au maximum 50 Mo.");
  if (!["audio/webm", "audio/mp4"].includes(file.type)) throw new HttpError(400, "Format audio non pris en charge. Utilisez WebM ou MP4.");
  const durationMs = Number(durationValue);
  if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > MAX_DURATION_MS) {
    throw new HttpError(400, "La durée de l’enregistrement doit être comprise entre 1 seconde et 30 minutes.");
  }

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
        `INSERT INTO consultation_recordings
          (tenant_id, consultation_id, storage_key, mime_type, size_bytes, duration_ms, consent_at, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), ?)`,
        [session.tenantId, consultationId, storageKey, file.type, bytes.length, durationMs, session.userId],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "consultation_recording", result.insertId, {
        consultation_id: consultationId,
        duration_ms: durationMs,
        size_bytes: bytes.length,
        consent_recorded: true,
      });
      const rows = await connection.query(
        `SELECT id, mime_type AS mimeType, size_bytes AS sizeBytes, duration_ms AS durationMs,
                created_at AS createdAt
           FROM consultation_recordings WHERE id = ? AND tenant_id = ?`,
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
