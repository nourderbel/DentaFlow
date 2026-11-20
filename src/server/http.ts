import { NextResponse } from "next/server";
import type { PoolConnection } from "mariadb";
import { getSession, type SessionClaims } from "@/server/auth/session";
import { getPool } from "@/server/db";
import { canAccess, resolveRoutePermission, type AccessRequirement } from "@/server/auth/access-control";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Rôles autorisés par action (version simple ; à affiner plus tard avec role_permissions)
const WRITE_ROLES = ["DENTIST", "SECRETARY"];
const DELETE_ROLES = ["DENTIST"];

type Handler<P> = (request: Request, session: SessionClaims, params: P) => Promise<Response>;

/** Vérifie la session, puis transforme toute erreur en réponse JSON propre. */
export function withAuth<P = Record<string, never>>(
  handler: Handler<P>,
  options: { roles?: string[]; permission?: AccessRequirement } = {},
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    try {
      const tokenSession = await getSession();
      if (!tokenSession) throw new HttpError(401, "Non connecté.");
      const users = await getPool().query(
        `SELECT role, is_active AS isActive FROM users
          WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
        [tokenSession.userId, tokenSession.tenantId],
      );
      const user = users[0] as { role: string; isActive: number | boolean } | undefined;
      if (!user || !Boolean(Number(user.isActive))) throw new HttpError(401, "Compte désactivé ou introuvable.");
      const session = { ...tokenSession, role: String(user.role).toUpperCase() };
      const permission = options.permission ?? resolveRoutePermission(new URL(request.url).pathname, request.method);
      if (!permission && options.roles && !options.roles.includes(session.role)) throw new HttpError(403, "Accès refusé.");
      const allowed = permission
        ? "anyOf" in permission
          ? (await Promise.all(permission.anyOf.map((rule) => canAccess(session, rule)))).some(Boolean)
          : await canAccess(session, permission)
        : true;
      if (!allowed) throw new HttpError(403, "Vous ne disposez pas des droits nécessaires.");
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