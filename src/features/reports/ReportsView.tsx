"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

type Patient = { id: number; createdAt?: string };
type Appointment = { date: string; status: string; type?: string };
type TreasuryOperation = { date: string; amount: number; kind: "receipt" | "expense" };
type Treatment = { id: number; treatment: string; status?: string; plannedDate?: string };
type ReceivablesData = { totalReceivable: number | string; debtorCount?: number; activePatientCount?: number };

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
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [operations, setOperations] = useState<TreasuryOperation[]>(fallbackOperations);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [receivables, setReceivables] = useState<ReceivablesData>({ totalReceivable: 0 });
  const [loading, setLoading] = useState(true);

  // Liste des mois disponibles (6 mois avant et 3 mois après)
  const availableMonths = useMemo(() => {
    const list: Array<{ value: string; label: string }> = [];
    const base = new Date(2026, 9, 1); // Octobre 2026
    for (let offset = -6; offset <= 3; offset++) {
      const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const name = d.toLocaleDateString(locale === "ar" ? "ar-TN" : "fr-FR", { month: "long", year: "numeric" });
      list.push({ value: val, label: name.charAt(0).toUpperCase() + name.slice(1) });
    }
    return list;
  }, [locale]);

  const currentMonthLabel = useMemo(() => {
    const found = availableMonths.find((m) => m.value === selectedMonth);
    return found ? found.label : selectedMonth;
  }, [availableMonths, selectedMonth]);

  // Chargement des données réelles
  useEffect(() => {
    let active = true;
    setLoading(true);

    const [year, month] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const from = `${selectedMonth}-01`;
    const to = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

    Promise.all([
      fetch("/api/patients", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch(() => ({ data: [] })),

      fetch(`/api/appointments?from=${from}&to=${to}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch(() => ({ data: [] })),

      fetch("/api/treatments", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch(() => ({ data: [] })),

      fetch("/api/treasury", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { data: { operations: [] } }))
        .catch(() => ({ data: { operations: [] } })),

      fetch("/api/patients/receivables", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { totalReceivable: 0 }))
        .catch(() => ({ totalReceivable: 0 })),
    ])
      .then(([patientBody, appointmentBody, treatmentBody, treasuryBody, receivablesBody]) => {
        if (!active) return;
        setPatients(patientBody.data ?? []);
        setAppointments(appointmentBody.data ?? []);
        setTreatments(treatmentBody.data ?? []);
        setReceivables(receivablesBody ?? { totalReceivable: 0 });

        const treasuryOps = treasuryBody.data?.operations;
        if (Array.isArray(treasuryOps) && treasuryOps.length > 0) {
          setOperations(
            treasuryOps.map((op: { date: string; amount: number | string; kind: "receipt" | "expense" }) => ({
              date: op.date,
              amount: Number(op.amount),
              kind: op.kind,
            }))
          );
        } else {
          try {
            const saved = window.localStorage.getItem("dentaclinic-treasury-operations") ?? window.localStorage.getItem("dentaflow-treasury-operations");
            if (saved) setOperations(JSON.parse(saved) as TreasuryOperation[]);
          } catch {
            // garde fallbackOperations
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedMonth]);

  // Opérations filtrées pour le mois sélectionné
  const monthOperations = useMemo(
    () => operations.filter((op) => op.date.startsWith(selectedMonth)),
    [operations, selectedMonth]
  );

  const receipts = useMemo(
    () => monthOperations.filter((op) => op.kind === "receipt").reduce((sum, op) => sum + Number(op.amount), 0),
    [monthOperations]
  );
  const expenses = useMemo(
    () => monthOperations.filter((op) => op.kind === "expense").reduce((sum, op) => sum + Number(op.amount), 0),
    [monthOperations]
  );

  // Rendez-vous
  const attended = appointments.filter((appointment) => !["CANCELLED", "NO_SHOW"].includes(appointment.status)).length;
  const cancelled = appointments.filter((appointment) => ["CANCELLED", "NO_SHOW"].includes(appointment.status)).length;
  const cancellationRate = appointments.length ? Math.round((cancelled / appointments.length) * 100) : 0;
  const noShowRate = appointments.length ? Math.round((appointments.filter((a) => a.status === "NO_SHOW").length / appointments.length) * 100) : 0;

  // Répartition par jour du mois (Encaissements & Dépenses)
  const daysInMonth = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [selectedMonth]);

  const dailyStats = useMemo(() => {
    return Array.from({ length: Math.min(daysInMonth, 31) }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const dateStr = `${selectedMonth}-${day}`;
      const dayReceipts = monthOperations
        .filter((op) => op.date === dateStr && op.kind === "receipt")
        .reduce((sum, op) => sum + Number(op.amount), 0);
      const dayExpenses = monthOperations
        .filter((op) => op.date === dateStr && op.kind === "expense")
        .reduce((sum, op) => sum + Number(op.amount), 0);
      return { day: index + 1, receipts: dayReceipts, expenses: dayExpenses };
    });
  }, [monthOperations, selectedMonth, daysInMonth]);

  const maxRevenue = useMemo(() => {
    const maxR = Math.max(...dailyStats.map((d) => d.receipts), 0);
    const maxE = Math.max(...dailyStats.map((d) => d.expenses), 0);
    return Math.max(maxR, maxE, 1);
  }, [dailyStats]);

  // Activité des rendez-vous par jour de la semaine (Lun à Dim)
  const weekActivity = useMemo(() => {
    return ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day, index) => ({
      day,
      value: appointments.filter((appointment) => {
        const appointmentDate = new Date(`${appointment.date}T00:00:00`);
        const dayIndex = appointmentDate.getDay(); // 0 = Dim, 1 = Lun, ...
        return dayIndex === (index + 1) % 7;
      }).length,
    }));
  }, [appointments]);

  const maxActivity = Math.max(...weekActivity.map((item) => item.value), 1);

  // Traitements les plus réalisés (100% dynamique depuis la table patient_treatments)
  const topTreatments = useMemo(() => {
    // Si des traitements sont planifiés/réalisés sur ce mois, on privilégie ceux-ci, sinon tous les traitements
    const scopedTreatments = treatments.filter((t) => t.plannedDate?.startsWith(selectedMonth));
    const listToCount = scopedTreatments.length > 0 ? scopedTreatments : treatments;

    const countMap: Record<string, number> = {};
    for (const item of listToCount) {
      const name = item.treatment?.trim();
      if (name) {
        countMap[name] = (countMap[name] || 0) + 1;
      }
    }

    return Object.entries(countMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [treatments, selectedMonth]);

  const totalTreatmentsCount = useMemo(() => {
    const scoped = treatments.filter((t) => t.plannedDate?.startsWith(selectedMonth));
    return scoped.length > 0 ? scoped.length : treatments.length;
  }, [treatments, selectedMonth]);

  function exportCsv() {
    const rows = [
      ["Indicateur", "Valeur"],
      ["Période sélectionnée", selectedMonth],
      ["CA mensuel", String(receipts)],
      ["Dépenses", String(expenses)],
      ["Bénéfice estimé", String(receipts - expenses)],
      ["Créances patients", String(receivables.totalReceivable)],
      ["Patients actifs", String(patients.length)],
      ["Rendez-vous tenus", String(attended)],
      ["Rendez-vous annulés", String(cancelled)],
      ["Taux d'annulation", `${cancellationRate}%`],
      ...topTreatments.map((item) => [`Traitement : ${item.name}`, String(item.value)]),
    ];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rapport-${selectedMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Rapports", "التقارير")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {label(`Indicateurs d'activité du cabinet · ${currentMonthLabel}.`, `مؤشرات نشاط العيادة · ${currentMonthLabel}.`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sélecteur de mois dynamique */}
          <label className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            <Icon name="calendar" size={14} className="text-accent" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-semibold text-ink outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => window.print()}>
            <Icon name="print" size={14} /> {label("Imprimer le rapport", "طباعة التقرير")}
          </Button>
          <Button variant="primary" onClick={exportCsv}>
            <Icon name="download" size={14} /> {label("Exporter CSV", "تصدير CSV")}
          </Button>
        </div>
      </header>

      {/* Cartes KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon="wallet"
          label={label("CA mensuel", "الدخل الشهري")}
          value={formatMoney(receipts)}
          detail={label(`Encaissements en ${currentMonthLabel}`, `المداخيل في ${currentMonthLabel}`)}
          tone="green"
        />
        <Metric
          icon="chart"
          label={label("Bénéfice estimé", "الربح التقديري")}
          value={formatMoney(receipts - expenses)}
          detail={label("Recettes moins dépenses", "المداخيل ناقص المصاريف")}
          tone="violet"
        />
        <Metric
          icon="patients"
          label={label("Patients actifs", "المرضى النشطون")}
          value={loading ? "…" : patients.length}
          detail={label("Dossiers dans le cabinet", "ملفات العيادة")}
          tone="violet"
        />
        <Metric
          icon="calendar"
          label={label("Taux d’annulation", "معدل الإلغاء")}
          value={`${cancellationRate}%`}
          detail={`${cancelled} ${label(cancelled > 1 ? "rendez-vous annulés" : "rendez-vous annulé", "مواعيد ملغاة")}`}
          tone="amber"
        />
      </div>

      {/* Graphique Encaissements & Dépenses + Indicateurs cliniques */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-ink">{label("Encaissements et dépenses", "المداخيل والمصاريف")}</h2>
              <p className="mt-1 text-xs text-slate-400">{label("Activité financière · DT", "النشاط المالي · دينار")}</p>
            </div>
            <span className="rounded-lg border border-line bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              {currentMonthLabel}
            </span>
          </div>

          <div className="mt-8 flex h-48 items-end gap-1 sm:gap-2 border-b border-dashed border-slate-200 pb-1 overflow-x-auto">
            {dailyStats.map((item) => (
              <div
                key={item.day}
                className="flex flex-1 min-w-[8px] items-end justify-center gap-0.5 group relative"
                title={`${item.day} ${currentMonthLabel} : +${formatMoney(item.receipts)} / -${formatMoney(item.expenses)}`}
              >
                <span
                  className="w-1.5 sm:w-2 rounded-t bg-emerald-500 transition-all group-hover:bg-emerald-600"
                  style={{ height: `${Math.max(4, (item.receipts / maxRevenue) * 100)}%` }}
                />
                <span
                  className="w-1.5 sm:w-2 rounded-t bg-orange-400 transition-all group-hover:bg-orange-500"
                  style={{ height: `${Math.max(item.expenses > 0 ? 4 : 0, (item.expenses / maxRevenue) * 100)}%` }}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {label("Encaissements", "المداخيل")} ({formatMoney(receipts)})
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
                {label("Dépenses", "المصاريف")} ({formatMoney(expenses)})
              </span>
            </div>
            <span className="hidden sm:inline text-slate-400 text-[10px]">
              {label("Survolez les barres pour le détail journalier", "مرر الفأرة لرؤية تفاصيل الأيام")}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="font-bold text-ink">{label("Indicateurs cliniques", "المؤشرات السريرية")}</h2>
          <p className="mt-1 text-xs text-slate-400">{label(`Suivi de ${currentMonthLabel}`, `متابعة ${currentMonthLabel}`)}</p>
          <div className="mt-5 divide-y divide-line">
            {[
              [label("Nouveaux patients", "مرضى جدد"), patients.length],
              [label("Patients actifs", "المرضى النشطون"), patients.length],
              [label("Rendez-vous tenus", "المواعيد المنجزة"), attended],
              [label("Taux d’absence", "معدل الغياب"), `${noShowRate}%`],
              [label("Créances patients", "ديون المرضى"), formatMoney(Number(receivables.totalReceivable))],
              [label("Dépenses du mois", "مصاريف الشهر"), formatMoney(expenses)],
              [label("Bénéfice estimé", "الربح التقديري"), formatMoney(receipts - expenses)],
            ].map(([name, value]) => (
              <div key={String(name)} className="flex justify-between py-2.5 text-xs">
                <span className="text-slate-500">{name}</span>
                <strong className="text-ink">{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Activité des RDV + Traitements les plus réalisés (DYNAMIQUE) */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="font-bold text-ink">{label("Activité des rendez-vous", "نشاط المواعيد")}</h2>
          <p className="mt-1 text-xs text-slate-400">
            {label("Volume par jour de la semaine", "الحجم حسب أيام الأسبوع")} · {appointments.length} {label("RDV au total", "موعد إجمالاً")}
          </p>
          <div className="mt-6 flex h-40 items-end justify-around gap-2 sm:gap-4">
            {weekActivity.map((item) => (
              <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div
                  className={`w-full max-w-8 rounded-t-md transition-all ${
                    item.value > 0 ? "bg-accent hover:brightness-110" : "bg-blue-100"
                  }`}
                  style={{ height: `${Math.max(6, (item.value / maxActivity) * 100)}%` }}
                  title={`${item.day} : ${item.value} RDV`}
                />
                <span className="text-[11px] font-medium text-slate-500">{item.day}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Traitements les plus réalisés : 100% réel depuis patient_treatments */}
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-ink">{label("Traitements les plus réalisés", "العلاجات الأكثر إنجازا")}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {totalTreatmentsCount > 0
                  ? label(`${totalTreatmentsCount} acte(s) comptabilisé(s)`, `${totalTreatmentsCount} علاج مسجل`)
                  : label("Actes enregistrés dans les dossiers", "العلاجات المسجلة في الملفات")}
              </p>
            </div>
            {topTreatments.length > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {label("Données réelles", "بيانات فعلية")}
              </span>
            )}
          </div>

          {topTreatments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-accent">
                <Icon name="tooth" size={20} />
              </span>
              <p className="text-xs font-semibold text-slate-700">
                {label("Aucun acte médical enregistré", "لا توجد علاجات مسجلة")}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 max-w-xs">
                {label(
                  "Saisissez des actes depuis les dossiers patients ou le menu Traitements pour voir vos statistiques réelles.",
                  "أدخل العلاجات من ملفات المرضى أو قائمة العلاجات لرؤية إحصائياتك الفعلية."
                )}
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {topTreatments.map((item) => {
                const percentage = Math.round((item.value / topTreatments[0].value) * 100);
                return (
                  <div key={item.name}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink">{item.name}</span>
                      <strong className="text-accent font-bold">
                        {item.value} {label(item.value > 1 ? "actes" : "acte", "علاج")}
                      </strong>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: string;
  label: string;
  value: string | number;
  detail: string;
  tone: "green" | "violet" | "amber";
}) {
  const colors = {
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`rounded-lg p-2 ${colors[tone]}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
    </div>
  );
}
