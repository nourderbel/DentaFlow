import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { ensureNotificationSourceTables } from "@/server/modules/notifications/notification-sources";
import { canAccess } from "@/server/auth/access-control";

type Category = "agenda" | "stock" | "laboratory";
type Notice = {
  key: string;
  category: Category;
  title: string;
  description: string;
  context: string;
  href: string;
  date: string;
  read: boolean;
  active?: boolean;
};

export const GET = withAuth(async (_request, session) => {
  await ensureNotificationSourceTables();
  const pool = getPool();
  const [appointments, stock, laboratory] = await Promise.all([
    pool.query(
      `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(a.start_time, '%H:%i') AS time,
              CONCAT(p.first_name, ' ', p.last_name) AS patient
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
        WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND p.deleted_at IS NULL
          AND a.status = 'PENDING' AND a.appointment_date >= CURRENT_DATE()
        ORDER BY a.appointment_date, a.start_time
        LIMIT 50`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT id, name, quantity, minimum_quantity AS minimum
         FROM stock_products
        WHERE tenant_id = ? AND deleted_at IS NULL
          AND minimum_quantity > 0 AND quantity <= minimum_quantity
        ORDER BY quantity / minimum_quantity, name
        LIMIT 50`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT lo.id, lo.order_number AS number,
              CONCAT(p.first_name, ' ', p.last_name) AS patient,
              l.name AS laboratory, DATE_FORMAT(lo.expected_at, '%Y-%m-%d') AS dueAt
         FROM laboratory_orders lo
         JOIN patients p ON p.id = lo.patient_id AND p.tenant_id = lo.tenant_id
         JOIN laboratories l ON l.id = lo.laboratory_id AND l.tenant_id = lo.tenant_id
        WHERE lo.tenant_id = ? AND lo.deleted_at IS NULL
          AND p.deleted_at IS NULL AND l.deleted_at IS NULL
          AND lo.received_at IS NULL
          AND lo.expected_at <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
        ORDER BY lo.expected_at, lo.id
        LIMIT 50`,
      [session.tenantId],
    ),
  ]);

  const notices: Notice[] = [
    ...(appointments as Array<{ id: number; date: string; time: string; patient: string }>).map((row) => ({
      key: `appointment:${row.id}:confirmation`,
      category: "agenda" as const,
      title: "Rendez-vous à confirmer",
      description: `${row.patient} · ${row.time}`,
      context: row.date,
      href: `/agenda?appointmentId=${row.id}&date=${row.date}`,
      date: row.date,
      read: false,
    })),
    ...(stock as Array<{ id: number; name: string; quantity: number | string; minimum: number | string }>).map((row) => ({
      key: `stock:${row.id}:minimum`,
      category: "stock" as const,
      title: "Seuil de stock atteint",
      description: row.name,
      context: `${Number(row.quantity)} / ${Number(row.minimum)}`,
      href: `/stock?productId=${row.id}`,
      date: "",
      read: false,
    })),
    ...(laboratory as Array<{ id: number; number: string; patient: string; laboratory: string; dueAt: string }>).map((row) => ({
      key: `laboratory:${row.id}:due`,
      category: "laboratory" as const,
      title: "Travail de laboratoire à suivre",
      description: `${row.number} · ${row.patient}`,
      context: `${row.laboratory} · ${row.dueAt}`,
      href: `/laboratory?orderId=${row.id}`,
      date: row.dueAt,
      read: false,
    })),
  ].map((notice) => ({ ...notice, read: false }));
  const categoryModules = { agenda: "agenda", stock: "stock", laboratory: "laboratory" } as const;
  const categoryAccess = await Promise.all(
    Object.entries(categoryModules).map(async ([category, module]) => [
      category,
      await canAccess(session, { module, action: "view" }),
    ] as const),
  );
  const allowedCategories = new Set(categoryAccess.filter(([, allowed]) => allowed).map(([category]) => category));
  const visibleNotices = notices.filter((notice) => allowedCategories.has(notice.category));
  await withTransaction(async (connection) => {
    for (const notice of visibleNotices) {
      await connection.query(
        `INSERT INTO notification_history
          (tenant_id, user_id, notification_key, category, title, description, context, href, notification_date, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE
           category = VALUES(category), title = VALUES(title), description = VALUES(description),
           context = VALUES(context), href = VALUES(href), notification_date = VALUES(notification_date),
           last_seen_at = CURRENT_TIMESTAMP(3), resolved_at = NULL`,
        [session.tenantId, session.userId, notice.key, notice.category, notice.title,
          notice.description, notice.context, notice.href, notice.date || null],
      );
    }

    const categoryCounts = new Map<Category, number>();
    for (const notice of visibleNotices) {
      categoryCounts.set(notice.category, (categoryCounts.get(notice.category) ?? 0) + 1);
    }
    const categories = [...allowedCategories].filter((category) => (categoryCounts.get(category as Category) ?? 0) < 50);
    if (categories.length) {
      const keys = visibleNotices.map((notice) => notice.key);
      const exclusion = keys.length ? `AND notification_key NOT IN (${keys.map(() => "?").join(", ")})` : "";
      await connection.query(
        `UPDATE notification_history
            SET resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP(3))
          WHERE tenant_id = ? AND user_id = ? AND category IN (${categories.map(() => "?").join(", ")})
            ${exclusion}`,
        [session.tenantId, session.userId, ...categories, ...keys],
      );
    }
  });

  const history = allowedCategories.size
    ? await pool.query(
      `SELECT h.notification_key AS notificationKey, h.category, h.title, h.description,
              h.context, h.href, DATE_FORMAT(h.notification_date, '%Y-%m-%d') AS date,
              h.resolved_at AS resolvedAt,
              COALESCE(h.read_at, s.read_at) AS readAt
         FROM notification_history h
         LEFT JOIN notification_states s
           ON s.tenant_id = h.tenant_id AND s.user_id = h.user_id
          AND s.notification_key = h.notification_key
        WHERE h.tenant_id = ? AND h.user_id = ?
          AND h.category IN (${[...allowedCategories].map(() => "?").join(", ")})
        ORDER BY h.first_seen_at DESC, h.id DESC`,
      [session.tenantId, session.userId, ...allowedCategories],
    )
    : [];
  const data: Notice[] = (history as Array<{
    notificationKey: string;
    category: Category;
    title: string;
    description: string;
    context: string;
    href: string;
    date: string;
    resolvedAt: Date | string | null;
    readAt: Date | string | null;
  }>).map((item) => ({
    key: item.notificationKey,
    category: item.category,
    title: item.title,
    description: item.description,
    context: item.context,
    href: item.href,
    date: item.date ?? "",
    read: Boolean(item.readAt),
    active: !item.resolvedAt,
  }));
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});

export const PATCH = withAuth(
  async (request, session) => {
    const parsed = z.object({
      keys: z.array(z.string().trim().min(1).max(100)).min(1).max(150),
    }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Liste de notifications invalide.");
    await ensureNotificationSourceTables();
    await withTransaction(async (connection) => {
      for (const key of new Set(parsed.data.keys)) {
        await connection.query(
          `INSERT INTO notification_states (tenant_id, user_id, notification_key, read_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))`,
          [session.tenantId, session.userId, key],
        );
      }
      const keys = [...new Set(parsed.data.keys)];
      await connection.query(
        `UPDATE notification_history
            SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))
          WHERE tenant_id = ? AND user_id = ?
            AND notification_key IN (${keys.map(() => "?").join(", ")})`,
        [session.tenantId, session.userId, ...keys],
      );
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
