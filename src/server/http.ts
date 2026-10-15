import { NextResponse } from "next/server";
import type { PoolConnection } from "mariadb";
import { getSession, type SessionClaims } from "@/server/auth/session";
import { getPool } from "@/server/db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Rôles autorisés par action (version simple ; à affiner plus tard avec role_permissions)
const WRITE_ROLES = ["ADMIN", "DENTIST", "SECRETARY"];
const DELETE_ROLES = ["ADMIN", "DENTIST"];

type Handler<P> = (request: Request, session: SessionClaims, params: P) => Promise<Response>;

/** Vérifie la session, puis transforme toute erreur en réponse JSON propre. */
export function withAuth<P = Record<string, never>>(
  handler: Handler<P>,
  options: { roles?: string[] } = {},
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, "Non connecté.");
      if (options.roles && !options.roles.includes(session.role)) throw new HttpError(403, "Accès refusé.");
      return await handler(request, session, await context.params);
    } catch (error) {
      if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("Erreur API", error);
      return NextResponse.json({ error: "Erreur interne du serveur." }, { status: 500 });
    }
  };
}

/** Ouvre une transaction : commit si tout va bien, rollback si une erreur est levée. */
export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export { WRITE_ROLES, DELETE_ROLES };