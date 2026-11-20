import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { audit } from "@/server/audit";
import { decimalToMilli, ensureTreatmentFinanceTables } from "@/server/modules/patients/treatment-finances";

type Params = { id: string };
const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/, "Montant invalide (9 chiffres et 3 décimales maximum).");
const paymentDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Date de paiement invalide.");
const paymentSchema = z.object({
  treatmentId: z.number().int().positive(),
  amount: amountSchema.refine((value) => decimalToMilli(value) > 0, "Le paiement doit être supérieur à zéro."),
  paymentDate: paymentDateSchema,
  method: z.string().trim().min(1).max(40),
  note: z.string().trim().max(255).default(""),
});

function patientId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant patient invalide.");
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id }) => {
  await ensureTreatmentFinanceTables();
  const rows = await getPool().query(
    `SELECT t.id AS treatmentId, t.treatment, t.phase, t.teeth,
            t.planned_date AS treatmentDate,
            COALESCE(f.total_agreed, t.amount, 0) AS totalAgreed,
            COALESCE(payments.totalPaid, 0) AS totalPaid,
            GREATEST(COALESCE(f.total_agreed, t.amount, 0) - COALESCE(payments.totalPaid, 0), 0) AS remaining,
            CASE
              WHEN COALESCE(payments.totalPaid, 0) = 0 THEN 'IMPAYE'
              WHEN COALESCE(payments.totalPaid, 0) >= COALESCE(f.total_agreed, t.amount, 0) THEN 'PAYE'
              ELSE 'PARTIELLEMENT_PAYE'
            END AS financialStatus
       FROM patient_treatments t
       LEFT JOIN treatment_finances f ON f.tenant_id = t.tenant_id
         AND f.patient_id = t.patient_id AND f.treatment_id = t.id
       LEFT JOIN (
         SELECT tenant_id, patient_id, treatment_id, SUM(amount) AS totalPaid
           FROM treatment_payments
          WHERE tenant_id = ? AND patient_id = ?
          GROUP BY tenant_id, patient_id, treatment_id
       ) payments ON payments.tenant_id = t.tenant_id
         AND payments.patient_id = t.patient_id AND payments.treatment_id = t.id
      WHERE t.tenant_id = ? AND t.patient_id = ?
      ORDER BY t.planned_date, t.id`,
    [session.tenantId, patientId(id), session.tenantId, patientId(id)],
  );
  return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth<Params>(
  async (request, session, { id }) => {
    const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Paiement invalide.");
    await ensureTreatmentFinanceTables();
    const pId = patientId(id);
    const data = await withTransaction(async (connection) => {
      const treatments = await connection.query(
        `SELECT id, amount FROM patient_treatments
          WHERE id = ? AND tenant_id = ? AND patient_id = ? LIMIT 1 FOR UPDATE`,
        [parsed.data.treatmentId, session.tenantId, pId],
      );
      const treatment = treatments[0];
      if (!treatment) throw new HttpError(404, "Traitement introuvable.");

      await connection.query(
        `INSERT INTO treatment_finances (tenant_id, patient_id, treatment_id, total_agreed, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE treatment_id = VALUES(treatment_id)`,
        [session.tenantId, pId, parsed.data.treatmentId, treatment.amount ?? 0, session.userId],
      );
      const finances = await connection.query(
        `SELECT id, total_agreed FROM treatment_finances
          WHERE tenant_id = ? AND patient_id = ? AND treatment_id = ? LIMIT 1 FOR UPDATE`,
        [session.tenantId, pId, parsed.data.treatmentId],
      );
      const finance = finances[0];
      const payments = await connection.query(
        `SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM treatment_payments
          WHERE tenant_id = ? AND patient_id = ? AND treatment_id = ?`,
        [session.tenantId, pId, parsed.data.treatmentId],
      );
      const remainingMilli = decimalToMilli(finance.total_agreed) - decimalToMilli(payments[0].totalPaid);
      const amountMilli = decimalToMilli(parsed.data.amount);
      if (amountMilli > remainingMilli) {
        throw new HttpError(400, "Le paiement dépasse le solde restant de ce traitement.");
      }

      const result = await connection.query(
        `INSERT INTO treatment_payments
          (tenant_id, patient_id, treatment_id, finance_id, amount, payment_date, method, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.tenantId, pId, parsed.data.treatmentId, finance.id, parsed.data.amount, parsed.data.paymentDate, parsed.data.method, parsed.data.note || null, session.userId],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "treatment_payment", result.insertId, {
        treatment_id: parsed.data.treatmentId,
        amount: parsed.data.amount,
      });
      return { id: result.insertId };
    });
    return NextResponse.json({ data }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);
