import { NextResponse } from "next/server";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { audit } from "@/server/audit";
import { readMedicalDocument, removeMedicalDocument } from "@/server/modules/patients/medical-documents";
import { ensurePatientRecordingsTable } from "@/server/modules/patients/recordings";

type Params = { id: string; recordingId: string };

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identifiant d'enregistrement invalide.");
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id: rawPatientId, recordingId: rawRecordingId }) => {
  const patientId = parseId(rawPatientId);
  const recordingId = parseId(rawRecordingId);
  await ensurePatientRecordingsTable();
  const rows = await getPool().query(
    `SELECT r.storage_key AS storageKey, r.mime_type AS mimeType, r.size_bytes AS sizeBytes
       FROM patient_recordings r
       INNER JOIN patients p ON p.id = r.patient_id AND p.tenant_id = r.tenant_id
      WHERE r.id = ? AND r.patient_id = ? AND r.tenant_id = ?
      LIMIT 1`,
    [recordingId, patientId, session.tenantId],
  );
  const recording = rows[0] as { storageKey: string; mimeType: string; sizeBytes: number } | undefined;
  if (!recording) throw new HttpError(404, "Enregistrement introuvable.");

  const contents = await readMedicalDocument(recording.storageKey);
  return new NextResponse(new Uint8Array(contents), {
    headers: {
      "Content-Type": recording.mimeType,
      "Content-Length": String(recording.sizeBytes),
      "Content-Disposition": 'inline; filename="patient-audio"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const DELETE = withAuth<Params>(
  async (_request, session, { id: rawPatientId, recordingId: rawRecordingId }) => {
    const patientId = parseId(rawPatientId);
    const recordingId = parseId(rawRecordingId);
    await ensurePatientRecordingsTable();
    const rows = await getPool().query(
      `SELECT storage_key AS storageKey
         FROM patient_recordings
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
        LIMIT 1`,
      [recordingId, patientId, session.tenantId],
    );
    const recording = rows[0] as { storageKey: string } | undefined;
    if (!recording) throw new HttpError(404, "Enregistrement introuvable.");

    await withTransaction(async (connection) => {
      await connection.query(
        "DELETE FROM patient_recordings WHERE id = ? AND tenant_id = ?",
        [recordingId, session.tenantId],
      );
      await audit(connection, session.tenantId, session.userId, "DELETE", "patient_recording", recordingId, {
        patient_id: patientId,
      });
    });

    await removeMedicalDocument(recording.storageKey).catch(() => {});
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  },
  { roles: WRITE_ROLES },
);

