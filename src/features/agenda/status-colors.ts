import type { AppointmentStatus } from "./types";

export const APPOINTMENT_STATUS_COLOR_DEFAULTS: Record<AppointmentStatus, string> = {
  PENDING: "#2d5fcb",
  CONFIRMED: "#1f8b5a",
  ARRIVED: "#a76507",
  IN_CONSULTATION: "#7b5ee8",
  COMPLETED: "#1873ae",
  CANCELLED: "#b42318",
  NO_SHOW: "#4b5563",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, { fr: string; ar: string }> = {
  PENDING: { fr: "En attente", ar: "في الانتظار" },
  CONFIRMED: { fr: "Confirmé", ar: "مؤكد" },
  ARRIVED: { fr: "Arrivé", ar: "وصل" },
  IN_CONSULTATION: { fr: "En consultation", ar: "قيد الاستشارة" },
  COMPLETED: { fr: "Terminé", ar: "مكتمل" },
  CANCELLED: { fr: "Annulé", ar: "ملغى" },
  NO_SHOW: { fr: "Absent", ar: "لم يحضر" },
};
