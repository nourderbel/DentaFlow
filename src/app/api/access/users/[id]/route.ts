import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withAuth, withTransaction } from "@/server/http";
import { ACCESS_ACTIONS, ACCESS_MODULES, ensureAccessTables } from "@/server/auth/access-control";
import { audit } from "@/server/audit";

const schema = z.object({
  groupIds: z.array(z.number().int().positive()).max(100),
  role: z.enum(["DENTIST", "SECRETARY"]).optional(),
  overrides: z.array(z.object({
    module: z.enum(ACCESS_MODULES),
    action: z.enum(ACCESS_ACTIONS),
    allowed: z.boolean(),
  })).max(60),
});

export const PATCH = withAuth(async (request, session, { id: rawId }: { id: string }) => {
  await ensureAccessTables();
  const userId = Number(rawId);
  if (!Number.isSafeInteger(userId) || userId < 1) throw new HttpError(400, "Identifiant d’utilisateur invalide.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Droits d’utilisateur invalides.");
  const groupIds = [...new Set(parsed.data.groupIds)];
  const overrides = [...new Map(parsed.data.overrides.map((item) => [`${item.module}:${item.action}`, item])).values()];

  await withTransaction(async (connection) => {
    const userRows = await connection.query(
      `SELECT id, role FROM users
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [userId, session.tenantId],
    );
    if (!userRows[0]) throw new HttpError(404, "Utilisateur introuvable.");
    if (parsed.data.role && parsed.data.role !== String(userRows[0].role).toUpperCase()) {
      await connection.query("UPDATE users SET role = ? WHERE id = ? AND tenant_id = ?", [parsed.data.role, userId, session.tenantId]);
    }
    const groups = groupIds.length
      ? await connection.query(
        `SELECT id FROM access_groups
          WHERE tenant_id = ? AND id IN (${groupIds.map(() => "?").join(",")})`,
        [session.tenantId, ...groupIds],
      )
      : [];
    if (groups.length !== groupIds.length) throw new HttpError(400, "Un ou plusieurs groupes sont invalides.");

    await connection.query("DELETE FROM access_group_members WHERE tenant_id = ? AND user_id = ?", [session.tenantId, userId]);
    for (const groupId of groupIds) {
      await connection.query(
        "INSERT INTO access_group_members (tenant_id, group_id, user_id) VALUES (?, ?, ?)",
        [session.tenantId, groupId, userId],
      );
    }
    await connection.query("DELETE FROM user_access_permissions WHERE tenant_id = ? AND user_id = ?", [session.tenantId, userId]);
    for (const override of overrides) {
      await connection.query(
        `INSERT INTO user_access_permissions (tenant_id, user_id, module_key, action_key, allowed)
         VALUES (?, ?, ?, ?, ?)`,
        [session.tenantId, userId, override.module, override.action, override.allowed ? 1 : 0],
      );
    }
    await audit(connection, session.tenantId, session.userId, "UPDATE", "user_access", userId, {
      role: parsed.data.role ?? String(userRows[0].role).toUpperCase(),
      groupIds,
      overrides: overrides.map(({ module, action, allowed }) => ({ module, action, allowed })),
    });
  });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}, { permission: { module: "team", action: "edit" } });
