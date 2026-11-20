import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";
import { ensureNotificationSourceTables } from "@/server/modules/notifications/notification-sources";

type Params = { id: string };

export const PATCH = withAuth<Params>(
  async (_request, session, { id }) => {
    const orderId = Number(id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) throw new HttpError(400, "Identifiant de commande invalide.");
    await ensureNotificationSourceTables();
    const order = await withTransaction(async (connection) => {
      const rows = await connection.query(
        "SELECT status, received_at AS receivedAt FROM laboratory_orders WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [orderId, session.tenantId],
      );
      if (!rows[0]) throw new HttpError(404, "Commande laboratoire introuvable.");
      if (rows[0].receivedAt || rows[0].status === "RECEIVED") throw new HttpError(409, "Cette commande est déjà terminée.");
      const nextStatus: Record<string, string> = {
        TO_SEND: "SENT",
        SENT: "IN_PROGRESS",
        IN_PROGRESS: "TRY_IN",
        TRY_IN: "RECEIVED",
        READY: "RECEIVED",
      };
      const status = nextStatus[rows[0].status];
      if (!status) throw new HttpError(409, "Le statut actuel de la commande ne permet pas cette étape.");
      const progress: Record<string, number> = { SENT: 2, IN_PROGRESS: 3, TRY_IN: 4, RECEIVED: 5 };
      await connection.query(
        `UPDATE laboratory_orders
            SET status = ?, sent_at = COALESCE(sent_at, CURRENT_DATE()),
                received_at = IF(? = 'RECEIVED', CURRENT_DATE(), received_at)
          WHERE id = ? AND tenant_id = ?`,
        [status, status, orderId, session.tenantId],
      );
      await audit(connection, session.tenantId, session.userId, "UPDATE", "laboratory_order", orderId, {
        progress: progress[status],
        status,
      });
      return {
        id: orderId,
        progress: progress[status],
        status: status === "RECEIVED" ? "Terminé" : status === "TRY_IN" ? "Essaye" : "En cours",
      };
    });
    return NextResponse.json({ data: order }, { headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
