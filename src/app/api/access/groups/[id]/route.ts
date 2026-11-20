import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withAuth, withTransaction } from "@/server/http";
import { ACCESS_ACTIONS, ACCESS_MODULES, ensureAccessTables } from "@/server/auth/access-control";
import { audit } from "@/server/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500),
  permissions: z.array(z.object({
    module: z.enum(ACCESS_MODULES),
    action: z.enum(ACCESS_ACTIONS),
  })).max(60),
  userIds: z.array(z.number().int().positive()).max(500),
});

function parseId(raw: string) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identifiant de groupe invalide.");
  return id;
}

export const PATCH = withAuth(async (request, session, { id: rawId }: { id: string }) => {
  await ensureAccessTables();
  const id = parseId(rawId);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Données de groupe invalides.");
  const { name, description, permissions, userIds } = parsed.data;
  const distinctPermissions = [...new Map(permissions.map((item) => [`${item.module}:${item.action}`, item])).values()];
  const distinctUserIds = [...new Set(userIds)];
  await withTransaction(async (connection) => {
    const owned = await connection.query(
      "SELECT id FROM access_groups WHERE id = ? AND tenant_id = ? FOR UPDATE",
      [id, session.tenantId],
    );
    if (!owned[0]) throw new HttpError(404, "Groupe introuvable.");
    const duplicate = await connection.query(
      "SELECT id FROM access_groups WHERE tenant_id = ? AND name = ? AND id <> ? LIMIT 1",
      [session.tenantId, name, id],
    );
    if (duplicate[0]) throw new HttpError(409, "Un groupe porte déjà ce nom.");
    const users = distinctUserIds.length
      ? await connection.query(
        `SELECT id FROM users
          WHERE tenant_id = ? AND deleted_at IS NULL
            AND id IN (${distinctUserIds.map(() => "?").join(",")})`,
        [session.tenantId, ...distinctUserIds],
      )
      : [];
    if (users.length !== distinctUserIds.length) throw new HttpError(400, "Un ou plusieurs utilisateurs sont invalides.");
    await connection.query(
      "UPDATE access_groups SET name = ?, description = ? WHERE id = ? AND tenant_id = ?",
      [name, description, id, session.tenantId],
    );
    await connection.query("DELETE FROM access_group_permissions WHERE group_id = ?", [id]);
    await connection.query("DELETE FROM access_group_members WHERE group_id = ? AND tenant_id = ?", [id, session.tenantId]);
    for (const permission of distinctPermissions) {
      await connection.query(
        "INSERT INTO access_group_permissions (group_id, module_key, action_key) VALUES (?, ?, ?)",
        [id, permission.module, permission.action],
      );
    }
    for (const userId of distinctUserIds) {
      await connection.query(
        "INSERT INTO access_group_members (tenant_id, group_id, user_id) VALUES (?, ?, ?)",
        [session.tenantId, id, userId],
      );
    }
    await audit(connection, session.tenantId, session.userId, "UPDATE", "access_group", id, {
      name, permissionCount: distinctPermissions.length, userIds: distinctUserIds,
    });
  });
  return NextResponse.json({ data: { id, name, description } }, { headers: { "Cache-Control": "no-store" } });
}, { permission: { module: "team", action: "edit" } });

export const DELETE = withAuth(async (_request, session, { id: rawId }: { id: string }) => {
  await ensureAccessTables();
  const id = parseId(rawId);
  await withTransaction(async (connection) => {
    const result = await connection.query("DELETE FROM access_groups WHERE id = ? AND tenant_id = ?", [id, session.tenantId]);
    if (!result.affectedRows) throw new HttpError(404, "Groupe introuvable.");
    await audit(connection, session.tenantId, session.userId, "DELETE", "access_group", id);
  });
  return NextResponse.json({ success: true });
}, { permission: { module: "team", action: "delete" } });
