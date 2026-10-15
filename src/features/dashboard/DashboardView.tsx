"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { fetchAppointments } from "@/features/agenda/api";
import type { Appointment } from "@/features/agenda/types";
import type { Practitioner } from "@/features/agenda/types";
import type { PatientListItem } from "@/features/patients/types";

function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: value(start), to: value(end) };
}

export function DashboardView({ userName, role }: { userName: string; role: string }) {
  const { t, locale } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = todayValue();
  const range = monthRange();

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAppointments(range.from, range.to),
      fetch("/api/patients", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement impossible.");
        return body.data as PatientListItem[];
      }),
      fetch("/api/practitioners", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement des praticiens impossible.");
        return body.data as Practitioner[];
      }),
    ]).then(([todayAppointments, patientRows, practitionerRows]) => {
      if (!active) return;
      setAppointments(todayAppointments);
      setPatients(patientRows);
      setPractitioners(practitionerRows);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [range.from, range.to]);

  const todayAppointments = appointments.filter((item) => item.date === today);
  const pending = todayAppointments.filter((item) => ["PENDING", "PLANNED", "CONFIRMED"].includes(item.status));
  const completed = todayAppointments.filter((item) => item.status === "COMPLETED").length;
  const cancelled = todayAppointments.filter((item) => item.status === "CANCELLED" || item.status === "NO_SHOW").length;
  const practitionerStats = practitioners.map((practitioner) => {
    const doctorAppointments = todayAppointments.filter((appointment) => appointment.dentistId === practitioner.id);
    const waiting = doctorAppointments.filter((appointment) => ["PENDING", "PLANNED", "CONFIRMED", "ARRIVED"].includes(appointment.status));
    const inProgress = doctorAppointments.filter((appointment) => appointment.status === "IN_CONSULTATION");
    const completedForDoctor = doctorAppointments.filter((appointment) => appointment.status === "COMPLETED");
    const cancelledForDoctor = doctorAppointments.filter((appointment) => appointment.status === "CANCELLED" || appointment.status === "NO_SHOW");
    return {
      practitioner,
      appointments: doctorAppointments,
      waiting,
      inProgress,
      completed: completedForDoctor,
      cancelled: cancelledForDoctor,
      patientCount: new Set(doctorAppointments.map((appointment) => appointment.patientId)).size,
    };
  });
  const receivables = patients.reduce((sum, patient) => sum + Math.max(Number(patient.balance) || 0, 0), 0);
  const monthlyTrend = useMemo(() => {
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    return Array.from({ length: 12 }, (_, index) => {
      const from = Math.floor((index * days) / 12) + 1;
      const to = Math.floor(((index + 1) * days) / 12);
      return appointments.filter((item) => {
        const day = Number(item.date.slice(8, 10));
        return day >= from && day <= to;
      }).length;
    });
  }, [appointments]);
  const maxTrend = Math.max(...monthlyTrend);
  const dateLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium capitalize text-slate-400">{dateLabel}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{locale === "ar" ? `مرحباً، ${userName}` : `Bonjour, ${userName}`}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

      {role === "ADMIN" && (
        <section className="rounded-2xl border border-accent/20 bg-gradient-to-r from-violet-50 to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-ink">{locale === "ar" ? "إدارة العيادة" : "Administration du cabinet"}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {locale === "ar" ? "إدارة الأطباء والسكرتير والإعدادات ومؤشرات العيادة." : "Gérez les médecins, les secrétaires, les paramètres et les indicateurs du cabinet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/team" className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:brightness-105">
                {locale === "ar" ? "الفريق والصلاحيات" : "Médecins & secrétaires"}
              </Link>
              <Link href="/settings" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-accent hover:text-accent">
                {locale === "ar" ? "إعدادات العيادة" : "Paramètres du cabinet"}
              </Link>
              <Link href="/reports" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-accent hover:text-accent">
                {locale === "ar" ? "التقارير والرسوم" : "Rapports & graphiques"}
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="calendar" label={locale === "ar" ? "مواعيد اليوم" : "Rendez-vous aujourd'hui"} value={loading ? "—" : String(todayAppointments.length)} detail={`${completed} ${locale === "ar" ? "مكتمل" : "terminé(s)"}`} tone="violet" />
        <Metric icon="patients" label={locale === "ar" ? "المرضى المنتظرون" : "Patients attendus"} value={loading ? "—" : String(pending.length)} detail={pending[0] ? `${pending[0].time} · ${pending[0].patientName}` : t("common.none")} tone="green" />
        <Metric icon="creditCard" label={locale === "ar" ? "المرضى المسجلون" : "Patients enregistrés"} value={loading ? "—" : String(patients.length)} detail={locale === "ar" ? "ملفات نشطة" : "dossiers actifs"} tone="amber" />
        <Metric icon="file" label={locale === "ar" ? "المبالغ المستحقة" : "Créances patients"} value={loading ? "—" : formatMoney(receivables)} detail={`${patients.filter((patient) => Number(patient.balance) > 0).length} ${locale === "ar" ? "مرضى معنيون" : "patients concernés"}`} tone="rose" />
      </div>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-ink">{locale === "ar" ? "لوحة الأطباء" : "Suivi par médecin"}</h2>
            <p className="mt-1 text-xs text-slate-400">{locale === "ar" ? "مواعيد اليوم وحالة المرضى لكل طبيب" : "Rendez-vous du jour et état des patients pour chaque praticien"}</p>
          </div>
          <Link href="/agenda" className="text-xs font-semibold text-accent">{locale === "ar" ? "فتح الأجندة" : "Ouvrir l’agenda"} ›</Link>
        </div>
        {loading ? <p className="mt-5 text-sm text-slate-400">{t("common.loading")}</p> : practitionerStats.length === 0 ? <p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">{locale === "ar" ? "لا يوجد طبيب مسجل." : "Aucun médecin enregistré."}</p> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{practitionerStats.map((stats) => <article key={stats.practitioner.id} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-ink">{stats.practitioner.name}</h3><p className="text-[11px] text-slate-400">{stats.practitioner.role}</p></div><span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent">{stats.appointments.length} {locale === "ar" ? "موعد" : "RDV"}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><DoctorMetric label={locale === "ar" ? "قيد الانتظار" : "En attente"} value={stats.waiting.length} tone="amber" /><DoctorMetric label={locale === "ar" ? "قيد المعالجة" : "En cours"} value={stats.inProgress.length} tone="violet" /><DoctorMetric label={locale === "ar" ? "المرضى" : "Patients"} value={stats.patientCount} tone="green" /><DoctorMetric label={locale === "ar" ? "استشارات" : "Consultations"} value={stats.completed.length} tone="blue" /><DoctorMetric label={locale === "ar" ? "ملغاة" : "Annulées"} value={stats.cancelled.length} tone="rose" /></div>{stats.waiting.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{locale === "ar" ? "المرضى المنتظرون" : "Patients en attente"}</p><div className="flex flex-wrap gap-2">{stats.waiting.slice(0, 5).map((appointment) => <span key={appointment.id} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-700">{appointment.time} · {appointment.patientName}</span>)}</div>{stats.waiting.length > 5 && <p className="mt-2 text-[10px] text-slate-400">+{stats.waiting.length - 5} {locale === "ar" ? "آخرون" : "autre(s)"}</p>}</div>}</article>)}</div>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-[0_12px_28px_rgba(108,92,231,0.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <div className="flex items-start justify-between">
            <div><h2 className="font-bold text-ink">{locale === "ar" ? "نشاط العيادة" : "Activité du cabinet"}</h2><p className="mt-1 text-xs text-slate-400">{locale === "ar" ? "نظرة عامة على المواعيد" : "Évolution des rendez-vous"}</p></div>
            <span className="rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent">{locale === "ar" ? "هذا الشهر" : "Ce mois"}</span>
          </div>
          <div className="mt-6 flex h-52 items-end gap-2 border-b border-line px-2">
            {monthlyTrend.map((value, index) => <div key={index} className="group flex flex-1 flex-col items-center justify-end gap-2"><span className="hidden text-[10px] text-slate-400 group-hover:block">{value}</span><div className="w-full max-w-8 rounded-t-md bg-accent/75 transition hover:bg-accent" style={{ height: `${(value / maxTrend) * 100}%` }} /></div>)}
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>{locale === "ar" ? "بداية الشهر" : "Début du mois"}</span><span>{locale === "ar" ? "نهاية الشهر" : "Fin du mois"}</span></div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-[0_12px_28px_rgba(108,92,231,0.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <div className="flex items-center justify-between"><div><h2 className="font-bold text-ink">{locale === "ar" ? "مواعيد اليوم" : "Arrivées du jour"}</h2><p className="mt-1 text-xs text-slate-400">{formatDate(today, undefined, locale)}</p></div><Link href="/agenda" className="text-xs font-semibold text-accent">{locale === "ar" ? "عرض الكل" : "Tout afficher"} ›</Link></div>
          <div className="mt-5 space-y-3">
            {loading ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : todayAppointments.slice(0, 4).map((appointment) => <div key={appointment.id} className="flex items-center gap-3 border-b border-line pb-3 last:border-0"><span className="w-11 text-xs font-semibold text-slate-500">{appointment.time}</span><span className="h-8 w-1 rounded-full bg-accent" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{appointment.patientName}</p><p className="truncate text-[11px] text-slate-400">{appointment.type} · {appointment.dentistName}</p></div><span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-500">{appointment.chairId}</span></div>)}
            {!loading && todayAppointments.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{locale === "ar" ? "لا توجد مواعيد اليوم" : "Aucun rendez-vous aujourd'hui"}</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-[0_12px_28px_rgba(108,92,231,0.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <div className="flex items-center justify-between"><div><h2 className="font-bold text-ink">{locale === "ar" ? "ملخص اليوم" : "Résumé de la journée"}</h2><p className="mt-1 text-xs text-slate-400">{locale === "ar" ? "حالة مواعيد العيادة" : "État des rendez-vous du cabinet"}</p></div><Icon name="activity" size={18} className="text-accent" /></div>
          <div className="mt-5 grid grid-cols-3 gap-3"><Summary label={locale === "ar" ? "مكتملة" : "Terminés"} value={completed} color="green" /><Summary label={locale === "ar" ? "ملغاة" : "Annulés"} value={cancelled} color="rose" /><Summary label={locale === "ar" ? "قيد الانتظار" : "En attente"} value={pending.length} color="amber" /></div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-[0_12px_28px_rgba(108,92,231,0.10)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
          <div className="flex items-center justify-between"><h2 className="font-bold text-ink">{locale === "ar" ? "تنبيهات" : "À surveiller"}</h2><Icon name="bell" size={18} className="text-amber-500" /></div>
          <div className="mt-4 space-y-3 text-sm"><Alert icon="creditCard" text={`${patients.filter((patient) => Number(patient.balance) > 0).length} ${locale === "ar" ? "ملفات بها رصيد مستحق" : "patients avec un solde"}`} /><Alert icon="clock" text={`${pending.length} ${locale === "ar" ? "مواعيد قادمة" : "rendez-vous à venir"}`} /><Alert icon="check" text={`${completed} ${locale === "ar" ? "مواعيد مكتملة اليوم" : "rendez-vous terminés aujourd'hui"}`} /></div>
        </section>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: string; detail: string; tone: "violet" | "green" | "amber" | "rose" }) {
  const toneClass = {
    violet: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  }[tone];
  return <div className="group rounded-2xl border border-line bg-white p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:border-accent/30 hover:shadow-[0_12px_28px_rgba(108,92,231,0.14)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 transition-colors group-hover:text-accent">{label}</p><span className={`rounded-lg p-2 transition duration-200 group-hover:scale-110 ${toneClass} motion-reduce:transition-none motion-reduce:group-hover:scale-100`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 truncate text-[11px] text-slate-400">{detail}</p></div>;
}

function DoctorMetric({ label, value, tone }: { label: string; value: number; tone: "amber" | "violet" | "green" | "blue" | "rose" }) {
  const styles = {
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return <div className={`rounded-lg px-2 py-2 text-center ${styles[tone]}`}><p className="text-lg font-bold">{value}</p><p className="mt-0.5 text-[9px] font-medium leading-tight">{label}</p></div>;
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClass = color === "green" ? "text-emerald-600" : color === "rose" ? "text-rose-600" : "text-amber-600";
  return <div className="rounded-xl bg-slate-50 p-4 transition duration-200 hover:bg-white hover:shadow-sm motion-reduce:transition-none"><p className="text-2xl font-bold text-ink">{value}</p><p className={`mt-1 text-xs ${colorClass}`}>{label}</p></div>;
}

function Alert({ icon, text }: { icon: string; text: string }) {
  return <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 transition duration-200 hover:bg-accent/5 hover:shadow-sm motion-reduce:transition-none"><Icon name={icon} size={15} className="text-accent" /><span className="text-xs text-slate-600">{text}</span></div>;
}
