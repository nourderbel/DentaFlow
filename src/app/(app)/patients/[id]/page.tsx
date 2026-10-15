import { notFound, redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { HttpError } from "@/server/http";
import * as service from "@/server/modules/patients/patients.service";
import { PatientDetailView } from "@/features/patients/components/PatientDetailView";
import type { PatientDetail } from "@/features/patients/types";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId) || patientId <= 0) notFound();

  const session = await getSession();
  if (!session) redirect("/login");

  let patient: PatientDetail;
  try {
    patient = (await service.getPatient(session, patientId)) as PatientDetail;
  } catch (error) {
    if (error instanceof HttpError) notFound();
    throw error;
  }

  return <PatientDetailView patient={patient} canArchive={["ADMIN", "DENTIST"].includes(session.role)} />;
}