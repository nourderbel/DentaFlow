import type { PatientFormValues, PatientListItem } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Une erreur est survenue.");
  return body as T;
}

export async function fetchPatients(search: string): Promise<PatientListItem[]> {
  const { data } = await request<{ data: PatientListItem[] }>(`/api/patients?q=${encodeURIComponent(search)}`);
  return data;
}

export function createPatient(values: PatientFormValues) {
  return request<{ data: { id: number; patientNumber: string } }>("/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export function updatePatient(id: number, values: PatientFormValues) {
  return request<{ ok: true }>(`/api/patients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export function archivePatient(id: number) {
  return request<{ ok: true }>(`/api/patients/${id}`, { method: "DELETE" });
}