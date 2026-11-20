import { HttpError, withTransaction } from "@/server/http";
import { nextDocumentNumber } from "@/server/numbering";
import { audit } from "@/server/audit";
import type { SessionClaims } from "@/server/auth/session";
import type { PatientInput } from "./patients.schema";
import * as repo from "./patients.repository";
import { ensureTreatmentFinanceTables } from "./treatment-finances";

export async function listPatients(session: SessionClaims, search: string, archived = false) {
  await ensureTreatmentFinanceTables();
  return repo.listPatients(session.tenantId, search.trim(), archived);
}

export async function listReceivables(session: SessionClaims) {
  await ensureTreatmentFinanceTables();
  const [rows, activePatientCount] = await Promise.all([
    repo.listReceivables(session.tenantId),
    repo.countActivePatients(session.tenantId),
  ]);
  const firstRow = rows[0] as { totalReceivable?: string | number; debtorCount?: number } | undefined;
  return {
    data: rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      patientNumber: row.patientNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      balance: row.balance,
    })),
    totalReceivable: firstRow?.totalReceivable ?? 0,
    debtorCount: firstRow?.debtorCount ?? 0,
    activePatientCount,
  };
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

export function restorePatient(session: SessionClaims, id: number) {
  return withTransaction(async (connection) => {
    if (!(await repo.restorePatient(connection, session.tenantId, id))) throw new HttpError(404, "Patient archivé introuvable.");
    await audit(connection, session.tenantId, session.userId, "RESTORE", "patient", id);
  });
}