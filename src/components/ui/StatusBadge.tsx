const tones = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-blue-700",
  danger: "bg-rose-50 text-rose-700",
} as const;

type Tone = keyof typeof tones;

function toneFor(status: string): Tone {
  const s = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/confirm|accepte|termine|payee|recu|disponible/.test(s)) return "success";
  if (/annule|refuse|absent|expire|impay/.test(s)) return "danger";
  if (/arrive|consultation|cours/.test(s)) return "info";
  return "warning"; // attente, planifié, brouillon, envoyé…
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[toneFor(status)]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}