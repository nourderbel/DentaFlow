import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { ensureNotificationSourceTables } from "@/server/modules/notifications/notification-sources";

type Params = { id: string };

export const PATCH = withAuth<Params>(
  async (request, session, { id }) => {
    const productId = Number(id);
    if (!Number.isSafeInteger(productId) || productId <= 0) throw new HttpError(400, "Identifiant de produit invalide.");
    const parsed = z.object({ quantity: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Quantité invalide.");
    await ensureNotificationSourceTables();
    const product = await withTransaction(async (connection) => {
      const rows = await connection.query(
        "SELECT quantity FROM stock_products WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [productId, session.tenantId],
      );
      if (!rows[0]) throw new HttpError(404, "Produit introuvable.");
      const quantity = Number(rows[0].quantity) + parsed.data.quantity;
      await connection.query("UPDATE stock_products SET quantity = ? WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL", [quantity, productId, session.tenantId]);
      await audit(connection, session.tenantId, session.userId, "UPDATE", "stock_product", productId, {
        restocked: parsed.data.quantity,
        quantity,
      });
      return { id: productId, quantity };
    });
    return NextResponse.json({ data: product }, { headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
