import type { PoolConnection } from "mariadb";

export async function audit(
  connection: PoolConnection,
  tenantId: number,
  userId: number,
  action: string,
  resource: string,
  resourceId: string | number,
  metadata?: Record<string, unknown>,
) {
  await connection.query(
    "INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
    [tenantId, userId, action, resource, String(resourceId), metadata ? JSON.stringify(metadata) : null],
  );
}