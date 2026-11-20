import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { nextDocumentNumber } from "@/server/numbering";
import { getPool } from "@/server/db";
import { decimalToMilli } from "@/server/modules/patients/treatment-finances";

const quoteSchema = z.object({
  patientId: z.number().int().positive(),
  notes: z.string().trim().max(5000, "La note ne peut pas dépasser 5 000 caractères.").default(""),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(180),
    quantity: z.number().int().min(1).max(999),
    unitPrice: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/, "Prix invalide (10 chiffres et 3 décimales maximum)."),
    tooth: z.number().int().refine((tooth) => [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48].includes(tooth), "Numéro de dent invalide.").nullable(),
  })).min(1, "Ajoutez au moins un acte au devis.").max(30, "Un devis ne peut pas dépasser 30 lignes d’actes."),
});

type QuoteStatus = "Brouillon" | "Envoyé" | "Accepté" | "Refusé";
const statusLabels: Record<string, QuoteStatus> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
};
export const GET = withAuth(async (_request, session) => {
  const [rows, itemRows] = await Promise.all([
    getPool().query(
      `SELECT q.id, q.quote_number AS number, DATE_FORMAT(q.quote_date, '%Y-%m-%d') AS date,
              q.patient_id AS patientId, CONCAT(p.first_name, ' ', p.last_name) AS patient,
              q.total_tnd AS amount, q.status, q.notes,
              (SELECT i.invoice_number FROM invoices i
                WHERE i.quote_id = q.id AND i.tenant_id = q.tenant_id AND i.deleted_at IS NULL
                ORDER BY i.id DESC LIMIT 1) AS invoiceNumber
       FROM quotes q
       JOIN patients p ON p.id = q.patient_id AND p.tenant_id = q.tenant_id
      WHERE q.tenant_id = ? AND q.deleted_at IS NULL AND p.deleted_at IS NULL
      ORDER BY q.created_at DESC, q.id DESC`,
      [session.tenantId],
    ),
    getPool().query(
      `SELECT qi.quote_id AS quoteId, qi.description, qi.quantity, qi.unit_price_tnd AS unitPrice, qi.tooth_fdi AS tooth
         FROM quote_items qi
         JOIN quotes q ON q.id = qi.quote_id AND q.tenant_id = qi.tenant_id
        WHERE qi.tenant_id = ? AND q.deleted_at IS NULL
        ORDER BY qi.quote_id, qi.id`,
      [session.tenantId],
    ),
  ]);
  const itemsByQuote = new Map<number, Array<{ description: string; quantity: number; unitPrice: number; tooth: number | null }>>();
  for (const item of itemRows as Array<{ quoteId: number; description: string; quantity: number | string; unitPrice: number | string; tooth: number | null }>) {
    const items = itemsByQuote.get(item.quoteId) ?? [];
    items.push({ description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), tooth: item.tooth });
    itemsByQuote.set(item.quoteId, items);
  }
  return NextResponse.json({
    data: rows.map((row: { id: number; number: string; date: string; patientId: number; patient: string; amount: string | number; status: string; notes: string | null; invoiceNumber: string | null }) => {
      const items = itemsByQuote.get(row.id) ?? [];
      return {
      ...row,
      items,
      act: items.map((item) => item.description).join(" · "),
      acts: items.reduce((total, item) => total + item.quantity, 0),
      amount: Number(row.amount),
      notes: row.notes ?? "",
      status: statusLabels[row.status] ?? "Brouillon",
      };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Devis invalide.");
    const totalMilli = parsed.data.items.reduce(
      (total, item) => total + decimalToMilli(item.unitPrice) * item.quantity,
      0,
    );
    if (!Number.isSafeInteger(totalMilli) || totalMilli > 9999999999999) {
      throw new HttpError(400, "Le total du devis dépasse le montant maximal autorisé.");
    }

    const quote = await withTransaction(async (connection) => {
      const patients = await connection.query(
        "SELECT id, CONCAT(first_name, ' ', last_name) AS name FROM patients WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [parsed.data.patientId, session.tenantId],
      );
      const patient = patients[0] as { id: number; name: string } | undefined;
      if (!patient) throw new HttpError(404, "Patient introuvable.");

      const number = await nextDocumentNumber(connection, session.tenantId, "quote", "DEV");
      const result = await connection.query(
        `INSERT INTO quotes
          (tenant_id, quote_number, patient_id, dentist_id, quote_date, subtotal_tnd, total_tnd, status, notes)
         VALUES (?, ?, ?, ?, CURRENT_DATE(), ?, ?, 'DRAFT', ?)`,
        [session.tenantId, number, parsed.data.patientId, session.userId, totalMilli / 1000, totalMilli / 1000, parsed.data.notes || null],
      );
      for (const item of parsed.data.items) {
        await connection.query(
          `INSERT INTO quote_items (tenant_id, quote_id, tooth_fdi, description, quantity, unit_price_tnd)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [session.tenantId, result.insertId, item.tooth, item.description, item.quantity, item.unitPrice],
        );
      }
      await audit(connection, session.tenantId, session.userId, "CREATE", "quote", result.insertId, {
        quote_number: number,
        patient_id: parsed.data.patientId,
        status: "Brouillon",
        notes: parsed.data.notes || null,
        acts: parsed.data.items.map((item) => ({ description: item.description, quantity: item.quantity, tooth: item.tooth })),
        total: totalMilli / 1000,
      });
      const dates = await connection.query("SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS date");
      return { id: result.insertId, number, patient: patient.name, date: dates[0].date as string };
    });

    return NextResponse.json({
      data: {
        ...quote,
        date: quote.date,
        patient: quote.patient,
        patientId: parsed.data.patientId,
        items: parsed.data.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          tooth: item.tooth,
        })),
        act: parsed.data.items.map((item) => item.description).join(" · "),
        acts: parsed.data.items.reduce((quantity, item) => quantity + item.quantity, 0),
        amount: totalMilli / 1000,
        notes: parsed.data.notes,
        status: "Brouillon",
        invoiceNumber: null,
      },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
