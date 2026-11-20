import { NextResponse } from "next/server";
import { withAuth } from "@/server/http";
import { listReceivables } from "@/server/modules/patients/patients.service";

export const GET = withAuth(async (_request, session) =>
  NextResponse.json(await listReceivables(session), {
    headers: { "Cache-Control": "no-store" },
  }),
);
