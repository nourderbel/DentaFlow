import { z } from "zod";

export const APPOINTMENT_STATUSES = [
  "PENDING", "PLANNED", "CONFIRMED", "ARRIVED", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW",
] as const;

export const appointmentInputSchema = z.object({
  patientId: z.coerce.number().int().positive("Patient obligatoire."),
  dentistId: z.coerce.number().int().positive("Praticien obligatoire."),
  chairId: z.string().trim().min(1, "Fauteuil obligatoire.").max(48),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM)."),
  durationMinutes: z.coerce.number().int().min(10, "Durée minimale : 10 min.").max(480),
  type: z.string().trim().min(1).max(80).default("Consultation"),
  status: z.enum(APPOINTMENT_STATUSES).default("PENDING"),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const statusUpdateSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

export const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM)."),
});

export const appointmentUpdateSchema = appointmentInputSchema.omit({
  status: true,
});

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;