"use client";

import { useEffect, useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type PatientOption = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type Props = {
  locale: "fr" | "ar";
  selectedPatient: PatientOption | null;
  onSelect: (patient: PatientOption | null) => void;
};

export function PatientSearchField({ locale, selectedPatient, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  const isArabic = locale === "ar";

  useEffect(() => {
    const search = query.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (search.length < 2) {
        setLoading(false);
        setPatients([]);
        setError("");
        return;
      }
      setLoading(true);
      setPatients([]);
      setError("");
      try {
        const params = new URLSearchParams({ q: search });
        const response = await fetch(`/api/patients?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (isArabic ? "تعذر البحث عن المرضى." : "Recherche de patients impossible."));
        setPatients((body as { data: PatientOption[] }).data);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setPatients([]);
        setError(reason instanceof Error ? reason.message : (isArabic ? "تعذر البحث عن المرضى." : "Recherche de patients impossible."));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim().length < 2 ? 0 : 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, isArabic]);

  const label = (fr: string, ar: string) => isArabic ? ar : fr;
  const fieldClass = "search-with-icon block h-11 w-full rounded-xl border border-slate-200 bg-white ps-11 pe-4 text-sm font-medium text-ink shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-accent focus:ring-4 focus:ring-accent/10";

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">
        {label("Rechercher un patient", "ابحث عن مريض")} <span className="text-rose-500" aria-hidden="true">*</span>
      </label>
      <div className="relative mt-1.5">
        <Icon name="search" size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          required
          autoComplete="off"
          className={`${fieldClass} ${selectedPatient ? "border-emerald-300 bg-emerald-50/40" : ""}`}
          value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName} · ${selectedPatient.patientNumber}` : query}
          onChange={(event) => {
            onSelect(null);
            setQuery(event.target.value);
            if (event.target.value.trim().length >= 2) setLoading(true);
          }}
          placeholder={label("Nom, numéro de dossier ou téléphone", "الاسم أو رقم الملف أو الهاتف")}
          role="combobox"
          aria-controls={`${inputId}-results`}
          aria-expanded={query.trim().length >= 2}
          aria-autocomplete="list"
        />
        {query.trim().length >= 2 && (
          <div id={`${inputId}-results`} role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-lg">
            {loading ? (
              <p className="px-3 py-2.5 text-sm text-slate-500">{label("Recherche en cours…", "جارٍ البحث…")}</p>
            ) : error ? (
              <p role="alert" className="px-3 py-2.5 text-sm text-rose-600">{error}</p>
            ) : patients.length ? patients.map((patient) => (
              <button
                key={patient.id}
                type="button"
                role="option"
                aria-selected={selectedPatient?.id === patient.id}
                onClick={() => {
                  onSelect(patient);
                  setQuery("");
                  setPatients([]);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start transition hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{patient.firstName} {patient.lastName}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">{patient.patientNumber} · {patient.phone}</span>
                </span>
                <Icon name="chevronRight" size={15} className="shrink-0 text-slate-400" />
              </button>
            )) : (
              <p className="px-3 py-2.5 text-sm text-slate-500">{label("Aucun patient trouvé.", "لم يتم العثور على مرضى.")}</p>
            )}
          </div>
        )}
      </div>
      {selectedPatient && <span className="mt-1.5 block text-xs font-normal text-slate-400">{label("Patient sélectionné.", "تم اختيار المريض.")}</span>}
    </div>
  );
}
