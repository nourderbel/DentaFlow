import { NextResponse } from "next/server";
import { HttpError, withAuth } from "@/server/http";
import { getPool } from "@/server/db";
import { readMedicalDocument } from "@/server/modules/patients/medical-documents";
import { ensureConsultationRecordingsTable } from "@/server/modules/consultations/recordings";

type Params = { id: string; recordingId: string };

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identifiant d’enregistrement invalide.");
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id: rawConsultationId, recordingId: rawRecordingId }) => {
  const consultationId = parseId(rawConsultationId);
  const recordingId = parseId(rawRecordingId);
  await ensureConsultationRecordingsTable();
  const rows = await getPool().query(
    `SELECT r.storage_key AS storageKey, r.mime_type AS mimeType, r.size_bytes AS sizeBytes
       FROM consultation_recordings r
       INNER JOIN patient_consultations c ON c.id = r.consultation_id AND c.tenant_id = r.tenant_id
      WHERE r.id = ? AND r.consultation_id = ? AND r.tenant_id = ?
      LIMIT 1`,
    [recordingId, consultationId, session.tenantId],
  );
  const recording = rows[0] as { storageKey: string; mimeType: string; sizeBytes: number } | undefined;
  if (!recording) throw new HttpError(404, "Enregistrement introuvable.");

  const contents = await readMedicalDocument(recording.storageKey);
  return new NextResponse(new Uint8Array(contents), {
    headers: {
      "Content-Type": recording.mimeType,
      "Content-Length": String(recording.sizeBytes),
      "Content-Disposition": 'inline; filename="consultation-audio"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
