import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, HttpError, withTransaction } from "@/server/http";
import { getPool } from "@/server/db";
import { audit } from "@/server/audit";
import { decimalToMilli, ensureTreatmentFinanceTables } from "@/server/modules/patients/treatment-finances";

type Params = { id: string; treatmentId: string };
const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/, "Montant invalide (9 chiffres et 3 décimales maximum).");
const priceSchema = z.object({
  totalAgreed: amountSchema,
  reason: z.string().trim().min(1, "La raison de la modification est obligatoire.").max(255),
});

function positiveId(value: string, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${label} invalide.`);
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id, treatmentId }) => {
  await ensureTreatmentFinanceTables();
  const patientId = positiveId(id, "Patient");
  const treatmentIdValue = positiveId(treatmentId, "Traitement");
  const treatment = await getPool().query(
    `SELECT id FROM patient_treatments
      WHERE id = ? AND tenant_id = ? AND patient_id = ? LIMIT 1`,
    [treatmentIdValue, session.tenantId, patientId],
  );
  if (!treatment[0]) throw new HttpError(404, "Traitement introuvable.");
  const [payments, priceHistory] = await Promise.all([
    getPool().query(
      `SELECT p.id, p.amount, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS paymentDate,
              p.method, p.note, p.created_by AS createdBy, u.full_name AS createdByName
         FROM treatment_payments p
         LEFT JOIN users u ON u.id = p.created_by AND u.tenant_id = p.tenant_id
        WHERE p.tenant_id = ? AND p.patient_id = ? AND p.treatment_id = ?
        ORDER BY p.payment_date DESC, p.id DESC`,
      [session.tenantId, patientId, treatmentIdValue],
    ),
    getPool().query(
      `SELECT h.id, h.old_amount AS oldAmount, h.new_amount AS newAmount, h.reason,
              h.changed_by AS changedBy, u.full_name AS changedByName,
              DATE_FORMAT(h.changed_at, '%Y-%m-%d %H:%i') AS changedAt
         FROM treatment_price_history h
         LEFT JOIN users u ON u.id = h.changed_by AND u.tenant_id = h.tenant_id
        WHERE h.tenant_id = ? AND h.patient_id = ? AND h.treatment_id = ?
        ORDER BY h.id DESC`,
      [session.tenantId, patientId, treatmentIdValue],
    ),
  ]);
  return NextResponse.json(
    { data: { payments, priceHistory } },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const PATCH = withAuth<Params>(
  async (request, session, { id, treatmentId }) => {
    const parsed = priceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Prix invalide.");
    await ensureTreatmentFinanceTables();
    const patientId = positiveId(id, "Patient");
    const treatmentIdValue = positiveId(treatmentId, "Traitement");
    const data = await withTransaction(async (connection) => {
      const treatments = await connection.query(
        `SELECT id, amount FROM patient_treatments
          WHERE id = ? AND tenant_id = ? AND patient_id = ? LIMIT 1 FOR UPDATE`,
        [treatmentIdValue, session.tenantId, patientId],
      );
      const treatment = treatments[0];
      if (!treatment) throw new HttpError(404, "Traitement introuvable.");
      const finances = await connection.query(
        `SELECT id, total_agreed FROM treatment_finances
          WHERE tenant_id = ? AND patient_id = ? AND treatment_id = ? LIMIT 1 FOR UPDATE`,
        [session.tenantId, patientId, treatmentIdValue],
      );
      const previousAmount = finances[0]?.total_agreed ?? treatment.amount ?? 0;
      let financeId = finances[0]?.id;
      if (!financeId) {
        const inserted = await connection.query(
          `INSERT INTO treatment_finances (tenant_id, patient_id, treatment_id, total_agreed, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [session.tenantId, patientId, treatmentIdValue, previousAmount, session.userId],
        );
        financeId = inserted.insertId;
        await audit(connection, session.tenantId, session.userId, "CREATE", "treatment_finance", financeId, {
          treatment_id: treatmentIdValue,
          total_agreed: previousAmount,
        });
      }
      const payments = await connection.query(
        `SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM treatment_payments
          WHERE tenant_id = ? AND patient_id = ? AND treatment_id = ?`,
        [session.tenantId, patientId, treatmentIdValue],
      );
      if (decimalToMilli(payments[0].totalPaid) > decimalToMilli(parsed.data.totalAgreed)) {
        throw new HttpError(400, "Le nouveau prix ne peut pas être inférieur au montant déjà payé.");
      }
      const changed = decimalToMilli(previousAmount) !== decimalToMilli(parsed.data.totalAgreed);
      if (changed) {
        await connection.query(
          `UPDATE treatment_finances SET total_agreed = ?
            WHERE id = ? AND tenant_id = ? AND patient_id = ? AND treatment_id = ?`,
          [parsed.data.totalAgreed, financeId, session.tenantId, patientId, treatmentIdValue],
        );
        await connection.query(
          `INSERT INTO treatment_price_history
            (tenant_id, patient_id, treatment_id, old_amount, new_amount, reason, changed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [session.tenantId, patientId, treatmentIdValue, previousAmount, parsed.data.totalAgreed, parsed.data.reason, session.userId],
        );
        await connection.query(
          "UPDATE patient_treatments SET amount = ? WHERE id = ? AND tenant_id = ? AND patient_id = ?",
          [parsed.data.totalAgreed, treatmentIdValue, session.tenantId, patientId],
        );
        await audit(connection, session.tenantId, session.userId, "UPDATE", "treatment_finance", treatmentIdValue, {
          finance_id: financeId,
          previous_total: previousAmount,
          total_agreed: parsed.data.totalAgreed,
          reason: parsed.data.reason,
        });
      }
      return { totalAgreed: parsed.data.totalAgreed, changed };
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  },
  { roles: ["DENTIST"] },
);
