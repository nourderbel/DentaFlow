import { NextResponse } from "next/server";
import { withAuth } from "@/server/http";
import * as service from "@/server/modules/appointments/appointments.service";

export const GET = withAuth(async (_request, session) =>
  NextResponse.json({ data: await service.listPractitioners(session) }),
);