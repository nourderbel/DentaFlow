import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { audit } from "@/server/audit";
import { nextDocumentNumber } from "@/server/numbering";
import { patientInputSchema } from "@/server/modules/patients/patients.schema";
import * as repo from "@/server/modules/patients/patients.repository";

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const importPatientSchema = patientInputSchema.extend({
  dateOfBirth: z.string().refine((value) => value === "" || isValidIsoDate(value), "Date de naissance invalide.").nullish().transform((value) => value || null),
  balance: z.number().finite().min(0).max(999_999_999.999).default(0),
  lastVisit: z.string().refine((value) => value === "" || isValidIsoDate(value), "Date de dernière visite invalide.").nullish().transform((value) => value || null),
});

const importRequestSchema = z.object({
  rows: z.array(z.object({
    lineNumber: z.number().int().positive(),
    patient: z.unknown(),
  })).min(1).max(500),
});

type ImportRow = {
  lineNumber: number;
  patient: unknown;
};

export const POST = withAuth(
  async (request, session) => {
    const raw = await request.json().catch(() => null);
    const requestParsed = importRequestSchema.safeParse(raw);
    if (!requestParsed.success) throw new HttpError(400, requestParsed.error.issues[0]?.message ?? "Fichier d’import invalide.");

    const rejected: string[] = [];
    const validRows: Array<{ lineNumber: number; patient: z.infer<typeof importPatientSchema> }> = [];
    for (const row of requestParsed.data.rows as ImportRow[]) {
      const parsed = importPatientSchema.safeParse(row.patient);
      if (!parsed.success) {
        rejected.push(`Ligne ${row.lineNumber} : ${parsed.error.issues[0]?.message ?? "Données invalides."}`);
      } else {
        validRows.push({ lineNumber: row.lineNumber, patient: parsed.data });
      }
    }

    const imported = await withTransaction(async (connection) => {
      const created: Array<{ lineNumber: number; patientNumber: string }> = [];
      for (const row of validRows) {
        const { balance, lastVisit, ...patient } = row.patient;
        if (patient.nationalId && await repo.nationalIdTaken(connection, session.tenantId, patient.nationalId)) {
          rejected.push(`Ligne ${row.lineNumber} : un patient avec cette CIN existe déjà.`);
          continue;
        }

        const number = await nextDocumentNumber(connection, session.tenantId, "patient", "PAT");
        const patientId = await repo.insertPatient(connection, session.tenantId, session.userId, number, patient);
        await connection.query(
          "UPDATE patients SET balance_tnd = ?, last_visit = ? WHERE id = ? AND tenant_id = ?",
          [balance, lastVisit, patientId, session.tenantId],
        );
        await audit(connection, session.tenantId, session.userId, "CREATE", "patient", patientId, {
          patient_number: number,
          source: "CSV import",
        });
        created.push({ lineNumber: row.lineNumber, patientNumber: number });
      }
      return created;
    });

    return NextResponse.json({ data: { imported: imported.length, rejected, patients: imported } }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);
