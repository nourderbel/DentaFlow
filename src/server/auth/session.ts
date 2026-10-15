import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "dentaflow_session";
export const SESSION_SECONDS = 8 * 60 * 60; // 8 heures

export type SessionClaims = { userId: number; tenantId: number; role: string };

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET doit contenir au moins 32 caractères (voir .env.local)");
  }
  return secret;
}

export function createSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: SESSION_SECONDS });
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const p = jwt.verify(token, getSecret()) as jwt.JwtPayload;
    if (typeof p.userId !== "number" || typeof p.tenantId !== "number" || typeof p.role !== "string") return null;
    return { userId: p.userId, tenantId: p.tenantId, role: p.role };
  } catch {
    return null; // expiré, falsifié ou malformé
  }
}

/** Lit le cookie de la requête en cours. À utiliser dans les routes API et les pages serveur. */
export async function getSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}