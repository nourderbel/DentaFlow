"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import type { Appointment } from "@/features/agenda/types";

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateValue(date);
}

function Panel({ title, subtitle, icon, children, action }: {
  title: string;
  subtitle?: string;
  icon: string;
  children: ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><Icon name={icon} size={16} /></span>
          <div className="min-w-0"><h2 className="truncate text-sm font-bold text-ink">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}</div>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AppointmentList({ appointments, loading, empty }: { appointments: Appointment[]; loading: boolean; empty: string }) {
  const { t } = useI18n();
  if (loading) return <p className="py-5 text-center text-sm text-slate-400">{t("common.loading")}</p>;
  if (appointments.length === 0) return <p className="py-5 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <div className="space-y-2">
      {appointments.map((appointment) => (
        <Link key={appointment.id} href="/agenda" className="flex items-center gap-3 rounded-xl border border-line/70 bg-slate-50/60 p-3 transition hover:border-accent/30 hover:bg-accent/5">
          <span className="min-w-12 rounded-lg bg-accent/10 px-2 py-1.5 text-center text-xs font-bold text-accent">{appointment.time}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{appointment.patientName}</p>
            <p className="truncate text-xs text-slate-400">{appointment.type} · {appointment.dentistName}</p>
          </div>
          <span className="hidden rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-500 sm:inline">{appointment.chairId}</span>
          <Icon name="chevronRight" size={15} className="shrink-0 text-slate-400" />
        </Link>
      ))}
    </div>
  );
}

type ReceivablePatient = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  balance: string | number;
};

type ReceivablesSummary = {
  data: ReceivablePatient[];
  totalReceivable: string | number;
  debtorCount: number;
};

