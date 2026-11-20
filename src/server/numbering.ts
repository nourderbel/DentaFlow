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
  let nextValue = Number(rows[0].n);

  if (documentType === "patient") {
    const existing = await connection.query(
      "SELECT patient_number FROM patients WHERE tenant_id = ? AND patient_number LIKE ?",
      [tenantId, `${prefix}-${year}-%`],
    );
    const numberPattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    const highestExisting = existing.reduce((highest: number, row: { patient_number: string }) => {
      const match = row.patient_number.match(numberPattern);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    nextValue = Math.max(nextValue, highestExisting + 1);

    if (nextValue !== Number(rows[0].n)) {
      await connection.query(
        `UPDATE sequence_counters SET last_value = ?
          WHERE tenant_id = ? AND document_type = ? AND document_year = ?`,
        [nextValue, tenantId, documentType, year],
      );
    }
  }

  return `${prefix}-${year}-${String(nextValue).padStart(padding, "0")}`;
}