import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { nextDocumentNumber } from "@/server/numbering";
import { getPool } from "@/server/db";
import { decimalToMilli } from "@/server/modules/patients/treatment-finances";

const invoiceSchema = z.object({
  patientId: z.number().int().positive(),
  description: z.string().trim().min(1).max(180),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/, "Montant invalide (10 chiffres et 3 décimales maximum)."),
});

const statusLabels: Record<string, "Impayée" | "Partiellement payée" | "Payée"> = {
  UNPAID: "Impayée",
  PARTIAL: "Partiellement payée",
  PAID: "Payée",
};

export const GET = withAuth(async (_request, session) => {
  const [rows, itemRows] = await Promise.all([getPool().query(
    `SELECT i.id, i.invoice_number AS number, DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS date,
            i.patient_id AS patientId, CONCAT(p.first_name, ' ', p.last_name) AS patient,
            p.patient_number AS patientNumber, p.address AS patientAddress, p.city AS patientCity,
            p.governorate AS patientGovernorate, p.phone AS patientPhone, p.national_id AS patientNationalId,
            i.subtotal_tnd AS subtotal, i.total_tnd AS total, i.discount_tnd AS discount,
            i.paid_tnd AS paid, i.status, i.quote_id AS quoteId
       FROM invoices i
       JOIN patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
      WHERE i.tenant_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY i.created_at DESC, i.id DESC`,
    [session.tenantId],
  ), getPool().query(
    `SELECT ii.invoice_id AS invoiceId, ii.description, ii.quantity,
            ii.unit_price_tnd AS unitPrice, ii.discount_tnd AS discount, ii.tooth_fdi AS tooth
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id AND i.tenant_id = ii.tenant_id
      WHERE ii.tenant_id = ? AND i.deleted_at IS NULL
      ORDER BY ii.invoice_id, ii.id`,
    [session.tenantId],
  )]);
  const itemsByInvoice = new Map<number, Array<{ description: string; quantity: number; unitPrice: number; discount: number; tooth: number | null }>>();
  for (const item of itemRows as Array<{ invoiceId: number; description: string; quantity: string | number; unitPrice: string | number; discount: string | number; tooth: number | null }>) {
    const items = itemsByInvoice.get(item.invoiceId) ?? [];
    items.push({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      tooth: item.tooth,
    });
    itemsByInvoice.set(item.invoiceId, items);
  }
  return NextResponse.json({
    data: rows.map((row: { id: number; number: string; date: string; patientId: number; patient: string; patientNumber: string; patientAddress: string | null; patientCity: string | null; patientGovernorate: string | null; patientPhone: string; patientNationalId: string | null; subtotal: string | number; total: string | number; discount: string | number; paid: string | number; status: string; quoteId: number | null }) => ({
      ...row,
      subtotal: Number(row.subtotal),
      total: Number(row.total),
      discount: Number(row.discount),
      paid: Number(row.paid),
      items: itemsByInvoice.get(row.id) ?? [],
      status: statusLabels[row.status] ?? "Impayée",
    })),
  }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = invoiceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Facture invalide.");
    const totalMilli = decimalToMilli(parsed.data.amount);
    if (totalMilli <= 0) throw new HttpError(400, "Le montant de la facture doit être supérieur à zéro.");

    const invoice = await withTransaction(async (connection) => {
      const patients = await connection.query(
        "SELECT id, CONCAT(first_name, ' ', last_name) AS name FROM patients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [parsed.data.patientId, session.tenantId],
      );
      const patient = patients[0] as { id: number; name: string } | undefined;
      if (!patient) throw new HttpError(404, "Patient introuvable.");

      const number = await nextDocumentNumber(connection, session.tenantId, "invoice", "FAC");
      const result = await connection.query(
        `INSERT INTO invoices
          (tenant_id, invoice_number, patient_id, invoice_date, subtotal_tnd, total_tnd, paid_tnd, status)
         VALUES (?, ?, ?, CURRENT_DATE(), ?, ?, 0, 'UNPAID')`,
        [session.tenantId, number, parsed.data.patientId, totalMilli / 1000, totalMilli / 1000],
      );
      await connection.query(
        `INSERT INTO invoice_items (tenant_id, invoice_id, description, quantity, unit_price_tnd)
         VALUES (?, ?, ?, 1, ?)`,
        [session.tenantId, result.insertId, parsed.data.description, parsed.data.amount],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "invoice", result.insertId, {
        invoice_number: number,
        patient_id: parsed.data.patientId,
        total: totalMilli / 1000,
      });
      const dates = await connection.query("SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS date");
      return { id: result.insertId, number, patient: patient.name, date: dates[0].date as string };
    });

    return NextResponse.json({
      data: {
        ...invoice,
        date: invoice.date,
        patientId: parsed.data.patientId,
        patient: invoice.patient,
        total: totalMilli / 1000,
        discount: 0,
        paid: 0,
        patientNumber: "",
        patientAddress: "",
        patientCity: "",
        patientGovernorate: "",
        patientPhone: "",
        patientNationalId: null,
        subtotal: totalMilli / 1000,
        quoteId: null,
        items: [{ description: parsed.data.description, quantity: 1, unitPrice: totalMilli / 1000, discount: 0, tooth: null }],
        status: "Impayée",
      },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
