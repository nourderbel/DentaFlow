import { NextResponse } from "next/server";
import { withAuth, HttpError, DELETE_ROLES } from "@/server/http";
import * as service from "@/server/modules/patients/patients.service";

type Params = { id: string };

export const POST = withAuth<Params>(
  async (_request, session, { id: rawId }) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant invalide.");
    await service.restorePatient(session, id);
    return NextResponse.json({ ok: true });
  },
  { roles: DELETE_ROLES },
);
