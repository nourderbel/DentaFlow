import { NextResponse } from "next/server";
import { withAuth, withTransaction } from "@/server/http";
import { getPool } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { z } from "zod";
import { audit } from "@/server/audit";

const dentistSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(190).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(["DENTIST", "SECRETARY"]).default("DENTIST"),
});

export const GET = withAuth(async (_request, session) => {
  const rows = await getPool().query(
    `SELECT id, full_name AS name, email, role, is_active AS isActive, last_login_at AS lastLoginAt
       FROM users
      WHERE tenant_id = ? AND deleted_at IS NULL
      ORDER BY full_name`,
    [session.tenantId],
  );
  return NextResponse.json({ data: rows });
}, { permission: { module: "team", action: "view" } });

export const POST = withAuth(async (request, session) => {
  const parsed = dentistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });
  }

  const { name, email, password, role } = parsed.data;
  const pool = getPool();
  const existing = await pool.query(
    "SELECT id FROM users WHERE email = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1",
    [email, session.tenantId],
  );
  if (existing[0]) return NextResponse.json({ error: "Un compte utilise déjà cette adresse e-mail." }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const userId = await withTransaction(async (connection) => {
    const result = await connection.query(
      `INSERT INTO users
        (tenant_id, full_name, email, password_hash, role, is_active, deleted_at)
       VALUES (?, ?, ?, ?, ?, 1, NULL)`,
      [session.tenantId, name, email, passwordHash, role],
    );
    await audit(connection, session.tenantId, session.userId, "CREATE", "user_account", result.insertId, { role });
    return result.insertId;
  });
  const rows = await pool.query(
    `SELECT id, full_name AS name, email, role, is_active AS isActive, last_login_at AS lastLoginAt
       FROM users WHERE id = ? AND tenant_id = ?`,
    [userId, session.tenantId],
  );
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}, { permission: { module: "team", action: "create" } });
