import { NextResponse } from "next/server";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import { patientInputSchema } from "@/server/modules/patients/patients.schema";
import * as service from "@/server/modules/patients/patients.service";

export const GET = withAuth(async (request, session) => {
  const search = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ data: await service.listPatients(session, search) });
});

export const POST = withAuth(
  async (request, session) => {
    const parsed = patientInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    return NextResponse.json({ data: await service.createPatient(session, parsed.data) }, { status: 201 });
  },
  { roles: WRITE_ROLES },
);