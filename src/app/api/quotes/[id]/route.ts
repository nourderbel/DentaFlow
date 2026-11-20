import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { HttpError, withAuth, withTransaction, WRITE_ROLES } from "@/server/http";

type Params = { id: string };
const schema = z.object({ status: z.enum(["Brouillon", "Envoyé", "Accepté", "Refusé"]) });
const statusValues = {
  Brouillon: "DRAFT",
  Envoyé: "SENT",
  Accepté: "ACCEPTED",
  Refusé: "REJECTED",
} as const;

export const PATCH = withAuth<Params>(
  async (request, session, { id }) => {
    const quoteId = Number(id);
    if (!Number.isInteger(quoteId) || quoteId <= 0) throw new HttpError(400, "Identifiant de devis invalide.");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Statut de devis invalide.");
    const status = statusValues[parsed.data.status];

    await withTransaction(async (connection) => {
      const rows = await connection.query(
        "SELECT status FROM quotes WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
        [quoteId, session.tenantId],
      );
      const current = rows[0] as { status: string } | undefined;
      if (!current) throw new HttpError(404, "Devis introuvable.");
      const allowedTransitions: Record<string, string[]> = {
        DRAFT: ["SENT", "REJECTED"],
        SENT: ["ACCEPTED", "REJECTED"],
      };
      if (!allowedTransitions[current.status]?.includes(status)) {
        throw new HttpError(409, "Cette transition de statut n’est pas autorisée.");
      }
      await connection.query("UPDATE quotes SET status = ? WHERE id = ? AND tenant_id = ?", [status, quoteId, session.tenantId]);
      await audit(connection, session.tenantId, session.userId, "UPDATE", "quote", quoteId, { status });
    });

    return NextResponse.json({ data: { id: quoteId, status: parsed.data.status } }, { headers: { "Cache-Control": "no-store" } });
  },
  { roles: WRITE_ROLES },
);
