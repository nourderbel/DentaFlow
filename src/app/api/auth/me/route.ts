import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getPool } from "@/server/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const rows = await getPool().query(
    "SELECT id, full_name, email, role FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1 AND deleted_at IS NULL",
    [session.userId, session.tenantId],
  );
  if (!rows[0]) return NextResponse.json({ error: "Compte introuvable." }, { status: 401 });
  return NextResponse.json({ user: { id: rows[0].id, name: rows[0].full_name, email: rows[0].email, role: rows[0].role } });
}