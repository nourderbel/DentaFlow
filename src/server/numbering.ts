import type { PoolConnection } from "mariadb";

/**
 * Renvoie le prochain numéro, ex. "PAT-2026-000001".
 * À appeler DANS une transaction : la ligne est verrouillée jusqu'au commit.
 */
export async function nextDocumentNumber(
  connection: PoolConnection,
  tenantId: number,
  documentType: string,
  prefix: string,
  padding = 6,
): Promise<string> {
  const year = new Date().getFullYear();
  // LAST_INSERT_ID(expr) mémorise la nouvelle valeur de façon atomique pour cette connexion
  await connection.query(
    `INSERT INTO sequence_counters (tenant_id, document_type, document_year, last_value)
     VALUES (?, ?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)`,
    [tenantId, documentType, year],
  );
  const rows = await connection.query("SELECT LAST_INSERT_ID() AS n");
  return `${prefix}-${year}-${String(rows[0].n).padStart(padding, "0")}`;
}