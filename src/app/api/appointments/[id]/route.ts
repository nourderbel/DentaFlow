import { NextResponse } from "next/server";
import { withAuth, HttpError, WRITE_ROLES } from "@/server/http";
import {
  appointmentUpdateSchema,
  rescheduleSchema,
  statusUpdateSchema,
} from "@/server/modules/appointments/appointments.schema";
import * as service from "@/server/modules/appointments/appointments.service";

type Params = { id: string };

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Identifiant invalide.");
  return id;
}

export const PATCH = withAuth<Params>(
  async (request, session, { id }) => {
    const body = await request.json().catch(() => null);
    const status = statusUpdateSchema.safeParse(body);

    if (status.success) {
      await service.changeStatus(session, parseId(id), status.data.status);
      return NextResponse.json({ ok: true });
    }

    const reschedule = rescheduleSchema.safeParse(body);
    if (
      reschedule.success &&
      body &&
      typeof body === "object" &&
      !("patientId" in body)
    ) {
      await service.rescheduleAppointment(session, parseId(id), reschedule.data);
      return NextResponse.json({ ok: true });
    }

    const update = appointmentUpdateSchema.safeParse(body);
    if (!update.success) {
      throw new HttpError(400, update.error.issues[0]?.message ?? "Données du rendez-vous invalides.");
    }

    await service.updateAppointment(session, parseId(id), update.data);
    return NextResponse.json({ ok: true });
  },
  { roles: WRITE_ROLES },
);

export const GET = withAuth<Params>(
  async (_request, session, { id }) => {
    return NextResponse.json({
      data: await service.listRescheduleHistory(session, parseId(id)),
    });
  },
);

export const DELETE = withAuth<Params>(
  async (_request, session, { id }) => {
    await service.cancelAppointment(session, parseId(id));
    return NextResponse.json({ ok: true });
  },
  { roles: WRITE_ROLES },
);