import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { decimalToMilli } from "@/server/modules/patients/treatment-finances";
import { ensureTreasuryTables } from "@/server/modules/treasury/treasury";

type Params = { id: string };
const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/, "Montant invalide (10 chiffres et 3 décimales maximum).")
  .refine((value) => decimalToMilli(value) > 0, "Le paiement doit être supérieur à zéro.");

export const PATCH = withAuth<Params>(
  async (request, session, { id }) => {
    const invoiceId = Number(id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new HttpError(400, "Identifiant de facture invalide.");
    const parsed = z.object({
      amount: amountSchema,
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      }, "Date de paiement invalide.").optional(),
      method: z.string().trim().min(1).max(40).optional(),
    }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Paiement invalide.");
    await ensureTreasuryTables();

    const invoice = await withTransaction(async (connection) => {
      const rows = await connection.query(
        "SELECT total_tnd AS total, paid_tnd AS paid FROM invoices WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [invoiceId, session.tenantId],
      );
      const current = rows[0] as { total: string | number; paid: string | number } | undefined;
      if (!current) throw new HttpError(404, "Facture introuvable.");
      const totalMilli = decimalToMilli(current.total);
      const paidMilli = decimalToMilli(current.paid);
      const amountMilli = decimalToMilli(parsed.data.amount);
      if (amountMilli > totalMilli - paidMilli) throw new HttpError(400, "Le paiement dépasse le reste à payer.");

      const nextPaid = paidMilli + amountMilli;
      const status = nextPaid >= totalMilli ? "PAID" : "PARTIAL";
      await connection.query("UPDATE invoices SET paid_tnd = ?, status = ? WHERE id = ? AND tenant_id = ?", [nextPaid / 1000, status, invoiceId, session.tenantId]);
      const paymentDate = parsed.data.paymentDate ?? new Date().toISOString().slice(0, 10);
      const method = parsed.data.method ?? "Non précisé";
      await connection.query(
        `INSERT INTO invoice_payments (tenant_id, invoice_id, amount, payment_date, method, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [session.tenantId, invoiceId, parsed.data.amount, paymentDate, method, session.userId],
      );
      await audit(connection, session.tenantId, session.userId, "UPDATE", "invoice_payment", invoiceId, {
        amount: parsed.data.amount,
        payment_date: paymentDate,
        method,
        paid_total: nextPaid / 1000,
      });
      return { paid: nextPaid / 1000, status: status === "PAID" ? "Payée" : "Partiellement payée", paymentDate, method };
    });

    return NextResponse.json({ data: { id: invoiceId, ...invoice } }, { headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
