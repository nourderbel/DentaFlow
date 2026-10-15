"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  createAppointment,
  fetchRescheduleHistory,
  fetchAppointments,
  fetchPatients,
  fetchPractitioners,
  rescheduleAppointment,
  updateAppointment,
  updateAppointmentStatus,
} from "../api";
import type { RescheduleHistoryItem } from "../api";
import type {
  Appointment,
  AppointmentFormValues,
  AppointmentStatus,
  Patient,
  Practitioner,
} from "../types";
import { useI18n } from "@/lib/i18n";

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8);
type AgendaViewMode = "day" | "week" | "month" | "list";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "En attente",
  PLANNED: "Planifié",
  CONFIRMED: "Confirmé",
  ARRIVED: "Arrivé",
  IN_CONSULTATION: "En consultation",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
  NO_SHOW: "Absent",
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);

  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function statusClass(status: AppointmentStatus) {
  switch (status) {
    case "PENDING":
      return "border border-[#dfe9ff] bg-[#edf5ff] text-[#2d5fcb]";

    case "PLANNED":
      return "border border-[#e5d9ff] bg-[#f3ecff] text-[#6d4dd8]";

    case "CONFIRMED":
      return "border border-[#d8f6e3] bg-[#ebfff2] text-[#1f8b5a]";

    case "ARRIVED":
      return "border border-[#fbe7ba] bg-[#fff9e8] text-[#a76507]";

    case "IN_CONSULTATION":
      return "border border-[#eadcff] bg-[#f6f0ff] text-[#7b5ee8]";

    case "COMPLETED":
      return "border border-[#dfe7ea] bg-[#f1f5f9] text-[#475569]";

    case "CANCELLED":
      return "border border-[#fecaca] bg-[#fff1f2] text-[#b42318]";

    case "NO_SHOW":
      return "border border-[#e5e7eb] bg-[#f3f4f6] text-[#4b5563]";

    default:
      return "border border-[#dfeaed] bg-[#edf7ff] text-[#1873ae]";
  }

}

