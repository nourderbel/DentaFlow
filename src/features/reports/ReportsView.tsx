"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

type Patient = { id: number; createdAt?: string };
type Appointment = { date: string; status: string; type?: string };
type TreasuryOperation = { date: string; amount: number; kind: "receipt" | "expense" };

const fallbackOperations: TreasuryOperation[] = [
  { date: "2026-10-08", amount: 25, kind: "receipt" },
  { date: "2026-10-08", amount: 150, kind: "receipt" },
  { date: "2026-10-08", amount: 500, kind: "receipt" },
  { date: "2026-10-08", amount: 320, kind: "expense" },
  { date: "2026-10-07", amount: 300, kind: "receipt" },
  { date: "2026-10-07", amount: 250, kind: "receipt" },
  { date: "2026-10-06", amount: 185, kind: "expense" },
  { date: "2026-10-06", amount: 720, kind: "receipt" },
];

export function ReportsView() {
  const { locale } = useI18n();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [operations, setOperations] = useState<TreasuryOperation[]>(fallbackOperations);
  const [loading, setLoading] = useState(true);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/patients", { cache: "no-store" }).then((response) => response.ok ? response.json() : { data: [] }),
      fetch(`/api/appointments?from=2026-10-01&to=2026-10-31`, { cache: "no-store" }).then((response) => response.ok ? response.json() : { data: [] }),
    ]).then(([patientBody, appointmentBody]) => {
      if (!active) return;
      setPatients(patientBody.data ?? []);
      setAppointments(appointmentBody.data ?? []);
      try {
        const saved = window.localStorage.getItem("dentaflow-treasury-operations");
        if (saved) setOperations(JSON.parse(saved) as TreasuryOperation[]);
      } catch {
        // Les données de démonstration restent disponibles si le stockage local est invalide.
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const receipts = operations.filter((operation) => operation.kind === "receipt").reduce((sum, operation) => sum + Number(operation.amount), 0);
  const expenses = operations.filter((operation) => operation.kind === "expense").reduce((sum, operation) => sum + Number(operation.amount), 0);
  const attended = appointments.filter((appointment) => !["CANCELLED", "NO_SHOW"].includes(appointment.status)).length;
  const cancelled = appointments.filter((appointment) => ["CANCELLED", "NO_SHOW"].includes(appointment.status)).length;
  const cancellationRate = appointments.length ? Math.round((cancelled / appointments.length) * 100) : 0;
  const dailyRevenue = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return operations.filter((operation) => operation.date.slice(8, 10) === day && operation.kind === "receipt").reduce((sum, operation) => sum + Number(operation.amount), 0);
  }), [operations]);
  const maxRevenue = Math.max(...dailyRevenue, 1);
  const weekActivity = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day, index) => ({ day, value: appointments.filter((appointment) => new Date(appointment.date).getDay() === (index + 1) % 7).length }));
  const maxActivity = Math.max(...weekActivity.map((item) => item.value), 1);
  const treatments = ["Détartrage", "Obturation", "Consultation", "Couronne"].map((name, index) => ({ name, value: Math.max(0, attended - index * 2) }));

  function exportCsv() {
    const rows = [["Indicateur", "Valeur"], ["CA journalier", String(dailyRevenue.reduce((sum, value) => sum + value, 0))], ["CA mensuel", String(receipts)], ["Dépenses", String(expenses)], ["Patients actifs", String(patients.length)], ["Rendez-vous tenus", String(attended)]];
    const content = rows.map((row) => row.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "rapport.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Rapports", "التقارير")}</h1><p className="mt-1 text-sm text-slate-500">{label("Indicateurs d’activité du cabinet · période de démonstration : octobre 2026.", "مؤشرات نشاط العيادة · فترة العرض: أكتوبر 2026.")}</p></div><div className="flex gap-2"><Button onClick={() => window.print()}><Icon name="print" size={14} /> {label("Imprimer le rapport", "طباعة التقرير")}</Button><Button variant="primary" onClick={exportCsv}><Icon name="download" size={14} /> {label("Exporter CSV", "تصدير CSV")}</Button></div></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon="wallet" label={label("CA journalier", "الدخل اليومي")} value={formatMoney(dailyRevenue.reduce((sum, value) => sum + value, 0))} detail="↑ 18% · Encaissements du jour" tone="green" /><Metric icon="chart" label={label("CA mensuel", "الدخل الشهري")} value={formatMoney(receipts)} detail="↑ 12% · Octobre 2026" tone="violet" /><Metric icon="patients" label={label("Patients actifs", "المرضى النشطون")} value={loading ? "…" : patients.length} detail={label("Dossiers dans le cabinet", "ملفات العيادة")} tone="violet" /><Metric icon="calendar" label={label("Taux d’annulation", "معدل الإلغاء")} value={`${cancellationRate}%`} detail={`${cancelled} ${label("rendez-vous non annulés", "مواعيد ملغاة")}`} tone="amber" /></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]"><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="font-bold text-ink">{label("Encaissements et dépenses", "المداخيل والمصاريف")}</h2><p className="mt-1 text-xs text-slate-400">{label("Activité financière · DT", "النشاط المالي · دينار")}</p></div><span className="rounded-lg border border-line px-3 py-2 text-xs text-slate-500">Octobre 2026⌄</span></div><div className="mt-8 flex h-48 items-end gap-2 border-b border-dashed border-slate-200">{dailyRevenue.map((value, index) => <div key={index} className="flex flex-1 items-end justify-center gap-0.5"><span className="w-1.5 rounded-t bg-emerald-400" style={{ height: `${Math.max(4, (value / maxRevenue) * 100)}%` }} /><span className="w-1 rounded-t bg-orange-300" style={{ height: `${Math.max(3, ((expenses / 10) / maxRevenue) * 100)}%` }} /></div>)}</div><div className="mt-3 flex gap-4 text-[10px] text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Encaissements</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-300" />Dépenses</span></div></section><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Indicateurs cliniques", "المؤشرات السريرية")}</h2><p className="mt-1 text-xs text-slate-400">{label("Suivi de la période", "متابعة الفترة")}</p><div className="mt-5">{[[label("Nouveaux patients", "مرضى جدد"), patients.length], [label("Patients actifs", "المرضى النشطون"), patients.length], [label("Rendez-vous tenus", "المواعيد المنجزة"), attended], [label("Taux d’absence", "معدل الغياب"), `${appointments.length ? Math.round((appointments.filter((a) => a.status === "NO_SHOW").length / appointments.length) * 100) : 0}%`], [label("Créances patients", "ديون المرضى"), "12 200 DT"], [label("Dépenses du mois", "مصاريف الشهر"), formatMoney(expenses)], [label("Bénéfice estimé", "الربح التقديري"), formatMoney(receipts - expenses)]].map(([name, value]) => <div key={String(name)} className="flex justify-between border-t border-line py-2.5 text-[10px]"><span className="text-slate-500">{name}</span><strong className="text-ink">{value}</strong></div>)}</div></section></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]"><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Activité des rendez-vous", "نشاط المواعيد")}</h2><p className="mt-1 text-xs text-slate-400">{label("Volume par jour de la semaine", "الحجم حسب أيام الأسبوع")}</p><div className="mt-6 flex h-40 items-end justify-around gap-4">{weekActivity.map((item) => <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className={`w-full max-w-8 rounded-t-md ${item.day === "Jeu" ? "bg-accent" : "bg-blue-100"}`} style={{ height: `${Math.max(5, (item.value / maxActivity) * 100)}%` }} /><span className="text-[10px] text-slate-400">{item.day}</span></div>)}</div></section><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Traitements les plus réalisés", "العلاجات الأكثر إنجازا")}</h2><p className="mt-1 text-xs text-slate-400">{label("Répartition indicative", "توزيع تقريبي")}</p><div className="mt-6 space-y-4">{treatments.map((item) => <div key={item.name}><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>{item.name}</span><strong>{item.value}</strong></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" style={{ width: `${Math.min(100, (item.value / Math.max(treatments[0].value, 1)) * 100)}%` }} /></div></div>)}</div></section></div>
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: string | number; detail: string; tone: "green" | "violet" | "amber" }) { const colors = { green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }
