import type { Locale } from "./i18n";

export function formatLocale(locale: Locale): string {
  return locale === "ar" ? "ar-TN" : "fr-FR";
}

export function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 3 }).format(Number(value) || 0)} DT`;
}

export function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
  locale: Locale = "fr",
): string {
  if (!value) return "—";
  // T12:00:00 évite qu'un décalage de fuseau horaire change le jour affiché
  return new Intl.DateTimeFormat(formatLocale(locale), options).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function initials(first: string, last: string): string {
  return `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase() || "?";
}