export function HomeView({ userName }: { userName: string }) {
  const { locale, t } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [receivables, setReceivables] = useState<ReceivablesSummary>({
    data: [],
    totalReceivable: 0,
    debtorCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = dateValue(new Date());
  const tomorrow = dateOffset(1);
  const lookback = dateOffset(-7);
  const welcomeDate = useMemo(() => new Intl.DateTimeFormat(
    locale === "ar" ? "ar-TN" : "fr-FR",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  ).format(new Date()), [locale]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/appointments?from=${lookback}&to=${tomorrow}`, { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement des rendez-vous impossible.");
        return body.data as Appointment[];
      }),
      fetch("/api/patients/receivables", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement des créances impossible.");
        return body as ReceivablesSummary;
      }),
    ]).then(([appointmentRows, receivableSummary]) => {
      if (!active) return;
      setAppointments(appointmentRows);
      setReceivables(receivableSummary);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Chargement de l’accueil impossible.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [lookback, tomorrow]);

  const todayAppointments = appointments.filter((item) => item.date.slice(0, 10) === today);
  const tomorrowAppointments = appointments.filter((item) => item.date.slice(0, 10) === tomorrow);
  const reminders = appointments.filter((item) => item.status === "NO_SHOW" && item.date.slice(0, 10) < today);
  const debtors = receivables.data;
  const debtorCount = receivables.debtorCount;
  const totalReceivable = Number(receivables.totalReceivable) || 0;
  const statusLabel: Record<Appointment["status"], string> = {
    PENDING: "À confirmer",
    CONFIRMED: "Confirmé",
    ARRIVED: "Arrivé",
    IN_CONSULTATION: "En consultation",
    COMPLETED: "Terminé",
    CANCELLED: "Annulé",
    NO_SHOW: "Absent",
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-accent/15 bg-gradient-to-br from-white via-violet-50/70 to-sky-50/70 p-5 shadow-sm md:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-xs font-medium capitalize text-slate-400">{welcomeDate}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink md:text-3xl">
              {locale === "ar" ? `مرحباً، ${userName}` : `Bienvenue, ${userName}`}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              {locale === "ar" ? "نظرة سريعة على نشاط عيادتك ومواعيدك." : "Retrouvez en un coup d’œil les rendez-vous et les éléments à suivre au cabinet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/agenda" className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2.5 text-sm font-semibold text-white transition hover:brightness-105">
              <Icon name="plus" size={16} /> {locale === "ar" ? "موعد جديد" : "Nouveau rendez-vous"}
            </Link>
            <Link href="/patients" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-accent hover:text-accent">
              <Icon name="userPlus" size={16} /> {locale === "ar" ? "المرضى" : "Patients"}
            </Link>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon="calendar" label={locale === "ar" ? "مواعيد اليوم" : "Rendez-vous aujourd’hui"} value={loading ? "—" : String(todayAppointments.length)} detail={`${formatDate(today, undefined, locale)}`} tone="violet" />
        <SummaryCard icon="calendarClock" label={locale === "ar" ? "مواعيد الغد" : "Rendez-vous demain"} value={loading ? "—" : String(tomorrowAppointments.length)} detail={formatDate(tomorrow, undefined, locale)} tone="blue" />
        <SummaryCard icon="creditCard" label={locale === "ar" ? "المبالغ المستحقة" : "Créances patients"} value={loading ? "—" : formatMoney(totalReceivable)} detail={`${debtorCount} ${locale === "ar" ? "ملف عليه مستحقات" : "patient(s) avec une créance"}`} tone="amber" />
        <SummaryCard icon="bell" label={locale === "ar" ? "تذكيرات" : "Rappels à traiter"} value={loading ? "—" : String(reminders.length)} detail={locale === "ar" ? "مواعيد فائتة خلال 7 أيام" : "rendez-vous manqués sur 7 jours"} tone="rose" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(290px,0.85fr)]">
        <Panel title="Rendez-vous d’aujourd’hui" subtitle={formatDate(today, undefined, locale)} icon="calendar" action={<Link href="/agenda" className="text-xs font-semibold text-accent">Agenda <Icon name="arrowRight" size={13} className="ml-1 inline" /></Link>}>
          <AppointmentList appointments={todayAppointments} loading={loading} empty="Aucun rendez-vous prévu aujourd’hui." />
        </Panel>
        <Panel title="Rendez-vous de demain" subtitle={formatDate(tomorrow, undefined, locale)} icon="calendarClock" action={<Link href="/agenda" className="text-xs font-semibold text-accent">Agenda <Icon name="arrowRight" size={13} className="ml-1 inline" /></Link>}>
          <AppointmentList appointments={tomorrowAppointments} loading={loading} empty="Aucun rendez-vous prévu demain." />
        </Panel>
        <div className="space-y-5">
          <Panel title="Créances à suivre" subtitle={`Total : ${loading ? "…" : formatMoney(totalReceivable)}`} icon="wallet" action={<Link href="/patients" className="text-xs font-semibold text-accent">Patients</Link>}>
            {loading ? <p className="py-4 text-center text-sm text-slate-400">{t("common.loading")}</p> : debtors.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">Aucune créance patient enregistrée.</p> : (
              <div className="space-y-2">
                {debtors.map((patient) => (
                  <Link key={patient.id} href={`/patients/${patient.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-amber-50/70">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{patient.firstName} {patient.lastName}</span><span className="block text-[11px] text-slate-400">{patient.patientNumber}</span></span>
                    <span className="shrink-0 text-xs font-bold text-amber-700">{formatMoney(Number(patient.balance) || 0)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Rappels" subtitle="Rendez-vous manqués à recontacter" icon="bell" action={<Link href="/agenda" className="text-xs font-semibold text-accent">Voir agenda</Link>}>
            {loading ? <p className="py-4 text-center text-sm text-slate-400">{t("common.loading")}</p> : reminders.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">Aucun rendez-vous manqué à rappeler.</p> : (
              <div className="space-y-2">
                {reminders.slice(0, 5).map((appointment) => (
                  <Link key={appointment.id} href="/agenda" className="flex items-center justify-between gap-2 rounded-lg bg-rose-50/70 px-3 py-2">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{appointment.patientName}</span><span className="block text-[11px] text-slate-400">{formatDate(appointment.date, undefined, locale)} · {appointment.dentistName}</span></span>
                    <span className="shrink-0 text-[10px] font-semibold text-rose-700">{statusLabel[appointment.status]}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-ink">Accès rapides</h2><p className="mt-1 text-xs text-slate-400">Les espaces principaux du cabinet</p></div>
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/agenda" icon="calendar" label="Agenda" />
            <QuickLink href="/patients" icon="patients" label="Patients" />
            <QuickLink href="/treatments" icon="activity" label="Traitements" />
            <QuickLink href="/treasury" icon="wallet" label="Trésorerie" />
            <QuickLink href="/laboratory" icon="flask" label="Laboratoire" />
            <QuickLink href="/stock" icon="package" label="Stock" />
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ icon, label, value, detail, tone }: { icon: string; label: string; value: string; detail: string; tone: "violet" | "blue" | "amber" | "rose" }) {
  const tones = {
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon name={icon} size={17} /></span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-400">{detail}</p>
    </section>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return <Link href={href} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-accent/40 hover:bg-accent/5 hover:text-accent"><Icon name={icon} size={14} />{label}</Link>;
}
