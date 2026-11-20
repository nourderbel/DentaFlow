import { NextResponse } from "next/server";
import { SESSION_COOKIE, LEGACY_SESSION_COOKIE } from "@/server/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set(LEGACY_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}