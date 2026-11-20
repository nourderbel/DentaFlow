import type { PatientFormValues, PatientListItem } from "./types";

export type PatientPrescription = {
  id: number;
  prescriptionNumber: string;
  date: string;
  practitioner: string;
  registrationNumber: string;
  practitionerAddress: string;
  practitionerPhone: string;
  patientName: string;
  patientNumber: string;
  medicines: string;
  instructions: string;
  createdAt: string;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Une erreur est survenue.");
  return body as T;
}

export function fetchPatientPrescriptions(patientId: number) {
  return request<{ data: PatientPrescription[] }>(`/api/patients/${patientId}/prescriptions`, { cache: "no-store" });
}

export function createPatientPrescription(patientId: number, prescription: Omit<PatientPrescription, "id" | "createdAt">) {
  return request<{ data: PatientPrescription }>(`/api/patients/${patientId}/prescriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prescription),
  });
}

export async function fetchPatients(search: string, archived = false): Promise<PatientListItem[]> {
  const params = new URLSearchParams({ q: search });
  if (archived) params.set("archived", "true");
  const { data } = await request<{ data: PatientListItem[] }>(`/api/patients?${params.toString()}`, { cache: "no-store" });
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

export function restorePatient(id: number) {
  return request<{ ok: true }>(`/api/patients/${id}/restore`, { method: "POST" });
}