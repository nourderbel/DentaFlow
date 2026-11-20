import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { decimalToMilli, ensureTreatmentFinanceTables } from "@/server/modules/patients/treatment-finances";
import { ensureTreasuryTables } from "@/server/modules/treasury/treasury";

const entrySchema = z.object({
  kind: z.enum(["receipt", "expense"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date d’opération invalide."),
  beneficiary: z.string().trim().min(1).max(180),
  method: z.string().trim().min(1).max(40),
  document: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(255),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/)
    .refine((value) => decimalToMilli(value) > 0, "Le montant doit être supérieur à zéro."),
});

type TreasuryOperation = {
  id: string;
  reference: string;
  date: string;
  beneficiary: string;
  method: string;
  document: string;
  reason: string;
  amount: number;
  kind: "receipt" | "expense";
};

export const GET = withAuth(async (_request, session) => {
  await Promise.all([ensureTreatmentFinanceTables(), ensureTreasuryTables()]);
  const pool = getPool();
  const [entries, treatmentPayments, invoices, invoicePayments, debts] = await Promise.all([
    pool.query(
      `SELECT id, kind, reference, DATE_FORMAT(entry_date, '%Y-%m-%d') AS date,
              beneficiary, method, document, reason, amount
         FROM treasury_entries
        WHERE tenant_id = ?
        ORDER BY entry_date DESC, id DESC`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT tp.id, DATE_FORMAT(tp.payment_date, '%Y-%m-%d') AS date,
              CONCAT(p.first_name, ' ', p.last_name) AS beneficiary, tp.method,
              t.treatment AS reason, tp.amount
         FROM treatment_payments tp
         JOIN patients p ON p.id = tp.patient_id AND p.tenant_id = tp.tenant_id
         JOIN patient_treatments t ON t.id = tp.treatment_id
              AND t.patient_id = tp.patient_id AND t.tenant_id = tp.tenant_id
        WHERE tp.tenant_id = ? AND p.deleted_at IS NULL
        ORDER BY tp.payment_date DESC, tp.id DESC`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT i.id, i.invoice_number AS number,
              DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS date,
              CONCAT(p.first_name, ' ', p.last_name) AS beneficiary,
              i.paid_tnd AS paid
         FROM invoices i
         JOIN patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
        WHERE i.tenant_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL
          AND i.paid_tnd > 0`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT ip.id, ip.invoice_id AS invoiceId,
              DATE_FORMAT(ip.payment_date, '%Y-%m-%d') AS date,
              ip.amount, ip.method, i.invoice_number AS number,
              CONCAT(p.first_name, ' ', p.last_name) AS beneficiary
         FROM invoice_payments ip
         JOIN invoices i ON i.id = ip.invoice_id AND i.tenant_id = ip.tenant_id
         JOIN patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
        WHERE ip.tenant_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL
        ORDER BY ip.payment_date DESC, ip.id DESC`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT p.id AS patientId, p.patient_number AS patientNumber,
              CONCAT(p.first_name, ' ', p.last_name) AS patient,
              SUM(i.total_tnd - i.paid_tnd) AS balance,
              COUNT(*) AS invoiceCount
         FROM invoices i
         JOIN patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
        WHERE i.tenant_id = ? AND i.deleted_at IS NULL AND p.deleted_at IS NULL
          AND i.total_tnd > i.paid_tnd
        GROUP BY p.id, p.patient_number, p.first_name, p.last_name
        ORDER BY balance DESC, patient`,
      [session.tenantId],
    ),
  ]);

  const operations: TreasuryOperation[] = (entries as Array<{
    id: number; kind: "receipt" | "expense"; reference: string; date: string; beneficiary: string;
    method: string; document: string; reason: string; amount: string | number;
  }>).map((entry) => ({
    ...entry,
    id: `manual-${entry.id}`,
    amount: Number(entry.amount),
  }));
  for (const row of treatmentPayments as Array<{
    id: number; date: string; beneficiary: string; method: string; reason: string; amount: string | number;
  }>) {
    operations.push({
      id: `treatment-${row.id}`,
      reference: `REG-${row.id}`,
      date: row.date,
      beneficiary: row.beneficiary,
      method: row.method,
      document: "Plan de traitement",
      reason: row.reason,
      amount: Number(row.amount),
      kind: "receipt",
    });
  }

  const recordedByInvoice = new Map<number, number>();
  for (const row of invoicePayments as Array<{
    id: number; invoiceId: number; date: string; amount: string | number; method: string;
    number: string; beneficiary: string;
  }>) {
    const amount = Number(row.amount);
    recordedByInvoice.set(row.invoiceId, (recordedByInvoice.get(row.invoiceId) ?? 0) + amount);
    operations.push({
      id: `invoice-payment-${row.id}`,
      reference: `REG-FAC-${row.id}`,
      date: row.date,
      beneficiary: row.beneficiary,
      method: row.method,
      document: row.number,
      reason: "Paiement de facture",
      amount,
      kind: "receipt",
    });
  }
  for (const row of invoices as Array<{ id: number; number: string; date: string; beneficiary: string; paid: string | number }>) {
    const historicalBalance = Math.max(0, Number(row.paid) - (recordedByInvoice.get(row.id) ?? 0));
    if (historicalBalance > 0.0005) {
      operations.push({
        id: `invoice-history-${row.id}`,
        reference: `REG-FAC-${row.number}`,
        date: row.date,
        beneficiary: row.beneficiary,
        method: "Non précisé",
        document: row.number,
        reason: "Paiements antérieurs — détail indisponible",
        amount: historicalBalance,
        kind: "receipt",
      });
    }
  }
  operations.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));

  return NextResponse.json({
    data: {
      operations,
      debtors: (debts as Array<{
        patientId: number; patientNumber: string; patient: string; balance: string | number; invoiceCount: number;
      }>).map((row) => ({ ...row, balance: Number(row.balance) })),
    },
  }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = entrySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Opération de trésorerie invalide.");
    await ensureTreasuryTables();
    const entry = await withTransaction(async (connection) => {
      const result = await connection.query(
        `INSERT INTO treasury_entries
          (tenant_id, kind, reference, entry_date, beneficiary, method, document, reason, amount, created_by)
         VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.tenantId, parsed.data.kind, parsed.data.date, parsed.data.beneficiary,
          parsed.data.method, parsed.data.document, parsed.data.reason, parsed.data.amount, session.userId,
        ],
      );
      const reference = `${parsed.data.kind === "receipt" ? "REC" : "DEP"}-${String(result.insertId).padStart(6, "0")}`;
      await connection.query(
        "UPDATE treasury_entries SET reference = ? WHERE id = ? AND tenant_id = ?",
        [reference, result.insertId, session.tenantId],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "treasury_entry", result.insertId, {
        kind: parsed.data.kind,
        amount: parsed.data.amount,
        reference,
      });
      return {
        id: `manual-${result.insertId}`,
        reference,
        date: parsed.data.date,
        beneficiary: parsed.data.beneficiary,
        method: parsed.data.method,
        document: parsed.data.document,
        reason: parsed.data.reason,
        amount: decimalToMilli(parsed.data.amount) / 1000,
        kind: parsed.data.kind,
      };
    });
    return NextResponse.json({ data: entry }, { status: 201, headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
