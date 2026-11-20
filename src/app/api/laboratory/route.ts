import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { nextDocumentNumber } from "@/server/numbering";
import { ensureNotificationSourceTables } from "@/server/modules/notifications/notification-sources";

const orderSchema = z.object({
  patient: z.string().trim().min(1).max(180),
  work: z.string().trim().min(1).max(255),
  tooth: z.string().trim().max(80).default("—"),
  laboratory: z.string().trim().min(1).max(180),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const GET = withAuth(async (_request, session) => {
  await ensureNotificationSourceTables();
  const rows = await getPool().query(
    `SELECT lo.id, lo.order_number AS number,
            CONCAT(p.first_name, ' ', p.last_name) AS patient,
            lo.work_description AS work, COALESCE(lo.tooth_fdi, '—') AS tooth,
            l.name AS laboratory,
            DATE_FORMAT(lo.sent_at, '%Y-%m-%d') AS sentAt,
            DATE_FORMAT(lo.expected_at, '%Y-%m-%d') AS dueAt,
            CASE lo.status
              WHEN 'TO_SEND' THEN 1
              WHEN 'SENT' THEN 2
              WHEN 'IN_PROGRESS' THEN 3
              WHEN 'TRY_IN' THEN 4
              WHEN 'READY' THEN 5
              WHEN 'RECEIVED' THEN 5
              ELSE 1
            END AS progress,
            CASE WHEN lo.received_at IS NOT NULL OR lo.status = 'RECEIVED'
              THEN 'Terminé'
              WHEN lo.status = 'TRY_IN' THEN 'Essaye'
              ELSE 'En cours'
            END AS displayStatus
       FROM laboratory_orders lo
       JOIN patients p ON p.id = lo.patient_id AND p.tenant_id = lo.tenant_id
       JOIN laboratories l ON l.id = lo.laboratory_id AND l.tenant_id = lo.tenant_id
      WHERE lo.tenant_id = ? AND lo.deleted_at IS NULL
        AND p.deleted_at IS NULL AND l.deleted_at IS NULL
      ORDER BY lo.expected_at, lo.id DESC`,
    [session.tenantId],
  );
  return NextResponse.json({ data: rows.map((row: Record<string, unknown>) => {
    const { displayStatus, ...order } = row;
    return { ...order, id: Number(row.id), progress: Number(row.progress), status: displayStatus };
  }) }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = orderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Commande laboratoire invalide.");
    await ensureNotificationSourceTables();
    const order = await withTransaction(async (connection) => {
      const number = await nextDocumentNumber(connection, session.tenantId, "laboratory", "LAB");
      const patients = await connection.query(
        `SELECT id FROM patients
          WHERE tenant_id = ? AND deleted_at IS NULL
            AND LOWER(CONCAT(first_name, ' ', last_name)) = LOWER(?)
          LIMIT 2`,
        [session.tenantId, parsed.data.patient],
      );
      if (patients.length === 0) throw new HttpError(404, "Patient introuvable. Saisissez le nom complet d’un patient actif.");
      if (patients.length > 1) throw new HttpError(409, "Plusieurs patients portent ce nom. Utilisez un nom plus précis.");
      const laboratories = await connection.query(
        `SELECT id FROM laboratories
          WHERE tenant_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?)
          LIMIT 2`,
        [session.tenantId, parsed.data.laboratory],
      );
      if (laboratories.length === 0) throw new HttpError(404, "Laboratoire introuvable. Saisissez le nom d’un laboratoire actif.");
      if (laboratories.length > 1) throw new HttpError(409, "Plusieurs laboratoires portent ce nom.");
      const result = await connection.query(
        `INSERT INTO laboratory_orders
          (tenant_id, order_number, patient_id, laboratory_id, work_description, tooth_fdi, sent_at, expected_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE(), ?, ?)`,
        [session.tenantId, number, patients[0].id, laboratories[0].id, parsed.data.work,
          parsed.data.tooth === "—" ? null : parsed.data.tooth, parsed.data.dueAt, session.userId],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "laboratory_order", result.insertId, {
        order_number: number,
        due_at: parsed.data.dueAt,
      });
      const dateRows = await connection.query("SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS date");
      return { id: result.insertId, number, patient: parsed.data.patient, work: parsed.data.work, tooth: parsed.data.tooth || "—",
        laboratory: parsed.data.laboratory, sentAt: dateRows[0].date, dueAt: parsed.data.dueAt, progress: 1, status: "En cours" };
    });
    return NextResponse.json({ data: order }, { status: 201, headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
