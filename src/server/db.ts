import mariadb, { type Pool } from "mariadb";

// On stocke le pool dans `globalThis` : en développement, Next.js recharge
// les modules à chaque modification, ce qui créerait un nouveau pool à
// chaque fois et finirait par saturer MariaDB de connexions.
const globalForDb = globalThis as unknown as { dentaflowPool?: Pool };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL n'est pas définie dans .env.local");
  }
  if (!globalForDb.dentaflowPool) {
    // On découpe l'URL nous-mêmes : le driver reçoit des options explicites.
    const parsed = new URL(url);
    globalForDb.dentaflowPool = mariadb.createPool({
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      connectionLimit: 10,
      bigIntAsNumber: true,
      insertIdAsNumber: true,
      dateStrings: true,
    });
  }
  return globalForDb.dentaflowPool;
}