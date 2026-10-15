export type AppointmentStatus =
  | "PENDING"
  | "PLANNED"
  | "CONFIRMED"
  | "ARRIVED"
  | "IN_CONSULTATION"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type Appointment = {
  id: number;
  appointmentNumber: string;
  patientId: number;
  patientName: string;
  dentistId: number;
  dentistName: string;
  chairId: string;
  date: string;
  time: string;
  durationMinutes: number;
  type: string;
  status: AppointmentStatus;
  notes?: string | null;
};

export type Patient = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
};

export type Practitioner = {
  id: number;
  name: string;
  role: string;
};

export type AppointmentFormValues = {
  patientId: string;
  dentistId: string;
  chairId: string;
  date: string;
  time: string;
  durationMinutes: string;
  type: string;
  notes: string;
};