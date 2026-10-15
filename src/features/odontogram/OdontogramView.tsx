"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";

type Patient = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export function OdontogramView() {
  const { locale } = useI18n();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/patients?q=")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Chargement des patients impossible.");
        return payload as { data: Patient[] };
      })
      .then(({ data }) => {
        if (!cancelled) setPatients(data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Chargement des patients impossible.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredPatients = patients.filter((patient) => {
    const haystack = `${patient.patientNumber} ${patient.firstName} ${patient.lastName} ${patient.phone}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return <div className="space-y-5">
    <header>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Odontogramme", "مخطط الأسنان")}</h1>
      <p className="mt-1 text-sm text-slate-500">{label("Sélectionnez un patient pour consulter et modifier son odontogramme dans son dossier médical.", "اختر مريضا لعرض وتعديل مخطط أسنانه داخل ملفه الطبي.")}</p>
    </header>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="relative max-w-md">
        <Icon name="search" size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label("Rechercher un patient...", "البحث عن مريض...")} />
      </div>
      {loading && <p className="mt-5 text-sm text-slate-500">{label("Chargement des patients...", "جار تحميل المرضى...")}</p>}
      {error && <p className="mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!loading && !error && filteredPatients.length === 0 && <p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">{label("Aucun patient trouvé.", "لم يتم العثور على أي مريض.")}</p>}
      {!loading && !error && filteredPatients.length > 0 && <div className="mt-5 divide-y divide-line">{filteredPatients.map((patient) => <div key={patient.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div><p className="font-semibold text-ink">{patient.firstName} {patient.lastName}</p><p className="text-xs text-slate-400">{patient.patientNumber} · {patient.phone}</p></div><Link href={`/patients/${patient.id}`} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90"><Icon name="tooth" size={14} />{label("Ouvrir l’odontogramme", "فتح مخطط الأسنان")}</Link></div>)}</div>}
    </section>
  </div>;
}
