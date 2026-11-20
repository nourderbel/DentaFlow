import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, withAuth, withTransaction } from "@/server/http";
import { getPool } from "@/server/db";
import { ACCESS_ACTIONS, ACCESS_MODULES, ensureAccessTables } from "@/server/auth/access-control";
import { audit } from "@/server/audit";

const permissionSchema = z.array(z.object({
  module: z.enum(ACCESS_MODULES),
  action: z.enum(ACCESS_ACTIONS),
})).max(60);
const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  permissions: permissionSchema.default([]),
  userIds: z.array(z.number().int().positive()).max(500).default([]),
});

export const GET = withAuth(async (_request, session) => {
  await ensureAccessTables();
  const pool = getPool();
  const [groups, members, groupPermissions, userPermissions] = await Promise.all([
    pool.query(
      `SELECT id, name, description, created_at AS createdAt
         FROM access_groups WHERE tenant_id = ? ORDER BY name`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT group_id AS groupId, user_id AS userId
         FROM access_group_members WHERE tenant_id = ?`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT p.group_id AS groupId, p.module_key AS module, p.action_key AS action
         FROM access_group_permissions p
         JOIN access_groups g ON g.id = p.group_id
        WHERE g.tenant_id = ?`,
      [session.tenantId],
    ),
    pool.query(
      `SELECT user_id AS userId, module_key AS module, action_key AS action, allowed
         FROM user_access_permissions WHERE tenant_id = ?`,
      [session.tenantId],
    ),
  ]);
  return NextResponse.json({
    data: { groups, members, groupPermissions, userPermissions, modules: ACCESS_MODULES, actions: ACCESS_ACTIONS },
  }, { headers: { "Cache-Control": "no-store" } });
}, { permission: { module: "team", action: "view" } });

export const POST = withAuth(async (request, session) => {
  await ensureAccessTables();
  const parsed = createGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Données de groupe invalides.");
  const { name, description, permissions, userIds } = parsed.data;
  const duplicate = await getPool().query(
    "SELECT id FROM access_groups WHERE tenant_id = ? AND name = ? LIMIT 1",
    [session.tenantId, name],
  );
  if (duplicate[0]) throw new HttpError(409, "Un groupe porte déjà ce nom.");
  const distinctPermissions = [...new Map(permissions.map((item) => [`${item.module}:${item.action}`, item])).values()];
  const distinctUserIds = [...new Set(userIds)];
  const group = await withTransaction(async (connection) => {
    const users = distinctUserIds.length
      ? await connection.query(
        `SELECT id FROM users
          WHERE tenant_id = ? AND deleted_at IS NULL
            AND id IN (${distinctUserIds.map(() => "?").join(",")})`,
        [session.tenantId, ...distinctUserIds],
      )
      : [];
    if (users.length !== distinctUserIds.length) throw new HttpError(400, "Un ou plusieurs utilisateurs sont invalides.");
    const result = await connection.query(
      "INSERT INTO access_groups (tenant_id, name, description, created_by) VALUES (?, ?, ?, ?)",
      [session.tenantId, name, description, session.userId],
    );
    const groupId = Number(result.insertId);
    for (const permission of distinctPermissions) {
      await connection.query(
        "INSERT INTO access_group_permissions (group_id, module_key, action_key) VALUES (?, ?, ?)",
        [groupId, permission.module, permission.action],
      );
    }
    for (const userId of distinctUserIds) {
      await connection.query(
        "INSERT INTO access_group_members (tenant_id, group_id, user_id) VALUES (?, ?, ?)",
        [session.tenantId, groupId, userId],
      );
    }
    await audit(connection, session.tenantId, session.userId, "CREATE", "access_group", groupId, {
      name, permissionCount: distinctPermissions.length, userIds: distinctUserIds,
    });
    return { id: groupId, name, description };
  });
  return NextResponse.json({ data: group }, { status: 201, headers: { "Cache-Control": "no-store" } });
}, { permission: { module: "team", action: "create" } });
