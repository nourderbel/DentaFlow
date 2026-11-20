import { NextResponse } from "next/server";
import { withAuth, HttpError } from "@/server/http";
import { getPool } from "@/server/db";
import { readMedicalDocument } from "@/server/modules/patients/medical-documents";

type Params = { id: string; documentId: string };

function parsePositiveId(value: string, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${label} invalide.`);
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id, documentId }) => {
  const patientId = parsePositiveId(id, "Identifiant patient");
  const fileId = parsePositiveId(documentId, "Identifiant document");
  const rows = await getPool().query(
    `SELECT d.filename AS fileName, d.mime_type AS mimeType, d.storage_key AS storageKey
       FROM patient_documents d
       JOIN patients p ON p.id = d.patient_id AND p.tenant_id = d.tenant_id
      WHERE d.id = ? AND d.patient_id = ? AND d.tenant_id = ?
        AND d.deleted_at IS NULL AND p.deleted_at IS NULL
      LIMIT 1`,
    [fileId, patientId, session.tenantId],
  );
  const document = rows[0] as { fileName: string; mimeType: string; storageKey: string } | undefined;
  if (!document) throw new HttpError(404, "Document introuvable.");

  const fileData = await readMedicalDocument(document.storageKey);
  const safeName = document.fileName.replace(/[\r\n"]/g, "_");
  const encodedName = encodeURIComponent(safeName);
  const disposition = document.mimeType === "application/dicom" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(fileData), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `${disposition}; filename="document"; filename*=UTF-8''${encodedName}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
