export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromISODate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function addDays(value: string, amount: number): string {
  const next = fromISODate(value);
  next.setDate(next.getDate() + amount);
  return toISODate(next);
}

/** Les 7 jours (lundi → dimanche) de la semaine contenant `value`. */
export function weekDates(value: string): string[] {
  const start = fromISODate(value);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(toISODate(start), i));
}

/** "09:30" → 570 (minutes depuis minuit), utile pour détecter les conflits. */
export function toMinutes(time: string): number {
  const [h, m] = (time || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}


/** Âge en années à partir d'une date de naissance "AAAA-MM-JJ", ou null. */
export function ageFromBirthDate(value: string | null): number | null {
  if (!value) return null;
  const birth = fromISODate(value.slice(0, 10));
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

