import { NextResponse } from "next/server";
import { withAuth, HttpError, WRITE_ROLES, DELETE_ROLES } from "@/server/http";
import { patientInputSchema } from "@/server/modules/patients/patients.schema";
import * as service from "@/server/modules/patients/patients.service";

type Params = { id: string };

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant invalide.");
  return id;
}

export const GET = withAuth<Params>(async (_request, session, { id }) =>
  NextResponse.json({ data: await service.getPatient(session, parseId(id)) }),
);

export const PATCH = withAuth<Params>(
  async (request, session, { id }) => {
    const parsed = patientInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    await service.updatePatient(session, parseId(id), parsed.data);
    return NextResponse.json({ ok: true });
  },
  { roles: WRITE_ROLES },
);

export const DELETE = withAuth<Params>(
  async (_request, session, { id }) => {
    await service.archivePatient(session, parseId(id));
    return NextResponse.json({ ok: true });
  },
  { roles: DELETE_ROLES },
);