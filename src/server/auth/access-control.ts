import type { SessionClaims } from "@/server/auth/session";
import { getPool } from "@/server/db";

export const ACCESS_MODULES = [
  "dashboard", "agenda", "patients", "consultations", "odontogram", "treatments",
  "quotes", "invoices", "treasury", "laboratory", "stock", "suppliers", "reports",
  "team", "settings",
] as const;
export const ACCESS_ACTIONS = ["view", "create", "edit", "delete"] as const;
export type AccessModule = (typeof ACCESS_MODULES)[number];
export type AccessAction = (typeof ACCESS_ACTIONS)[number];
export type AccessRule = { module: AccessModule; action: AccessAction };
export type AccessRequirement = AccessRule | { anyOf: AccessRule[] };

let tablesReady: Promise<void> | null = null;

export function ensureAccessTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS access_groups (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(120) NOT NULL,
          description VARCHAR(500) NOT NULL DEFAULT '',
          created_by BIGINT UNSIGNED NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          UNIQUE KEY uq_access_group_name (tenant_id, name),
          KEY idx_access_groups_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS access_group_members (
          tenant_id BIGINT UNSIGNED NOT NULL,
          group_id BIGINT UNSIGNED NOT NULL,
          user_id BIGINT UNSIGNED NOT NULL,
          PRIMARY KEY (group_id, user_id),
          KEY idx_access_members_user (tenant_id, user_id),
          CONSTRAINT fk_access_members_group FOREIGN KEY (group_id) REFERENCES access_groups(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS access_group_permissions (
          group_id BIGINT UNSIGNED NOT NULL,
          module_key VARCHAR(40) NOT NULL,
          action_key VARCHAR(20) NOT NULL,
          PRIMARY KEY (group_id, module_key, action_key),
          CONSTRAINT fk_access_group_permissions_group FOREIGN KEY (group_id) REFERENCES access_groups(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_access_permissions (
          tenant_id BIGINT UNSIGNED NOT NULL,
          user_id BIGINT UNSIGNED NOT NULL,
          module_key VARCHAR(40) NOT NULL,
          action_key VARCHAR(20) NOT NULL,
          allowed TINYINT(1) NOT NULL,
          PRIMARY KEY (user_id, module_key, action_key),
          KEY idx_user_access_permissions_tenant (tenant_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

export function resolveRoutePermission(pathname: string, method: string): AccessRequirement | null {
  const path = pathname.replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "api" || ["auth", "health"].includes(parts[1] ?? "")) return null;
  const resource = parts[1] ?? "";
  const subResource = parts[3] ?? "";
  const action: AccessAction | null = method === "GET" || method === "HEAD" ? "view"
    : method === "POST" ? "create"
    : method === "PUT" || method === "PATCH" ? "edit"
    : method === "DELETE" ? "delete" : null;
  if (!action) return null;
  if (resource === "notifications") {
    return { anyOf: ["agenda", "stock", "laboratory"].map((module) => ({ module: module as AccessModule, action })) };
  }
  if (resource === "practitioners") {
    return { anyOf: ["agenda", "treatments", "patients", "dashboard"].map((module) => ({ module: module as AccessModule, action })) };
  }
  if (resource === "clinic-profile") {
    return { anyOf: ["settings", "quotes", "invoices", "patients"].map((module) => ({ module: module as AccessModule, action })) };
  }
  if (resource === "patients" && parts[2] === "receivables") {
    return { anyOf: [{ module: "dashboard", action }, { module: "treasury", action }] };
  }
  const moduleKey: AccessModule | null = resource === "patients" && ["odontogram", "prescriptions", "treatments", "finances"].includes(subResource)
    ? subResource === "odontogram" ? "odontogram" : subResource === "treatments" ? "treatments" : subResource === "finances" ? "treasury" : "patients"
    : ({
      appointments: "agenda", patients: "patients", consultations: "consultations",
      treatments: "treatments", quotes: "quotes", invoices: "invoices",
      treasury: "treasury", laboratory: "laboratory", stock: "stock",
      suppliers: "suppliers", team: "team", access: "team",
      "clinic-profile": "settings", practitioners: "agenda", notifications: "dashboard",
    } as Record<string, AccessModule>)[resource] ?? null;
  if (!moduleKey) return null;
  if (resource === "patients" && subResource === "restore") return { module: "patients", action: "edit" };
  return { module: moduleKey, action };
}

export async function canAccess(session: SessionClaims, permission: { module: AccessModule; action: AccessAction }) {
  await ensureAccessTables();
  const pool = getPool();
  const users = await pool.query(
    `SELECT role, is_active AS isActive FROM users
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
    [session.userId, session.tenantId],
  );
  const user = users[0] as { role: string; isActive: number | boolean } | undefined;
  if (!user || !Boolean(Number(user.isActive))) return false;
  const [overrides, memberships] = await Promise.all([
    pool.query(
      `SELECT allowed FROM user_access_permissions
        WHERE tenant_id = ? AND user_id = ? AND module_key = ? AND action_key = ? LIMIT 1`,
      [session.tenantId, session.userId, permission.module, permission.action],
    ),
    pool.query(
      "SELECT group_id AS groupId FROM access_group_members WHERE tenant_id = ? AND user_id = ?",
      [session.tenantId, session.userId],
    ),
  ]);
  if (overrides[0]) return Boolean(overrides[0].allowed);
  if (memberships.length > 0) {
    const grants = await pool.query(
      `SELECT 1 FROM access_group_permissions p
        JOIN access_group_members m ON m.group_id = p.group_id AND m.tenant_id = ?
       WHERE m.user_id = ? AND p.module_key = ? AND p.action_key = ? LIMIT 1`,
      [session.tenantId, session.userId, permission.module, permission.action],
    );
    return grants.length > 0;
  }
  return permission.module !== "team";
}

export async function getViewableModules(session: SessionClaims) {
  await ensureAccessTables();
  const pool = getPool();
  const users = await pool.query(
    `SELECT role FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
    [session.userId, session.tenantId],
  );
  const [overrides, groups, grants] = await Promise.all([
    pool.query(
      `SELECT module_key AS module, action_key AS action, allowed
         FROM user_access_permissions WHERE tenant_id = ? AND user_id = ? AND action_key = 'view'`,
      [session.tenantId, session.userId],
    ),
    pool.query("SELECT group_id AS groupId FROM access_group_members WHERE tenant_id = ? AND user_id = ?", [session.tenantId, session.userId]),
    pool.query(
      `SELECT DISTINCT p.module_key AS module
         FROM access_group_permissions p
         JOIN access_group_members m ON m.group_id = p.group_id
        WHERE m.tenant_id = ? AND m.user_id = ? AND p.action_key = 'view'`,
      [session.tenantId, session.userId],
    ),
  ]);
  const direct = new Map((overrides as Array<{ module: AccessModule; allowed: number | boolean }>).map((item) => [item.module, Boolean(Number(item.allowed))]));
  const granted = new Set((grants as Array<{ module: AccessModule }>).map((item) => item.module));
  const hasGroups = groups.length > 0;
  return ACCESS_MODULES.filter((module) => direct.has(module)
    ? direct.get(module)
    : hasGroups ? granted.has(module) : module !== "team");
}
