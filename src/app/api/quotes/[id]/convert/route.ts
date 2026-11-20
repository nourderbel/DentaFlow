import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { nextDocumentNumber } from "@/server/numbering";

type Params = { id: string };

async function ensureTreatmentTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS patient_treatments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT UNSIGNED NOT NULL,
      patient_id BIGINT UNSIGNED NOT NULL,
      phase VARCHAR(80) NOT NULL,
      treatment VARCHAR(255) NOT NULL,
      teeth VARCHAR(120) NULL,
      amount DECIMAL(12,3) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'À faire',
      dentist VARCHAR(160) NOT NULL,
      planned_date DATE NOT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX patient_treatments_lookup (tenant_id, patient_id)
    ) ENGINE=InnoDB
  `);
}

export const POST = withAuth<Params>(
  async (_request, session, { id }) => {
    const quoteId = Number(id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) throw new HttpError(400, "Identifiant de devis invalide.");
    await ensureTreatmentTable();

    const result = await withTransaction(async (connection) => {
      const quotes = await connection.query(
        `SELECT q.patient_id AS patientId, q.quote_number AS quoteNumber, q.total_tnd AS total,
                q.status, i.id AS invoiceId, i.invoice_number AS invoiceNumber
           FROM quotes q
           LEFT JOIN invoices i ON i.quote_id = q.id AND i.tenant_id = q.tenant_id AND i.deleted_at IS NULL
          WHERE q.id = ? AND q.tenant_id = ? AND q.deleted_at IS NULL
          LIMIT 1 FOR UPDATE`,
        [quoteId, session.tenantId],
      );
      const quote = quotes[0] as {
        patientId: number;
        quoteNumber: string;
        total: string | number;
        status: string;
        invoiceId: number | null;
        invoiceNumber: string | null;
      } | undefined;
      if (!quote) throw new HttpError(404, "Devis introuvable.");
      if (quote.invoiceId) {
        return { invoiceId: quote.invoiceId, invoiceNumber: quote.invoiceNumber, alreadyConverted: true };
      }
      if (quote.status !== "ACCEPTED") {
        throw new HttpError(409, "Seul un devis accepté peut être converti en facture.");
      }

      const items = await connection.query(
        `SELECT description, quantity, unit_price_tnd AS unitPrice, tooth_fdi AS tooth
           FROM quote_items
          WHERE quote_id = ? AND tenant_id = ?
          ORDER BY id`,
        [quoteId, session.tenantId],
      ) as Array<{ description: string; quantity: string | number; unitPrice: string | number; tooth: number | null }>;
      if (items.length === 0) throw new HttpError(409, "Ce devis ne contient aucun acte à facturer.");

      const invoiceNumber = await nextDocumentNumber(connection, session.tenantId, "invoice", "FAC");
      const invoice = await connection.query(
        `INSERT INTO invoices
          (tenant_id, invoice_number, patient_id, quote_id, invoice_date, subtotal_tnd, total_tnd, paid_tnd, status)
         VALUES (?, ?, ?, ?, CURRENT_DATE(), ?, ?, 0, 'UNPAID')`,
        [session.tenantId, invoiceNumber, quote.patientId, quoteId, quote.total, quote.total],
      );

      for (const item of items) {
        await connection.query(
          `INSERT INTO invoice_items (tenant_id, invoice_id, tooth_fdi, description, quantity, unit_price_tnd)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [session.tenantId, invoice.insertId, item.tooth, item.description, item.quantity, item.unitPrice],
        );
        await connection.query(
          `INSERT INTO patient_treatments
            (tenant_id, patient_id, phase, treatment, teeth, amount, status, dentist, planned_date, created_by)
           VALUES (?, ?, 'Phase 1', ?, ?, ?, 'À faire', 'Praticien', CURRENT_DATE(), ?)`,
          [session.tenantId, quote.patientId, item.description, item.tooth === null ? null : String(item.tooth), Number(item.unitPrice) * Number(item.quantity), session.userId],
        );
      }

      await audit(connection, session.tenantId, session.userId, "CREATE", "invoice", invoice.insertId, {
        invoice_number: invoiceNumber,
        quote_id: quoteId,
        quote_number: quote.quoteNumber,
        patient_id: quote.patientId,
        total: Number(quote.total),
      });
      await audit(connection, session.tenantId, session.userId, "UPDATE", "quote", quoteId, {
        status: "ACCEPTED",
        invoice_id: invoice.insertId,
      });

      return { invoiceId: invoice.insertId, invoiceNumber, alreadyConverted: false };
    });

    return NextResponse.json(
      { data: result },
      { status: result.alreadyConverted ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
  },
  { roles: WRITE_ROLES },
);
