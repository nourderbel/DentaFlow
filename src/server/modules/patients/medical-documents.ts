import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function getStorageDirectory() {
  return process.env.PATIENT_DOCUMENTS_STORAGE_DIR
    ? path.resolve(process.env.PATIENT_DOCUMENTS_STORAGE_DIR)
    : path.join(process.cwd(), "storage", "patient-documents");
}

function getStoragePath(storageKey: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storageKey)) {
    throw new Error("Clé de stockage de document invalide.");
  }
  return path.join(getStorageDirectory(), storageKey);
}

export async function writeMedicalDocument(contents: Uint8Array) {
  const storageKey = randomUUID();
  const filePath = getStoragePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { flag: "wx", mode: 0o600 });
  return storageKey;
}

export async function readMedicalDocument(storageKey: string) {
  return readFile(getStoragePath(storageKey));
}

export async function removeMedicalDocument(storageKey: string) {
  await unlink(getStoragePath(storageKey));
}
