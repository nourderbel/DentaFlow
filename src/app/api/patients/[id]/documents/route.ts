import { NextResponse } from "next/server";
import { withAuth, HttpError, WRITE_ROLES, withTransaction } from "@/server/http";
import { getPool } from "@/server/db";
import { audit } from "@/server/audit";
import { removeMedicalDocument, writeMedicalDocument } from "@/server/modules/patients/medical-documents";

type Params = { id: string };
type DocumentCategory = "Analyse" | "Scanner / imagerie" | "Autre";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const categories = new Set<DocumentCategory>(["Analyse", "Scanner / imagerie", "Autre"]);
const allowedExtensions = new Set(["pdf", "png", "jpg", "jpeg", "webp", "dcm"]);

function parsePatientId(value: string) {
  const id = Number(value);
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

function hasValidSignature(extension: string, bytes: Uint8Array) {
  if (extension === "pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
  if (extension === "png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (extension === "jpg" || extension === "jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "webp") return bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (extension === "dcm") return bytes.length >= 132 && String.fromCharCode(...bytes.subarray(128, 132)) === "DICM";
  return false;
}

function mimeTypeFor(extension: string) {
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    dcm: "application/dicom",
  };
  return mimeTypes[extension];
}

export const GET = withAuth<Params>(async (_request, session, { id }) => {
  const patientId = parsePatientId(id);
  await ensurePatientExists(session.tenantId, patientId);
  const rows = await getPool().query(
    `SELECT id, document_type AS category, filename AS fileName, mime_type AS mimeType,
            size_bytes AS fileSize, created_at AS uploadedAt
       FROM patient_documents
      WHERE tenant_id = ? AND patient_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC`,
    [session.tenantId, patientId],
  );
  return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth<Params>(
  async (request, session, { id }) => {
    const patientId = parsePatientId(id);
    await ensurePatientExists(session.tenantId, patientId);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new HttpError(400, "Formulaire de dépôt de document invalide.");
    }
    const file = formData.get("file");
    const categoryValue = formData.get("category");
    if (!(file instanceof File)) throw new HttpError(400, "Sélectionnez un fichier à ajouter.");
    if (typeof categoryValue !== "string" || !categories.has(categoryValue as DocumentCategory)) {
      throw new HttpError(400, "Catégorie de document invalide.");
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      throw new HttpError(400, "Le fichier doit peser entre 1 octet et 15 Mo.");
    }

    const extension = file.name.split(".").pop()?.toLocaleLowerCase() ?? "";
    if (!allowedExtensions.has(extension)) {
      throw new HttpError(400, "Formats acceptés : PDF, PNG, JPG, WEBP et DICOM (.dcm).");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidSignature(extension, bytes)) {
      throw new HttpError(400, "Le contenu du fichier ne correspond pas à son format déclaré.");
    }

    const fileName = file.name.replace(/[\\/\r\n\0]/g, "_").slice(0, 255);
    const mimeType = mimeTypeFor(extension);
    const storageKey = await writeMedicalDocument(bytes);
    try {
      const inserted = await withTransaction(async (connection) => {
        const result = await connection.query(
          `INSERT INTO patient_documents
            (tenant_id, patient_id, document_type, filename, storage_key, mime_type, size_bytes, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [session.tenantId, patientId, categoryValue, fileName, storageKey, mimeType, bytes.length, session.userId],
        );
        await audit(connection, session.tenantId, session.userId, "CREATE", "patient_document", result.insertId, {
          patient_id: patientId,
          category: categoryValue,
          file_name: fileName,
          file_size: bytes.length,
        });
        return result.insertId;
      });

      return NextResponse.json({
        data: { id: inserted, category: categoryValue, fileName, mimeType, fileSize: bytes.length, uploadedAt: new Date().toISOString() },
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      await removeMedicalDocument(storageKey);
      throw error;
    }
  },
  { roles: WRITE_ROLES },
);