function parseCsv(content: string): Record<string, string>[] {
  const delimiter = content.split(/\r?\n/, 1)[0]?.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  const headers = rows.shift()?.map((header) =>
    header.replace(/^\uFEFF/, "").trim(),
  ) ?? [];

  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

export default function AgendaView() {
  const { t } = useI18n();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const minDate = formatDate(new Date());

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [selectedChair, setSelectedChair] = useState("Tous les fauteuils");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: minDate, time: "09:00" });
  const [historyTarget, setHistoryTarget] = useState<Appointment | null>(null);
  const [history, setHistory] = useState<RescheduleHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [detailTarget, setDetailTarget] = useState<Appointment | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [viewMode, setViewMode] = useState<AgendaViewMode>("week");

  const [form, setForm] = useState<AppointmentFormValues>({
    patientId: "",
    dentistId: "",
    chairId: "Fauteuil 1",
    date: formatDate(new Date()),
    time: "09:00",
    durationMinutes: "30",
    type: "Consultation",
    notes: "",
  });

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const monthDates = useMemo(() => {
    const first = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    const firstGridDay = startOfWeek(first);
    const last = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
    const lastGridDay = addDays(startOfWeek(addDays(last, 1)), -1);
    const count = Math.round(
      (lastGridDay.getTime() - firstGridDay.getTime()) / 86400000,
    ) + 1;

    return Array.from({ length: count }, (_, index) => addDays(firstGridDay, index));
  }, [weekStart]);

  const activeDates = viewMode === "day"
    ? [weekStart]
    : viewMode === "month"
      ? monthDates
      : weekDates;

  const chairOptions = useMemo(() => {
    const items = new Set(["Tous les fauteuils"]);

    appointments.forEach((appointment) => {
      items.add(appointment.chairId);
    });

    return Array.from(items);
  }, [appointments]);

  const filteredAppointments = useMemo(
    () =>
      selectedChair === "Tous les fauteuils"
        ? appointments
        : appointments.filter((appointment) => appointment.chairId === selectedChair),
    [appointments, selectedChair],
  );

  const summaryDate = useMemo(() => {
    const today = formatDate(new Date());
    const activeDateStrings = activeDates.map(formatDate);

    return activeDateStrings.includes(today)
      ? today
      : formatDate(activeDates[0] ?? new Date());
  }, [activeDates]);

  const daySummaryAppointments = useMemo(
    () =>
      filteredAppointments.filter(
        (appointment) => appointment.date === summaryDate,
      ),
    [filteredAppointments, summaryDate],
  );

  const summaryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      Object.keys(STATUS_LABELS).map((status) => [status, 0]),
    ) as Record<AppointmentStatus, number>;

    for (const appointment of daySummaryAppointments) {
      counts[appointment.status] += 1;
    }

    return counts;
  }, [daySummaryAppointments]);

  const statusSummary = useMemo(
    () =>
      (Object.entries(STATUS_LABELS) as [AppointmentStatus, string][]).map(
        ([status, label]) => ({
          status,
          label,
          count: summaryCounts[status],
        }),
      ),
    [summaryCounts],
  );

  function statusDotClass(status: AppointmentStatus) {
    switch (status) {
      case "PENDING":
        return "bg-[#2d5fcb]";
      case "PLANNED":
        return "bg-[#6d4dd8]";
      case "CONFIRMED":
        return "bg-[#1f8b5a]";
      case "ARRIVED":
        return "bg-[#a76507]";
      case "IN_CONSULTATION":
        return "bg-[#7b5ee8]";
      case "COMPLETED":
        return "bg-[#475569]";
      case "CANCELLED":
        return "bg-[#b42318]";
      case "NO_SHOW":
        return "bg-[#4b5563]";
      default:
        return "bg-slate-400";
    }
  }

  const pendingAppointments = useMemo(
    () =>
      filteredAppointments
        .filter((appointment) => appointment.status === "PENDING")
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        ,
    [filteredAppointments],
  );

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const rangeStart =
        viewMode === "month"
          ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
          : viewMode === "day"
            ? weekStart
            : weekStart;
      const rangeEnd =
        viewMode === "month"
          ? new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0)
          : viewMode === "day"
            ? weekStart
            : addDays(weekStart, 6);
      const from = formatDate(rangeStart);
      const to = formatDate(rangeEnd);

      const [appointmentsData, patientsData, practitionersData] = await Promise.all([
        fetchAppointments(from, to),
        fetchPatients(),
        fetchPractitioners(),
      ]);

      setAppointments(appointmentsData);
      setPatients(patientsData);
      setPractitioners(practitionersData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger l'agenda.",
      );
    } finally {
      setLoading(false);
    }

  }

  async function handleCsvImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setImportingCsv(true);
      setImportMessage("");
      setError("");

      const rows = parseCsv(await file.text());
      if (rows.length === 0) {
        throw new Error("Le fichier CSV est vide.");
      }

      const requiredColumns = [
        "patientId",
        "dentistId",
        "chairId",
        "date",
        "time",
        "durationMinutes",
        "type",
      ];
      const missingColumns = requiredColumns.filter(
        (column) => !(column in rows[0]),
      );

      if (missingColumns.length > 0) {
        throw new Error(`Colonnes manquantes : ${missingColumns.join(", ")}.`);
      }

      let imported = 0;
      const errors: string[] = [];

      for (const [index, row] of rows.entries()) {
        try {
          await createAppointment({
            patientId: row.patientId,
            dentistId: row.dentistId,
            chairId: row.chairId,
            date: row.date,
            time: row.time,
            durationMinutes: row.durationMinutes,
            type: row.type || "Consultation",
            notes: row.notes || "",
          });
          imported += 1;
        } catch (err) {
          errors.push(
            `Ligne ${index + 2} : ${
              err instanceof Error ? err.message : "données invalides"
            }`,
          );
        }
      }

      await loadData();
      setImportMessage(
        errors.length > 0
          ? `${imported} rendez-vous importé(s), ${errors.length} ligne(s) rejetée(s). ${errors.join(" ")}`
          : `${imported} rendez-vous importé(s) avec succès.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'importer le fichier CSV.",
      );
    } finally {
      setImportingCsv(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();

      if (cancelled) return;

      try {
        setLoading(true);
        setError("");

        const rangeStart =
          viewMode === "month"
            ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)
            : weekStart;
        const rangeEnd =
          viewMode === "month"
            ? new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0)
            : viewMode === "day"
              ? weekStart
              : addDays(weekStart, 6);
        const from = formatDate(rangeStart);
        const to = formatDate(rangeEnd);

        const [appointmentsData, patientsData, practitionersData] = await Promise.all([
          fetchAppointments(from, to),
          fetchPatients(),
          fetchPractitioners(),
        ]);

        if (cancelled) return;

        setAppointments(appointmentsData);
        setPatients(patientsData);
        setPractitioners(practitionersData);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Impossible de charger l'agenda.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [weekStart, viewMode]);

  function openCreateModal(date?: Date, time?: string) {
    const nextDate = date || new Date();
    const safeDate = formatDate(nextDate);

    setForm({
      patientId: "",
      dentistId: practitioners[0] ? String(practitioners[0].id) : "",
      chairId: "Fauteuil 1",
      date: safeDate >= minDate ? safeDate : minDate,
      time: time || "09:00",
      durationMinutes: "30",
      type: "Consultation",
      notes: "",
    });

    setModalOpen(true);
  }

  function openEditModal(appointment: Appointment) {
    setDetailTarget(null);
    setEditTarget(appointment);
    setForm({
      patientId: String(appointment.patientId),
      dentistId: String(appointment.dentistId),
      chairId: appointment.chairId,
      date: appointment.date >= minDate ? appointment.date : minDate,
      time: appointment.time,
      durationMinutes: String(appointment.durationMinutes),
      type: appointment.type,
      notes: appointment.notes ?? "",
    });
    setModalOpen(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();

    try {
      setError("");
      if (editTarget) {
        await updateAppointment(editTarget.id, form);
      } else {
        await createAppointment(form);
      }
      setModalOpen(false);
      setEditTarget(null);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editTarget
            ? "Impossible de modifier le rendez-vous."
            : "Impossible de créer le rendez-vous.",
      );
    }
  }

  async function changeStatus(appointment: Appointment, status: AppointmentStatus) {
    try {
      await updateAppointmentStatus(appointment.id, status);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le statut.",
      );
    }

  }

  async function changeDetailStatus(status: AppointmentStatus) {
    if (!detailTarget) return;

    await changeStatus(detailTarget, status);
    setDetailTarget({
      ...detailTarget,
      status,
    });
  }

  function openRescheduleModal(appointment: Appointment) {
    setDetailTarget(null);
    setRescheduleTarget(appointment);
    setRescheduleForm({
      date: appointment.date >= minDate ? appointment.date : minDate,
      time: appointment.time,
    });
  }

  async function handleReschedule(event: React.FormEvent) {
    event.preventDefault();
    if (!rescheduleTarget) return;

    try {
      setError("");
      await rescheduleAppointment(
        rescheduleTarget.id,
        rescheduleForm.date,
        rescheduleForm.time,
      );
      setRescheduleTarget(null);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de reporter le rendez-vous.",
      );
    }

  }

  async function openHistory(appointment: Appointment) {
    try {
      setError("");
      setHistoryTarget(appointment);
      setHistoryLoading(true);
      setHistory(await fetchRescheduleHistory(appointment.id));
    } catch (err) {
      setHistoryTarget(null);
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger l'historique des reports.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function appointmentsFor(date: Date, hour: number) {
    const dateString = formatDate(date);

    return filteredAppointments.filter((appointment) => {
      const appointmentHour = Number(appointment.time.slice(0, 2));
      return appointment.date === dateString && appointmentHour === hour;
    });
  }

  function movePeriod(direction: number) {
    if (viewMode === "month") {
      setWeekStart(new Date(weekStart.getFullYear(), weekStart.getMonth() + direction, 1));
      return;
    }

    setWeekStart(addDays(weekStart, viewMode === "day" ? direction : direction * 7));
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] p-5 text-slate-800">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-[2rem] font-semibold tracking-tight text-[#1f2a37]">
              Agenda
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("agenda.week")} des praticiens, fauteuils et rendez-vous en attente.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[#dfe3ea] bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Icon name="upload" size={16} className="text-slate-600" />
              {t("agenda.import")}
            </button>

            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={importingCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-[#dfe3ea] bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Icon name="file" size={16} className="text-slate-600" />
              {importingCsv ? "Import en cours..." : "CSV"}
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvImport}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#6b5ce7] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(107,92,231,0.22)] transition hover:brightness-105"
            >
              <Icon name="plus" size={16} />
              {t("agenda.new")}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-[22px] border border-[#dfe7f2] bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
            <div className="flex flex-col gap-3 border-b border-[#edf1f7] p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => movePeriod(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe3ea] bg-white text-slate-500 transition hover:bg-slate-50"
                  aria-label="Semaine précédente"
                >
                  <Icon name="arrowLeft" size={16} />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setWeekStart(viewMode === "day" ? new Date() : startOfWeek(new Date()))
                  }
                  className="rounded-lg border border-[#dfe3ea] bg-[#f5f7fb] px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  {t("agenda.today")}
                </button>

                <button
                  type="button"
                  onClick={() => movePeriod(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe3ea] bg-white text-slate-500 transition hover:bg-slate-50"
                  aria-label="Semaine suivante"
                >
                  <Icon name="arrowRight" size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-[#f3f4f7] p-1">
                {[
                  [t("agenda.day"), "day"],
                  [t("agenda.week"), "week"],
                  [t("agenda.month"), "month"],
                  [t("agenda.list"), "list"],
                ].map(([tab, mode]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setViewMode(mode as AgendaViewMode)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      viewMode === mode
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[#edf1f7] bg-[#fbfcfe] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-semibold text-[#1f2a37]">
                  {formatMonthTitle(weekStart)}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-lg border border-[#dfe3ea] bg-white px-2 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#e7edf5]" />
                  Tous les praticiens
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg border border-[#dfe3ea] bg-white px-2 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#e7edf5]" />
                  {t("agenda.allChairs")}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-[#edf1f7] bg-[#f9fafc] px-4 py-3">
              {chairOptions.map((chair) => {
                const isActive = selectedChair === chair;

                return (
                  <button
                    key={chair}
                    type="button"
                    onClick={() => setSelectedChair(chair)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#e9e4ff] text-[#4d3cd2] ring-1 ring-[#d9d0ff]'
                        : 'bg-white text-slate-600 ring-1 ring-[#e5eaf2] hover:text-slate-800'
                    }`}
                  >
                    {chair}
                  </button>
                );
              })}
            </div>

            {(viewMode === "week" || viewMode === "day") && (
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div
                  className={`grid border-b border-[#edf1f7] bg-white ${
                    viewMode === "day"
                      ? "grid-cols-[68px_minmax(0,1fr)]"
                      : "grid-cols-[68px_repeat(7,minmax(120px,1fr))]"
                  }`}
                >
                  <div className="border-r border-[#edf1f7] bg-[#fbfcfe] text-sm text-slate-400" />

                  {activeDates.map((date) => {
                    const isToday = formatDate(date) === formatDate(new Date());

                    return (
                      <div
                        key={formatDate(date)}
                        className={`border-r border-[#edf1f7] px-2 py-3 text-center ${
                          isToday ? 'bg-[#f7f5ff]' : 'bg-white'
                        }`}
                      >
                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                          {new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(date)}
                        </div>

                        <div
                          className={`mt-1.5 text-lg font-semibold ${
                            isToday ? 'text-[#6b5ce7]' : 'text-[#1f2a37]'
                          }`}
                        >
                          {date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className={`grid min-h-[118px] border-b border-[#edf1f7] last:border-b-0 ${
                      viewMode === "day"
                        ? "grid-cols-[68px_minmax(0,1fr)]"
                        : "grid-cols-[68px_repeat(7,minmax(120px,1fr))]"
                    }`}
                  >
                    <div className="border-r border-[#edf1f7] bg-[#fbfcfe] px-2 py-3 text-xs font-medium text-slate-400">
                      {String(hour).padStart(2, '0')}:00
                    </div>

                    {activeDates.map((date) => {
                      const items = appointmentsFor(date, hour);

                      return (
                        <div
                          key={`${formatDate(date)}-${hour}`}
                          onDoubleClick={() =>
                            openCreateModal(date, `${String(hour).padStart(2, '0')}:00`)}
                          className="relative min-h-[118px] border-r border-[#edf1f7] bg-white p-1.5 transition hover:bg-slate-50"
                        >
                          {items.map((appointment) => (
                            <div
                              key={appointment.id}
                              onClick={() => setDetailTarget(appointment)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  setDetailTarget(appointment);
                                }
                              }}
                              className={`mb-1.5 cursor-pointer rounded-xl border p-2 text-[11px] shadow-sm transition hover:brightness-[0.98] ${statusClass(appointment.status)}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="font-semibold leading-tight">
                                  {appointment.time} · {appointment.patientName}
                                </div>
                                <span className="mt-0.5 h-2 w-2 rounded-full bg-current opacity-70" />
                              </div>

                              <div className="mt-1 text-[10px] opacity-80">{appointment.type}</div>

                              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] opacity-80">
                                <span>{appointment.dentistName}</span>
                                <span>{appointment.chairId}</span>
                              </div>

                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            )}

            {viewMode === "month" && (
              <div className="grid grid-cols-7 border-l border-t border-[#edf1f7]">
                {monthDates.map((date) => {
                  const isCurrentMonth = date.getMonth() === weekStart.getMonth();
                  const dayAppointments = filteredAppointments.filter(
                    (appointment) => appointment.date === formatDate(date),
                  );

                  return (
                    <div
                      key={formatDate(date)}
                      onDoubleClick={() => openCreateModal(date, "09:00")}
                      className={`min-h-[150px] border-b border-r border-[#edf1f7] p-2 ${
                        isCurrentMonth ? "bg-white" : "bg-[#fafbfc]"
                      }`}
                    >
                      <div className={`mb-2 text-sm font-semibold ${
                        isCurrentMonth ? "text-slate-700" : "text-slate-300"
                      }`}>
                        {date.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayAppointments.slice(0, 4).map((appointment) => (
                          <button
                            key={appointment.id}
                            type="button"
                            onClick={() => setDetailTarget(appointment)}
                            className={`block w-full truncate rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium ${statusClass(
                              appointment.status,
                            )}`}
                          >
                            {appointment.time} · {appointment.patientName || "Patient"}
                          </button>
                        ))}
                        {dayAppointments.length > 4 && (
                          <div className="px-2 text-[11px] font-medium text-slate-400">
                            +{dayAppointments.length - 4} autres
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === "list" && (
              <div className="divide-y divide-[#edf1f7]">
                {filteredAppointments.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-slate-500">
                    Aucun rendez-vous pour cette période.
                  </div>
                ) : (
                  filteredAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => setDetailTarget(appointment)}
                      className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-3 w-3 rounded-full ${statusClass(appointment.status).split(" ")[3]}`} />
                        <div>
                          <div className="font-semibold text-slate-800">
                            {appointment.patientName || "Patient"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {appointment.type} · {appointment.dentistName} · {appointment.chairId}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">
                        <span className="font-semibold">{appointment.date}</span>
                        <span className="mx-2">·</span>
                        <span>{appointment.time}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-[22px] border border-[#dfe7f2] bg-[#f8f9fc] p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[1.15rem] font-semibold text-slate-800">
                Rendez-vous en attente
              </h2>

              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f1eefe] px-1.5 text-xs font-semibold text-[#6b5ce7]">
                {pendingAppointments.length}
              </span>
            </div>

            <div className="mb-4 rounded-xl bg-[#f1f5f9] px-3 py-2 text-xs font-medium text-slate-500">
              Confirmation et suivi
            </div>

            <div className="space-y-3">
              {pendingAppointments.length > 0 ? (
                pendingAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="rounded-2xl border border-[#e6eaf2] bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#ede9fe] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6b5ce7]">
                        {appointment.status === 'CONFIRMED' ? 'Confirmé' : 'En attente'}
                      </span>

                      <button
                        type="button"
                        onClick={() => openCreateModal(new Date(`${appointment.date}T00:00:00`), appointment.time)}
                        className="text-slate-400 transition hover:text-slate-700"
                        aria-label="Modifier le rendez-vous"
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">
                          {appointment.patientName}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {appointment.type} · {appointment.chairId}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-semibold text-slate-700">
                          {appointment.time}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${appointment.date}T00:00:00`))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d8ddec] bg-white px-3 py-4 text-sm font-medium text-slate-600 transition hover:border-[#cdd8ee] hover:bg-slate-50"
                >
                  <Icon name="plus" size={16} />
                  Ajouter un rendez-vous
                </button>
              )}
            </div>

            </section>

            <section className="rounded-[22px] border border-[#dfe7f2] bg-[#f8f9fc] p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
              <div className="mb-4">
                <h2 className="text-[1.15rem] font-semibold text-slate-800">
                  Résumé de la journée
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {new Intl.DateTimeFormat("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date(`${summaryDate}T00:00:00`))}
                </p>
              </div>

              <div className="rounded-2xl border border-[#e6eaf2] bg-white p-3 shadow-sm">
                <div className="space-y-3 text-sm">
                  {statusSummary.map(({ status, label, count }) => (
                    <div
                      key={status}
                      className="flex items-center justify-between text-slate-600"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${statusDotClass(status)}`}
                        />
                        {label}
                      </span>
                      <span className="font-semibold text-slate-800">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-[#e6eaf2] bg-white px-3 py-2.5 text-sm text-slate-600 shadow-sm">
              <span>Filtre actif</span>
              <button type="button" className="inline-flex items-center gap-2 font-medium text-slate-700">
                {selectedChair}
                <Icon name="chevronDown" size={16} />
              </button>
              </div>
            </section>
          </aside>
        </div>

        {loading && (
          <div className="mt-4 text-center text-sm text-slate-500">
            Chargement de l&apos;agenda...
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {importMessage && (
          <div className="mt-4 whitespace-pre-line rounded-xl border border-[#cdebdc] bg-[#effcf4] px-4 py-3 text-sm text-[#18734a]">
            {importMessage}
          </div>
        )}

        {detailTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
            onClick={() => setDetailTarget(null)}
          >
            <div
              className="w-full max-w-2xl overflow-hidden rounded-[24px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-[#edf1f7] px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    Détail du rendez-vous
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {detailTarget.appointmentNumber} ·{" "}
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "full",
                    }).format(new Date(`${detailTarget.date}T00:00:00`))}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailTarget(null)}
                  className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                  aria-label="Fermer le détail du rendez-vous"
                >
                  ×
                </button>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f0eaff] text-lg font-semibold uppercase text-[#7359d9]">
                    {(detailTarget.patientName || "Patient")
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-slate-800">
                        {detailTarget.patientName}
                      </h3>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                          detailTarget.status,
                        )}`}
                      >
                        {STATUS_LABELS[detailTarget.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {detailTarget.appointmentNumber} · Patient #{detailTarget.patientId}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-xs font-medium text-slate-400">
                      Heure et durée
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-700">
                      {detailTarget.time} · {detailTarget.durationMinutes} min
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-xs font-medium text-slate-400">
                      Type de rendez-vous
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-700">
                      {detailTarget.type}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-xs font-medium text-slate-400">
                      Praticien
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-700">
                      {detailTarget.dentistName}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#f8fafc] p-4">
                    <div className="text-xs font-medium text-slate-400">
                      Salle / fauteuil
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-700">
                      {detailTarget.chairId}
                    </div>
                  </div>
                </div>

                {detailTarget.notes && (
                  <div className="rounded-2xl border border-[#edf1f7] px-4 py-3">
                    <div className="text-xs font-medium text-slate-400">Notes</div>
                    <p className="mt-1 text-sm text-slate-600">{detailTarget.notes}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openEditModal(detailTarget)}
                  className="text-sm font-semibold text-[#6b5ce7] transition hover:text-[#5141c9]"
                >
                  Modifier les informations du rendez-vous
                </button>
                <button
                  type="button"
                  onClick={() => void openHistory(detailTarget)}
                  className="ml-4 text-sm font-semibold text-slate-500 transition hover:text-slate-700"
                >
                  Voir l&apos;historique des reports
                </button>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-[#edf1f7] px-6 py-5">
                <button
                  type="button"
                  onClick={() => void changeDetailStatus("IN_CONSULTATION")}
                  className="rounded-xl border border-[#d8c5ff] bg-[#f2eaff] px-4 py-2.5 text-sm font-semibold text-[#7048c9] transition hover:bg-[#e8dcff]"
                >
                  En consultation
                </button>
                <button
                  type="button"
                  onClick={() => openRescheduleModal(detailTarget)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2.5 text-sm font-semibold text-[#2563eb] transition hover:bg-[#dbeafe]"
                >
                  <Icon name="calendarClock" size={16} />
                  Reporter
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(detailTarget)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#c7d2fe] bg-[#eef2ff] px-4 py-2.5 text-sm font-semibold text-[#4f46e5] transition hover:bg-[#e0e7ff]"
                >
                  <Icon name="edit" size={16} />
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => void changeDetailStatus("CANCELLED")}
                  className="rounded-xl border border-[#fecaca] bg-white px-4 py-2.5 text-sm font-semibold text-[#c2413a] transition hover:bg-[#fff7f7]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void changeDetailStatus("NO_SHOW")}
                  className="rounded-xl border border-[#d1d5db] bg-[#f3f4f6] px-4 py-2.5 text-sm font-semibold text-[#4b5563] transition hover:bg-[#e5e7eb]"
                >
                  Absent
                </button>
                <button
                  type="button"
                  onClick={() => void changeDetailStatus("ARRIVED")}
                  className="rounded-xl border border-[#f8d99a] bg-[#fff7df] px-4 py-2.5 text-sm font-semibold text-[#a76507] transition hover:bg-[#ffefc2]"
                >
                  Marquer arrivé
                </button>
                <button
                  type="button"
                  onClick={() => void changeDetailStatus("CONFIRMED")}
                  className="rounded-xl bg-[#1f9d67] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(31,157,103,0.2)] transition hover:bg-[#178653]"
                >
                  ✓ Confirmer
                </button>
              </div>
            </div>
          </div>
        )}

        {historyTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
            <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    Historique des reports
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {historyTarget.patientName} · {historyTarget.appointmentNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryTarget(null)}
                  className="text-2xl text-slate-400 transition hover:text-slate-600"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              {historyLoading ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  Chargement de l&apos;historique...
                </p>
              ) : history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#dfe7f2] bg-[#f8f9fc] px-4 py-6 text-center text-sm text-slate-500">
                  Aucun report enregistré pour ce rendez-vous.
                </div>
              ) : (
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#e6eaf2] bg-[#f8f9fc] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-700">
                          {item.userName}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(item.createdAt))}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        <span className="line-through opacity-70">
                          {item.fromDate} à {item.fromTime}
                        </span>
                        <span className="mx-2 font-semibold text-[#6b5ce7]">→</span>
                        <span className="font-semibold text-slate-800">
                          {item.date} à {item.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {rescheduleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
            <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    Reporter le rendez-vous
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {rescheduleTarget.patientName} · {rescheduleTarget.type}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="text-2xl text-slate-400 transition hover:text-slate-600"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleReschedule} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Nouvelle date
                  </label>
                  <input
                    required
                    type="date"
                    min={minDate}
                    value={rescheduleForm.date}
                    onChange={(event) =>
                      setRescheduleForm({
                        ...rescheduleForm,
                        date: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Nouvelle heure
                  </label>
                  <input
                    required
                    type="time"
                    value={rescheduleForm.time}
                    onChange={(event) =>
                      setRescheduleForm({
                        ...rescheduleForm,
                        time: event.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRescheduleTarget(null)}
                    className="rounded-xl border border-[#dfe7f2] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#6b5ce7] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
                  >
                    <Icon name="calendarClock" size={16} />
                    Confirmer le report
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
            <div className="w-full max-w-xl rounded-[24px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    {editTarget ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {editTarget
                      ? "Modifier les informations sans créer un historique de report"
                      : "Ajouter un rendez-vous à l&apos;agenda"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditTarget(null);
                  }}
                  className="text-2xl text-slate-400 transition hover:text-slate-600"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Patient
                  </label>

                  <select
                    required
                    value={form.patientId}
                    onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                    className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                  >
                    <option value="">Sélectionner un patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.firstName} {patient.lastName} — {patient.patientNumber}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Praticien
                  </label>

                  <select
                    required
                    value={form.dentistId}
                    onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
                    className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                  >
                    <option value="">Sélectionner un praticien</option>
                    {practitioners.map((practitioner) => (
                      <option key={practitioner.id} value={practitioner.id}>
                        {practitioner.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Date
                    </label>

                    <input
                      required
                      type="date"
                        min={minDate}
                        value={form.date}
                        onChange={(e) => {
                          const nextDate = e.target.value;
                          if (!nextDate || nextDate >= minDate) {
                            setForm({ ...form, date: nextDate });
                          }
                        }}
                        className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                      />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Heure
                    </label>

                    <input
                      required
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm({ ...form, time: e.target.value })}
                      className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Fauteuil
                    </label>

                    <select
                      value={form.chairId}
                      onChange={(e) => setForm({ ...form, chairId: e.target.value })}
                      className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                    >
                      <option>Fauteuil 1</option>
                      <option>Fauteuil 2</option>
                      <option>Fauteuil 3</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Durée
                    </label>

                    <select
                      value={form.durationMinutes}
                      onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                      className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 heure</option>
                      <option value="90">1h30</option>
                      <option value="120">2 heures</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Type de rendez-vous
                  </label>

                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                  >
                    <option>Consultation</option>
                    <option>Contrôle</option>
                    <option>Détartrage</option>
                    <option>Urgence</option>
                    <option>Extraction</option>
                    <option>Soins</option>
                    <option>Prothèse</option>
                    <option>Autre</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Notes
                  </label>

                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-[#dfe7f2] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#b9c9f3]"
                    placeholder="Informations complémentaires..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      setEditTarget(null);
                    }}
                    className="rounded-xl border border-[#dfe7f2] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    className="rounded-xl bg-[#6b5ce7] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
                  >
                    {editTarget ? "Enregistrer les modifications" : "Créer le rendez-vous"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}