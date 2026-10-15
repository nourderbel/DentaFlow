import { HttpError, withTransaction } from "@/server/http";
import { nextDocumentNumber } from "@/server/numbering";
import { audit } from "@/server/audit";
import type { SessionClaims } from "@/server/auth/session";
import type {
  AppointmentInput,
  RescheduleInput,
} from "./appointments.schema";
import * as repo from "./appointments.repository";

export const listAppointments = (session: SessionClaims, from: string, to: string) =>
  repo.listAppointments(session.tenantId, from, to);

export const listPractitioners = (session: SessionClaims) => repo.listPractitioners(session.tenantId);

export async function listRescheduleHistory(
  session: SessionClaims,
  id: number,
) {
  const rows = await repo.listRescheduleHistory(session.tenantId, id);

  return rows.map((row: {
    id: number;
    userName: string;
    createdAt: string;
    metadata: string | Record<string, unknown> | null;
  }) => ({
    id: row.id,
    userName: row.userName,
    createdAt: row.createdAt,
    ...(typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : row.metadata ?? {}),
  }));
}

export function createAppointment(session: SessionClaims, input: AppointmentInput) {
  return withTransaction(async (connection) => {
    if (!(await repo.patientExists(connection, session.tenantId, input.patientId))) throw new HttpError(404, "Patient introuvable.");
    if (!(await repo.practitionerExists(connection, session.tenantId, input.dentistId))) throw new HttpError(404, "Praticien introuvable.");

    await repo.lockDay(connection, session.tenantId, input.date);
    const conflict = await repo.findConflict(connection, session.tenantId, input);
    if (conflict) {
      throw new HttpError(409, `Conflit : le praticien ou le fauteuil est déjà réservé à ${conflict.time} (${conflict.appointmentNumber}).`);
    }

    const number = await nextDocumentNumber(connection, session.tenantId, "appointment", "RDV", 5);
    const id = await repo.insertAppointment(connection, session.tenantId, session.userId, number, input);
    await audit(connection, session.tenantId, session.userId, "CREATE", "appointment", id, { number, date: input.date, time: input.time });
    return { id, appointmentNumber: number };
  });
}

export function updateAppointment(
  session: SessionClaims,
  id: number,
  input: Omit<AppointmentInput, "status">,
) {
  return withTransaction(async (connection) => {
    if (!(await repo.patientExists(connection, session.tenantId, input.patientId))) {
      throw new HttpError(404, "Patient introuvable.");
    }
    if (!(await repo.practitionerExists(connection, session.tenantId, input.dentistId))) {
      throw new HttpError(404, "Praticien introuvable.");
    }

    const current = await repo.findAppointmentForReschedule(
      connection,
      session.tenantId,
      id,
    );
    if (!current) throw new HttpError(404, "Rendez-vous introuvable.");

    const today = new Date().toISOString().slice(0, 10);
    if (input.date < today) {
      throw new HttpError(400, "La date doit être aujourd'hui ou ultérieure.");
    }

    await repo.lockDay(connection, session.tenantId, input.date);
    if (input.date !== current.date) {
      await repo.lockDay(connection, session.tenantId, current.date);
    }

    const conflict = await repo.findConflict(
      connection,
      session.tenantId,
      input,
      id,
    );
    if (conflict) {
      throw new HttpError(
        409,
        `Conflit : le praticien ou le fauteuil est déjà réservé à ${conflict.time} (${conflict.appointmentNumber}).`,
      );
    }

    if (
      !(await repo.updateAppointment(
        connection,
        session.tenantId,
        id,
        input,
      ))
    ) {
      throw new HttpError(404, "Rendez-vous introuvable.");
    }
  });
}

export function changeStatus(session: SessionClaims, id: number, status: string) {
  return withTransaction(async (connection) => {
    if (!(await repo.updateStatus(connection, session.tenantId, id, status))) throw new HttpError(404, "Rendez-vous introuvable.");
    await audit(connection, session.tenantId, session.userId, "UPDATE_STATUS", "appointment", id, { status });
  });
}

export function rescheduleAppointment(session: SessionClaims, id: number, input: RescheduleInput) {
  return withTransaction(async (connection) => {
    const appointment = await repo.findAppointmentForReschedule(connection, session.tenantId, id);
    if (!appointment) throw new HttpError(404, "Rendez-vous introuvable.");

    const today = new Date().toISOString().slice(0, 10);
    if (input.date < today) {
      throw new HttpError(400, "La nouvelle date doit être aujourd'hui ou ultérieure.");
    }

    await repo.lockDay(connection, session.tenantId, input.date);
    if (input.date !== appointment.date) {
      await repo.lockDay(connection, session.tenantId, appointment.date);
    }

    const conflict = await repo.findConflict(
      connection,
      session.tenantId,
      {
        date: input.date,
        time: input.time,
        dentistId: appointment.dentistId,
        chairId: appointment.chairId,
        durationMinutes: appointment.durationMinutes,
      },
      id,
    );
    if (conflict) {
      throw new HttpError(409, `Conflit : le praticien ou le fauteuil est déjà réservé à ${conflict.time} (${conflict.appointmentNumber}).`);
    }

    await repo.updateSchedule(connection, session.tenantId, id, input);
    await audit(connection, session.tenantId, session.userId, "RESCHEDULE", "appointment", id, {
      fromDate: appointment.date,
      fromTime: appointment.time,
      date: input.date,
      time: input.time,
    });
  });
}

export function cancelAppointment(session: SessionClaims, id: number) {
  return withTransaction(async (connection) => {
    if (!(await repo.cancelAppointment(connection, session.tenantId, id))) throw new HttpError(404, "Rendez-vous introuvable.");
    await audit(connection, session.tenantId, session.userId, "SOFT_DELETE", "appointment", id);
  });
}