import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/server/db";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: true, database: "not-configured" });
  }
  try {
    const rows = await getPool().query("SELECT VERSION() AS version");
    return NextResponse.json({ ok: true, database: "connected", version: rows[0].version });
  } catch (error) {
    console.error("Health check échoué", error);
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}