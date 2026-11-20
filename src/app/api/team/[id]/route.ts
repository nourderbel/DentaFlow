import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withAuth, withTransaction } from "@/server/http";
import { audit } from "@/server/audit";

const schema = z.object({ isActive: z.boolean() });

export const PATCH = withAuth(async (request, session, { id: rawId }: { id: string }) => {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identifiant d’utilisateur invalide.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Statut d’utilisateur invalide.");
  if (id === session.userId && !parsed.data.isActive) throw new HttpError(400, "Vous ne pouvez pas désactiver votre propre compte.");

  const updated = await withTransaction(async (connection) => {
    const rows = await connection.query(
      `SELECT id, role, is_active AS isActive FROM users
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id, session.tenantId],
    );
    const user = rows[0] as { id: number; role: string; isActive: number | boolean } | undefined;
    if (!user) throw new HttpError(404, "Utilisateur introuvable.");
    await connection.query("UPDATE users SET is_active = ? WHERE id = ? AND tenant_id = ?", [parsed.data.isActive ? 1 : 0, id, session.tenantId]);
    await audit(connection, session.tenantId, session.userId, "UPDATE", "user_account", id, { isActive: parsed.data.isActive });
    return parsed.data.isActive;
  });
  return NextResponse.json({ data: { id, isActive: updated } }, { headers: { "Cache-Control": "no-store" } });
}, { permission: { module: "team", action: "edit" } });
