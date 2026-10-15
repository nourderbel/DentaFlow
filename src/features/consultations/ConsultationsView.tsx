"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

type Consultation = {
  id: number;
  consultationNumber: string;
  patientId: number;
  patientName: string;
  patientNumber: string;
  patientPhone: string;
  consultationDate: string;
  consultationTime: string;
  consultationType: string;
  notes: string | null;
  status: string;
  practitioner: string;
};

type Summary = { total: number; patients: number; upcoming: number; completed: number };

const statusLabels: Record<string, [string, string]> = {
  PENDING: ["En attente", "في الانتظار"],
  PLANNED: ["Planifiée", "مخططة"],
  CONFIRMED: ["Confirmée", "مؤكدة"],
  ARRIVED: ["Arrivé", "وصل"],
  IN_CONSULTATION: ["En consultation", "في الاستشارة"],
  COMPLETED: ["Terminée", "مكتملة"],
};

export function ConsultationsView() {
  const { locale, t } = useI18n();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, patients: 0, upcoming: 0, completed: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/consultations", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement impossible.");
        if (active) {
          setConsultations(body.data);
          setSummary(body.summary ?? { total: 0, patients: 0, upcoming: 0, completed: 0 });
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return consultations;
    return consultations.filter((item) =>
      [item.patientName, item.patientNumber, item.patientPhone, item.consultationNumber, item.practitioner]
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [consultations, search]);

  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const date = (value: string) => formatDate(value, undefined, locale);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Consultations", "الاستشارات")}</h1>
          <p className="mt-1 text-sm text-slate-500">{label("Dossiers cliniques structurés et chronologie des soins.", "الملفات السريرية وتسلسل الرعاية.")}</p>
        </div>
        <Link href="/agenda" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90">
          <Icon name="plus" size={15} /> {label("Nouvelle consultation", "استشارة جديدة")}
        </Link>
      </header>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="clipboard" label={label("Consultations enregistrées", "الاستشارات المسجلة")} value={summary.total} />
        <Metric icon="patients" label={label("Patients suivis", "المرضى المتابعون")} value={summary.patients} />
        <Metric icon="calendar" label={label("À venir", "القادمة")} value={summary.upcoming} />
        <Metric icon="checkCircle" label={label("Historique réalisé", "الاستشارات المنجزة")} value={summary.completed} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <h2 className="font-bold text-ink">{label("Chronologie médicale", "التسلسل الطبي")}</h2>
              <p className="mt-1 text-xs text-slate-400">{label(`${filtered.length} consultation(s) enregistrée(s)`, `${filtered.length} استشارة مسجلة`)}</p>
            </div>
            <label className="relative block">
              <Icon name="search" size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-56 rounded-lg border border-line py-2 pl-9 pr-3 text-xs outline-none focus:border-accent" placeholder={label("Patient, dossier, téléphone…", "المريض أو الملف أو الهاتف…")} />
            </label>
          </div>
          <div className="p-5">
            {loading ? <p className="py-10 text-center text-sm text-slate-400">{t("common.loading")}</p> :
              filtered.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">{label("Aucune consultation trouvée.", "لم يتم العثور على استشارة.")}</p> :
              <div className="relative space-y-5 before:absolute before:bottom-4 before:left-[9px] before:top-4 before:w-px before:bg-violet-100">
                {filtered.map((item) => <ConsultationCard key={item.id} item={item} locale={locale} date={date} label={label} patientHref={`/patients/${item.patientId}`} />)}
              </div>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="font-bold text-ink">{label("Nouveau dossier", "ملف جديد")}</h2>
            <p className="mt-1 text-xs text-slate-400">{label("Enregistrer la visite du patient", "تسجيل زيارة المريض")}</p>
            <p className="mt-4 text-xs leading-5 text-slate-500">{label("La consultation contient l'anamnèse, l'examen, le diagnostic, les soins réalisés et les recommandations.", "تتضمن الاستشارة التاريخ المرضي والفحص والتشخيص والعلاجات والتوصيات.")}</p>
            <Link href="/agenda" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90"><Icon name="plus" size={14} /> {label("Créer une consultation", "إنشاء استشارة")}</Link>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="font-bold text-ink">{label("Pièces du dossier", "وثائق الملف")}</h2>
            <p className="mt-1 text-xs text-slate-400">{label("Bibliothèque documentaire patient", "مكتبة وثائق المرضى")}</p>
            {[
              [label("Radiographies", "صور الأشعة"), "—"],
              [label("Photos cliniques", "الصور السريرية"), "—"],
              [label("Odontogrammes", "مخططات الأسنان"), "—"],
              [label("Documents PDF", "مستندات PDF"), "—"],
            ].map(([name, count]) => <div key={name} className="flex justify-between border-b border-line py-3 text-xs"><span className="text-slate-500">{name}</span><strong className="text-ink">{count}</strong></div>)}
            <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-slate-400">{label("Les pièces sont accessibles depuis le dossier patient.", "الوثائق متاحة من ملف المريض.")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ConsultationCard({ item, locale, date, label, patientHref }: { item: Consultation; locale: "fr" | "ar"; date: (value: string) => string; label: (fr: string, ar: string) => string; patientHref: string }) {
  const [statusFr, statusAr] = statusLabels[item.status] ?? ["Consultation", "استشارة"];
  const initials = item.patientName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <article className="relative pl-8">
    <span className="absolute left-0 top-1.5 z-10 h-[19px] w-[19px] rounded-full border-4 border-white bg-accent shadow-sm" />
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-accent/30 hover:bg-white hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-100 font-bold text-violet-600">{initials}</span>
        <strong className="text-ink">{item.patientName}</strong>
        <span className="text-[10px] text-slate-400">{date(item.consultationDate)} · {item.consultationNumber}</span>
        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{locale === "ar" ? statusAr : statusFr}</span>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <p><strong className="text-ink">{label("Motif", "السبب")} :</strong> <span className="text-slate-600">{item.consultationType}</span></p>
        <p><strong className="text-ink">{label("Praticien", "الممارس")} :</strong> <span className="text-slate-600">{item.practitioner}</span></p>
        <p className="sm:col-span-2"><strong className="text-ink">{label("Observations", "الملاحظات")} :</strong> <span className="text-slate-500">{item.notes || label("À compléter par le praticien", "يستكملها الممارس")}</span></p>
      </div>
      <div className="mt-3 flex gap-4 text-xs font-semibold text-accent">
        <Link href={patientHref} className="inline-flex items-center gap-1 hover:underline"><Icon name="eye" size={13} /> {label("Ouvrir la fiche", "فتح الملف")}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 hover:underline"><Icon name="print" size={13} /> {label("Imprimer", "طباعة")}</button>
      </div>
    </div>
  </article>;
}

function Metric({ icon, label, value }: { icon: string; label: string; value: number }) {
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex items-start justify-between"><span className="text-xs text-slate-500">{label}</span><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p></div>;
}
