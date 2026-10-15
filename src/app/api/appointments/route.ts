import { NextResponse } from "next/server";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import { appointmentInputSchema } from "@/server/modules/appointments/appointments.schema";
import * as service from "@/server/modules/appointments/appointments.service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withAuth(async (request, session) => {
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) throw new HttpError(400, "Paramètres from et to requis (AAAA-MM-JJ).");
  return NextResponse.json({ data: await service.listAppointments(session, from, to) });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = appointmentInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    return NextResponse.json({ data: await service.createAppointment(session, parsed.data) }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);