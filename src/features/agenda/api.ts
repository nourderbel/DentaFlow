import type {
  Appointment,
  AppointmentFormValues,
  Patient,
  Practitioner,
  AppointmentStatus,
} from "./types";

export type RescheduleHistoryItem = {
  id: number;
  userName: string;
  createdAt: string;
  fromDate: string;
  fromTime: string;
  date: string;
  time: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

export async function fetchAppointments(
  from: string,
  to: string,
): Promise<Appointment[]> {
  const response = await fetch(
    `/api/appointments?from=${from}&to=${to}`,
    {
      cache: "no-store",
    },
  );

  const result = await parseResponse<{ data: Appointment[] }>(response);
  return result.data;
}

export async function fetchPatients(): Promise<Patient[]> {
  const response = await fetch("/api/patients", {
    cache: "no-store",
  });

  const result = await parseResponse<{ data: Patient[] }>(response);
  return result.data;
}

export async function fetchPractitioners(): Promise<Practitioner[]> {
  const response = await fetch("/api/practitioners", {
    cache: "no-store",
  });

  const result = await parseResponse<{ data: Practitioner[] }>(response);
  return result.data;
}

export async function createAppointment(
  values: AppointmentFormValues,
): Promise<Appointment> {
  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      patientId: Number(values.patientId),
      dentistId: Number(values.dentistId),
      chairId: values.chairId,
      date: values.date,
      time: values.time,
      durationMinutes: Number(values.durationMinutes),
      type: values.type,
      notes: values.notes || undefined,
    }),
  });

  const result = await parseResponse<{
    data: Appointment;
  }>(response);

  return result.data;
}

export async function updateAppointment(
  id: number,
  values: AppointmentFormValues,
): Promise<void> {
  const response = await fetch(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      patientId: Number(values.patientId),
      dentistId: Number(values.dentistId),
      chairId: values.chairId,
      date: values.date,
      time: values.time,
      durationMinutes: Number(values.durationMinutes),
      type: values.type,
      notes: values.notes || undefined,
    }),
  });

  await parseResponse(response);
}

export async function updateAppointmentStatus(
  id: number,
  status: AppointmentStatus,
): Promise<void> {
  const response = await fetch(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  await parseResponse(response);
}

export async function rescheduleAppointment(
  id: number,
  date: string,
  time: string,
): Promise<void> {
  const response = await fetch(`/api/appointments/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ date, time }),
  });

  await parseResponse(response);
}

export async function fetchRescheduleHistory(
  id: number,
): Promise<RescheduleHistoryItem[]> {
  const response = await fetch(`/api/appointments/${id}`, {
    cache: "no-store",
  });

  const result = await parseResponse<{ data: RescheduleHistoryItem[] }>(response);
  return result.data;
}