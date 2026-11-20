import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { getPool } from "@/server/db";
import { ensureNotificationSourceTables } from "@/server/modules/notifications/notification-sources";

const productSchema = z.object({
  name: z.string().trim().min(1).max(180),
  reference: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(100),
  supplierId: z.number().int().positive().nullable(),
  quantity: z.number().int().min(0),
  minimum: z.number().int().min(0),
  price: z.number().finite().min(0),
  lot: z.string().trim().min(1).max(100),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const GET = withAuth(async (_request, session) => {
  await ensureNotificationSourceTables();
  const rows = await getPool().query(
    `SELECT sp.id, sp.name, sp.reference_code AS reference, sp.supplier_id AS supplierId,
            COALESCE(sp.category, 'Consommables') AS category,
            COALESCE(s.name, 'À définir') AS supplier, sp.quantity,
            sp.minimum_quantity AS minimum, sp.purchase_price_tnd AS price,
            COALESCE(sp.lot_number, '—') AS lot,
            DATE_FORMAT(sp.expiry_date, '%Y-%m-%d') AS expiry
       FROM stock_products sp
       LEFT JOIN suppliers s ON s.id = sp.supplier_id AND s.tenant_id = sp.tenant_id
      WHERE sp.tenant_id = ? AND sp.deleted_at IS NULL
      ORDER BY sp.name, sp.id`,
    [session.tenantId],
  );
  return NextResponse.json({ data: rows.map((row: Record<string, unknown>) => ({
    ...row,
    id: Number(row.id),
    supplierId: row.supplierId === null ? null : Number(row.supplierId),
    quantity: Number(row.quantity),
    minimum: Number(row.minimum),
    price: Number(row.price),
  })) }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = productSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Produit invalide.");
    await ensureNotificationSourceTables();
    const product = await withTransaction(async (connection) => {
      const suppliers = parsed.data.supplierId !== null
        ? await connection.query(
          `SELECT id, name FROM suppliers
            WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1
              AND id = ?
            LIMIT 2`,
          [session.tenantId, parsed.data.supplierId],
        )
        : [];
      if (parsed.data.supplierId !== null && suppliers.length === 0) {
        throw new HttpError(404, "Fournisseur introuvable. Sélectionnez un fournisseur actif.");
      }
      if (suppliers.length > 1) throw new HttpError(409, "Plusieurs fournisseurs portent ce nom.");
      const result = await connection.query(
        `INSERT INTO stock_products
          (tenant_id, reference_code, name, category, supplier_id, purchase_price_tnd,
           quantity, minimum_quantity, expiry_date, lot_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.tenantId, parsed.data.reference, parsed.data.name, parsed.data.category,
          suppliers[0]?.id ?? null, parsed.data.price, parsed.data.quantity, parsed.data.minimum,
          parsed.data.expiry, parsed.data.lot === "—" ? null : parsed.data.lot],
      );
      await audit(connection, session.tenantId, session.userId, "CREATE", "stock_product", result.insertId, {
        name: parsed.data.name,
        reference: parsed.data.reference,
      });
      return {
        id: result.insertId,
        ...parsed.data,
        supplier: suppliers[0]?.name ?? "À définir",
        lot: parsed.data.lot || "—",
      };
    });
    return NextResponse.json({ data: product }, { status: 201, headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
