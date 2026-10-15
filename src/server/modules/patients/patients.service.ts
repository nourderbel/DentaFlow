import { HttpError, withTransaction } from "@/server/http";
import { nextDocumentNumber } from "@/server/numbering";
import { audit } from "@/server/audit";
import type { SessionClaims } from "@/server/auth/session";
import type { PatientInput } from "./patients.schema";
import * as repo from "./patients.repository";

export function listPatients(session: SessionClaims, search: string) {
  return repo.listPatients(session.tenantId, search.trim());
}

export async function getPatient(session: SessionClaims, id: number) {
  const patient = await repo.findPatient(session.tenantId, id);
  if (!patient) throw new HttpError(404, "Patient introuvable.");
  return patient;
}

export function createPatient(session: SessionClaims, input: PatientInput) {
  return withTransaction(async (connection) => {
    if (input.nationalId && (await repo.nationalIdTaken(connection, session.tenantId, input.nationalId))) {
      throw new HttpError(409, "Un patient avec cette CIN existe déjà.");
    }
    const number = await nextDocumentNumber(connection, session.tenantId, "patient", "PAT");
    const id = await repo.insertPatient(connection, session.tenantId, session.userId, number, input);
    await audit(connection, session.tenantId, session.userId, "CREATE", "patient", id, { patient_number: number });
    return { id, patientNumber: number };
  });
}

export function updatePatient(session: SessionClaims, id: number, input: PatientInput) {
  return withTransaction(async (connection) => {
    if (input.nationalId && (await repo.nationalIdTaken(connection, session.tenantId, input.nationalId, id))) {
      throw new HttpError(409, "Un autre patient a déjà cette CIN.");
    }
    if (!(await repo.updatePatient(connection, session.tenantId, id, input))) throw new HttpError(404, "Patient introuvable.");
    await audit(connection, session.tenantId, session.userId, "UPDATE", "patient", id);
  });
}

export function archivePatient(session: SessionClaims, id: number) {
  return withTransaction(async (connection) => {
    if (!(await repo.softDeletePatient(connection, session.tenantId, id))) throw new HttpError(404, "Patient introuvable.");
    await audit(connection, session.tenantId, session.userId, "SOFT_DELETE", "patient", id);
  });
}