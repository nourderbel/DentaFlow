import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createSessionToken, SESSION_COOKIE, SESSION_SECONDS } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "E-mail ou mot de passe invalide." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const pool = getPool();
  const rows = await pool.query(
    `SELECT u.id, u.tenant_id, u.full_name, u.email, u.password_hash, u.role
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND t.is_active = 1
      LIMIT 1`,
    [email],
  );
  const user = rows[0];

  // Message identique que l'e-mail existe ou non : on ne révèle pas quels comptes existent.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: "E-mail ou mot de passe incorrect." }, { status: 401 });
  }

  await pool.query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND tenant_id = ?", [
    user.id,
    user.tenant_id,
  ]);

  const token = createSessionToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });
  const response = NextResponse.json({
    user: { id: user.id, name: user.full_name, email: user.email, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, // invisible pour le JavaScript du navigateur
    secure: process.env.NODE_ENV === "production", // HTTPS uniquement en production
    sameSite: "lax", // limite les attaques CSRF
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return response;
}