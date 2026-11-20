"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";

type Patient = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type OdontogramViewMode = "initial" | "current" | "completed" | "planned";
type Dentition = "adult" | "child";
type ToothState = {
  initialStatus: string;
  initialNote: string;
  currentStatus: string;
  currentNote: string;
};
type ToothEntry = {
  toothNumber: number;
  view: "initial" | "current";
  status: string;
  note: string;
};

const adultUpper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const adultLower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const childUpper = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const childLower = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const clinicalStatuses = [
  "Sain", "Carie", "Obturation", "Couronne", "Bridge", "Implant", "Endodontie",
  "Extraction", "Absente", "Planifié", "Prothèse", "Facette", "Fracture",
  "Mobilité", "Infection", "Autre",
];

const statusKeys: Record<string, string> = {
  Sain: "status.healthy",
  Carie: "status.cavity",
  Obturation: "status.filling",
  Couronne: "status.crown",
  Bridge: "status.bridge",
  Implant: "status.implant",
  Endodontie: "status.endodontics",
  Extraction: "status.extraction",
  Absente: "status.missing",
  Planifié: "status.planned",
  Prothèse: "status.prosthesis",
  Facette: "status.facet",
  Fracture: "status.fracture",
  Mobilité: "status.mobility",
  Infection: "status.infection",
  Autre: "status.other",
};

const completedStatuses = new Set([
  "Obturation", "Couronne", "Bridge", "Implant", "Endodontie", "Extraction", "Absente", "Facette",
]);
const plannedStatuses = new Set(["Planifié", "Prothèse"]);

const statusStyles: Record<string, string> = {
  Sain: "border-slate-200 bg-white text-slate-500",
  Carie: "border-rose-300 bg-rose-50 text-rose-600",
  Obturation: "border-blue-300 bg-blue-50 text-blue-600",
  Couronne: "border-amber-300 bg-amber-50 text-amber-600",
  Bridge: "border-amber-300 bg-amber-50 text-amber-600",
  Implant: "border-blue-300 bg-blue-50 text-blue-600",
  Endodontie: "border-violet-300 bg-violet-50 text-violet-600",
  Extraction: "border-slate-400 bg-slate-100 text-slate-600",
  Absente: "border-slate-400 bg-slate-100 text-slate-600",
  Planifié: "border-emerald-300 bg-emerald-50 text-emerald-600",
  Prothèse: "border-emerald-300 bg-emerald-50 text-emerald-600",
  Facette: "border-cyan-300 bg-cyan-50 text-cyan-600",
  Fracture: "border-orange-300 bg-orange-50 text-orange-600",
  Mobilité: "border-orange-300 bg-orange-50 text-orange-600",
  Infection: "border-rose-300 bg-rose-50 text-rose-600",
  Autre: "border-slate-300 bg-slate-50 text-slate-600",
};

const statusDots: Record<string, string> = {
  Sain: "bg-slate-300",
  Carie: "bg-rose-400",
  Obturation: "bg-blue-400",
  Couronne: "bg-amber-400",
  Bridge: "bg-amber-400",
  Implant: "bg-blue-500",
  Endodontie: "bg-violet-500",
  Extraction: "bg-slate-600",
  Absente: "bg-slate-600",
  Planifié: "bg-emerald-400",
  Prothèse: "bg-emerald-500",
  Facette: "bg-cyan-400",
  Fracture: "bg-orange-400",
  Mobilité: "bg-orange-500",
  Infection: "bg-rose-500",
  Autre: "bg-slate-400",
};

const initialToothState = (): ToothState => ({
  initialStatus: "Sain",
  initialNote: "",
  currentStatus: "Sain",
  currentNote: "",
});

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function toothKind(number: number) {
  const position = number % 10;
  if (position <= 2) return "incisor";
  if (position === 3) return "canine";
  if (position <= 5) return "premolar";
  return "molar";
}

function ToothDrawing({ number, inverted }: { number: number; inverted: boolean }) {
  const kind = toothKind(number);
  const crown = kind === "incisor"
    ? "M7 2.5C4 2.5 2.8 4.8 3.3 7.8c.4 2.7 1.5 4.4 3.4 5.8 1.1.8 2 .9 3.3.9s2.2-.1 3.3-.9c1.9-1.4 3-3.1 3.4-5.8.5-3-0.7-5.3-3.7-5.3-1.5 0-2 .6-3.3.6s-1.8-.6-2.7-.6Z"
    : kind === "canine"
      ? "M7 2c-3.5 0-5 2.4-4 5.5.7 2.5 2.2 4.5 4.3 5.8.9.6 1.7.9 2.7.9s1.8-.3 2.7-.9c2.1-1.3 3.6-3.3 4.3-5.8 1-3.1-.5-5.5-4-5.5-1.3 0-2.1.6-3 1.4C9.1 2.6 8.3 2 7 2Z"
      : kind === "premolar"
        ? "M5.5 2.5C2.4 2.5 1.6 4.7 2.4 7c.7 2.3 1.7 4 3.6 5.3 1 .7 2 .9 3.8.9s2.8-.2 3.8-.9c1.9-1.3 2.9-3 3.6-5.3.8-2.3 0-4.5-3.1-4.5-1.7 0-2.8.8-4.1 1.7-1.3-.9-2.4-1.7-4.5-1.7Z"
        : "M4 2.5C1 2.2.8 4.6 1.5 7c.5 2.1 1.1 3.7 2.4 5.1 1.1 1.1 2.3 1.3 3.7.9 1-.3 1.6-1 2.4-1s1.4.7 2.4 1c1.4.4 2.6.2 3.7-.9 1.3-1.4 1.9-3 2.4-5.1.7-2.4.5-4.8-2.5-4.5-1.8.2-3.2 1-4.8 2.1C7.2 3.5 5.8 2.7 4 2.5Z";
  const rootPaths = kind === "molar"
    ? ["M4 11c1.2 1.2 2.4 1.6 4.2 1.1-.3 5.5-1 10.6-2.2 15.2-.3 1.1-.8 1.7-1.2 1.5-.5-.2-.6-.9-.6-1.8-.2-5.1-.3-10.5-.2-16Z", "M9.5 12c.5-.3.8-.6 1.2-.6s.7.3 1.2.6c.2 5-.1 10.1-.6 15.6-.1.9-.3 1.4-.6 1.4s-.5-.5-.6-1.4c-.5-5.5-.8-10.6-.6-15.6Z", "M14.8 12.1c1.8.5 3 0 4.2-1.1.1 5.5 0 10.9-.2 16 0 .9-.1 1.6-.6 1.8-.4.2-.9-.4-1.2-1.5-1.2-4.6-1.9-9.7-2.2-15.2Z"]
    : kind === "premolar"
      ? ["M5.2 12c1 .9 2 .9 3.4.8-.2 5.3-.8 9.8-1.7 14.3-.2 1.1-.6 1.5-1 1.4-.4-.1-.5-.8-.5-1.6-.3-5-.4-10-.2-14.9Z", "M11 12.8c1.4.1 2.4.1 3.4-.8.2 4.9.1 9.9-.2 14.9 0 .8-.1 1.5-.5 1.6-.4.1-.8-.3-1-1.4-.9-4.5-1.5-9-1.7-14.3Z"]
      : ["M5.1 12.8c1 .8 2.1 1.1 3.6 1-.3 5-.9 9.7-1.8 14.2-.2 1.1-.5 1.6-.9 1.5-.4-.1-.5-.8-.5-1.5-.3-5-.5-10.1-.4-15.2Z"];

  return (
    <svg viewBox="0 0 21 31" aria-hidden="true" className="h-9 w-7 drop-shadow-[0_1px_1px_rgba(51,65,85,0.14)]" style={{ transform: inverted ? "rotate(180deg)" : undefined }}>
      <defs>
        <linearGradient id={`enamel-${number}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".58" stopColor="#fffef8" />
          <stop offset="1" stopColor="#dce6e8" />
        </linearGradient>
      </defs>
      {rootPaths.map((path, index) => <path key={index} d={path} fill="#fffdf6" stroke="#b6c4c8" strokeWidth=".55" />)}
      <path d={crown} fill={`url(#enamel-${number})`} stroke="#9eafb5" strokeWidth=".65" strokeLinejoin="round" />
      {(kind === "molar" || kind === "premolar") && <path d="M4 6.3c2.2.9 3.6 1.2 6.3 1.3m1.2 0c2.7-.1 4.1-.4 6.3-1.3M10.5 6.8v3.1" fill="none" stroke="#c1cccf" strokeWidth=".5" strokeLinecap="round" />}
      {kind === "incisor" && <path d="M5.5 5.4c1.7-.8 3-.6 4.5 0 1.5-.6 2.8-.8 4.5 0" fill="none" stroke="#e0e8e9" strokeWidth=".5" strokeLinecap="round" />}
    </svg>
  );
}

export function OdontogramView() {
  const { locale, t } = useI18n();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [query, setQuery] = useState("");
  const [dentition, setDentition] = useState<Dentition>("adult");
  const [view, setView] = useState<OdontogramViewMode>("initial");
  const [toothStates, setToothStates] = useState<Record<number, ToothState>>({});
  const [customClinicalStatuses, setCustomClinicalStatuses] = useState<string[]>([]);
  const [addingClinicalStatus, setAddingClinicalStatus] = useState(false);
  const [customStatusDraft, setCustomStatusDraft] = useState("");
  const [savingClinicalStatus, setSavingClinicalStatus] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [savingDentition, setSavingDentition] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  const selectedPatient = patients.find((patient) => String(patient.id) === selectedPatientId) ?? null;
  const upperTeeth = dentition === "adult" ? adultUpper : childUpper;
  const lowerTeeth = dentition === "adult" ? adultLower : childLower;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/patients?q=", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Chargement des patients impossible.");
        return payload as { data: Patient[] };
      })
      .then(({ data }) => {
        if (cancelled) return;
        setPatients(data);
        if (data.length) {
          setLoadingChart(true);
          setSelectedPatientId(String(data[0].id));
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Chargement des patients impossible.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPatients(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPatientId) return;
    let cancelled = false;
    fetch(`/api/patients/${selectedPatientId}/odontogram`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Chargement de l’odontogramme impossible.");
        return payload as { data: Array<ToothState & { toothNumber: number }>; dentitionType?: Dentition; clinicalStatuses: string[] };
      })
      .then(({ data, dentitionType, clinicalStatuses }) => {
        if (cancelled) return;
        setDentition(dentitionType === "child" ? "child" : "adult");
        setCustomClinicalStatuses(clinicalStatuses);
        setToothStates(Object.fromEntries(data.map((item) => [item.toothNumber, {
          initialStatus: item.initialStatus,
          initialNote: item.initialNote ?? "",
          currentStatus: item.currentStatus,
          currentNote: item.currentNote ?? "",
        }])));
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Chargement de l’odontogramme impossible.");
      })
      .finally(() => {
        if (!cancelled) setLoadingChart(false);
      });
    return () => { cancelled = true; };
  }, [selectedPatientId]);

  const normalizedQuery = normalizeSearchValue(query);
  const digitsQuery = query.replace(/\D/g, "");
  const filteredPatients = patients.filter((patient) => {
    const text = normalizeSearchValue(`${patient.firstName} ${patient.lastName} ${patient.patientNumber} ${patient.phone}`);
    return text.includes(normalizedQuery)
      || (digitsQuery.length > 0 && patient.phone.replace(/\D/g, "").includes(digitsQuery));
  });

  function stateFor(tooth: number) {
    return toothStates[tooth] ?? initialToothState();
  }

  function statusFor(tooth: number) {
    const state = stateFor(tooth);
    const status = view === "initial" ? state.initialStatus : state.currentStatus;
    if (view === "completed" && !completedStatuses.has(status)) return "Sain";
    if (view === "planned" && !plannedStatuses.has(status)) return "Sain";
    return status;
  }

  const selectedState = selectedTooth ? stateFor(selectedTooth) : null;
  const selectedStatus = selectedState
    ? view === "initial" ? selectedState.initialStatus : selectedState.currentStatus
    : "Sain";
  const selectedNote = selectedState
    ? view === "initial" ? selectedState.initialNote : selectedState.currentNote
    : "";
  const orderedClinicalStatuses = [...new Map(
    [...clinicalStatuses, ...customClinicalStatuses].map((status) => [status.toLocaleLowerCase(), status]),
  ).values()].sort((first, second) => {
    const firstLabel = Object.hasOwn(statusKeys, first) ? t(statusKeys[first]) : first;
    const secondLabel = Object.hasOwn(statusKeys, second) ? t(statusKeys[second]) : second;
    return firstLabel.length - secondLabel.length || firstLabel.localeCompare(secondLabel, locale === "ar" ? "ar" : "fr");
  });

  function updateSelectedTooth(update: Partial<Pick<ToothState, "initialStatus" | "initialNote" | "currentStatus" | "currentNote">>) {
    if (!selectedTooth) return;
    const targetView = view === "initial" ? "initial" : "current";
    setToothStates((current) => ({
      ...current,
      [selectedTooth]: { ...initialToothState(), ...current[selectedTooth], ...update },
    }));
    setDirtyKeys((current) => {
      const key = `${selectedTooth}:${targetView}`;
      return current.includes(key) ? current : [...current, key];
    });
    setMessage("");
  }

  async function addClinicalStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) return;
    const status = customStatusDraft.trim();
    if (!status) return;
    setSavingClinicalStatus(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/patients/${selectedPatient.id}/odontogram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Ajout de l’état clinique impossible.");
      const result = payload as { status: string; clinicalStatuses: string[] };
      setCustomClinicalStatuses(result.clinicalStatuses);
      if (selectedTooth) {
        updateSelectedTooth(view === "initial" ? { initialStatus: result.status } : { currentStatus: result.status });
      }
      setCustomStatusDraft("");
      setAddingClinicalStatus(false);
      setMessage(label("État clinique ajouté au cabinet.", "تمت إضافة الحالة السريرية إلى العيادة."));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ajout de l’état clinique impossible.");
    } finally {
      setSavingClinicalStatus(false);
    }
  }

  async function saveEntries(entries: ToothEntry[]): Promise<boolean> {
    if (!selectedPatient || entries.length === 0) return false;
    setSaving(true);
    setError("");
    setMessage("");
    let savedCount = 0;
    try {
      for (const entry of entries) {
        const response = await fetch(`/api/patients/${selectedPatient.id}/odontogram`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `Échec de sauvegarde de la dent ${entry.toothNumber}.`);
        savedCount += 1;
      }
      const savedKeys = new Set(entries.map((entry) => `${entry.toothNumber}:${entry.view}`));
      setDirtyKeys((current) => current.filter((key) => !savedKeys.has(key)));
      setMessage(label(`${savedCount} mise(s) à jour enregistrée(s).`, `${savedCount} تحديث تم حفظه.`));
      return true;
    } catch (saveError) {
      const reason = saveError instanceof Error ? saveError.message : "Enregistrement impossible.";
      setError(savedCount
        ? `${savedCount} mise(s) à jour enregistrée(s). ${reason}`
        : reason);
      if (savedCount) {
        const savedKeys = new Set(entries.slice(0, savedCount).map((entry) => `${entry.toothNumber}:${entry.view}`));
        setDirtyKeys((current) => current.filter((key) => !savedKeys.has(key)));
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  function saveCurrentTooth() {
    if (!selectedTooth) return;
    const state = stateFor(selectedTooth);
    const targetView = view === "initial" ? "initial" : "current";
    void saveEntries([{
      toothNumber: selectedTooth,
      view: targetView,
      status: targetView === "initial" ? state.initialStatus : state.currentStatus,
      note: targetView === "initial" ? state.initialNote : state.currentNote,
    }]);
  }

  function saveAll() {
    const entries = dirtyKeys.map((key): ToothEntry => {
      const [rawNumber, entryView] = key.split(":");
      const toothNumber = Number(rawNumber);
      const state = stateFor(toothNumber);
      return entryView === "initial"
        ? { toothNumber, view: "initial", status: state.initialStatus, note: state.initialNote }
        : { toothNumber, view: "current", status: state.currentStatus, note: state.currentNote };
    });
    void saveEntries(entries);
  }

  function changeView(nextView: OdontogramViewMode) {
    setView(nextView);
    setSelectedTooth(null);
  }

  function changePatient(patientId: string) {
    if (patientId === selectedPatientId) return;
    if (dirtyKeys.length && !window.confirm(label(
      "Des modifications ne sont pas enregistrées. Changer de patient sans les sauvegarder ?",
      "هناك تعديلات غير محفوظة. هل تريد تغيير المريض دون حفظها؟",
    ))) return;
    setLoadingChart(true);
    setError("");
    setMessage("");
    setToothStates({});
    setDirtyKeys([]);
    setSelectedTooth(null);
    setSelectedPatientId(patientId);
    setQuery("");
  }

  async function changeDentition(nextDentition: Dentition) {
    if (!selectedPatient || nextDentition === dentition || loadingChart || savingDentition) return;
    const previousDentition = dentition;
    setSavingDentition(true);
    setDentition(nextDentition);
    setSelectedTooth(null);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/patients/${selectedPatient.id}/odontogram`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dentitionType: nextDentition }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Impossible d’enregistrer le type de dentition.");
      setMessage(label("Type de dentition enregistré pour ce patient.", "تم حفظ نوع الأسنان لهذا المريض."));
    } catch (saveError) {
      setDentition(previousDentition);
      setError(saveError instanceof Error ? saveError.message : "Impossible d’enregistrer le type de dentition.");
    } finally {
      setSavingDentition(false);
    }
  }

  function ToothButton({ number, inverted }: { number: number; inverted: boolean }) {
    const status = statusFor(number);
    return (
      <button
        key={number}
        type="button"
        onClick={() => setSelectedTooth(number)}
        aria-label={`${label("Dent", "سن")} ${number} — ${t(Object.hasOwn(statusKeys, status) ? statusKeys[status] : status)}`}
        aria-pressed={selectedTooth === number}
        className={`relative flex h-[72px] w-11 shrink-0 flex-col items-center justify-center rounded-xl border bg-white transition hover:-translate-y-0.5 hover:border-accent/60 ${selectedTooth === number ? "border-accent shadow-[0_0_0_2px_rgba(108,92,231,0.18)]" : status !== "Sain" && Object.hasOwn(statusStyles, status) ? statusStyles[status] : "border-slate-200"}`}
      >
        <ToothDrawing number={number} inverted={inverted} />
        <span className="mt-0.5 text-[10px] font-medium text-slate-500">{number}</span>
        {status !== "Sain" && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white ${Object.hasOwn(statusDots, status) ? statusDots[status] : "bg-slate-400"}`} />}
      </button>
    );
  }

  const viewOptions: Array<{ id: OdontogramViewMode; label: string }> = [
    { id: "initial", label: t("patient.initial") },
    { id: "current", label: t("patient.current") },
    { id: "completed", label: t("patient.completed") },
    { id: "planned", label: t("patient.planned") },
  ];

  async function downloadPdf() {
    if (!selectedPatient || !printRef.current || generatingPdf) return;
    setGeneratingPdf(true);
    setError("");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(printRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: printRef.current.scrollWidth,
        windowHeight: printRef.current.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 10;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const sliceHeight = Math.floor(canvas.width * contentHeight / contentWidth);

      for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeight, page += 1) {
        const currentHeight = Math.min(sliceHeight, canvas.height - offset);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = currentHeight;
        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("Impossible de préparer la page PDF.");
        context.drawImage(canvas, 0, offset, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
        if (page > 0) pdf.addPage();
        pdf.addImage(
          pageCanvas.toDataURL("image/png"),
          "PNG",
          margin,
          margin,
          contentWidth,
          currentHeight * contentWidth / canvas.width,
        );
      }

      const safeName = `${selectedPatient.firstName}-${selectedPatient.lastName}`
        .replace(/[^a-zA-Z0-9_-]/g, "-");
      pdf.save(`odontogramme-${selectedPatient.patientNumber}-${safeName}.pdf`);
      setMessage(label("Le PDF a été téléchargé.", "تم تنزيل ملف PDF."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Génération du PDF impossible.", "تعذر إنشاء ملف PDF."));
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Odontogramme", "مخطط الأسنان")}</h1>
          <p className="mt-1 text-sm text-slate-500">{label("Dentition FDI · sélectionnez une dent pour actualiser son état clinique.", "ترقيم FDI · اختر سناً لتحديث حالته السريرية.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void downloadPdf()} disabled={!selectedPatient || loadingChart || generatingPdf}><Icon name="print" size={14} />{generatingPdf ? label("Création du PDF…", "جار إنشاء PDF...") : label("Imprimer / PDF", "طباعة / PDF")}</Button>
          <Button variant="primary" onClick={saveAll} disabled={!selectedPatient || loadingChart || saving}><Icon name="check" size={14} />{saving ? label("Enregistrement…", "جار الحفظ...") : label("Enregistrer", "حفظ")}</Button>
        </div>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm print:hidden">
        <div className="grid min-w-65 flex-1 gap-2 md:max-w-md">
          <label htmlFor="odontogram-patient-search" className="text-xs font-semibold text-slate-500">{label("Patient", "المريض")}</label>
          <div className="relative">
            <Icon name="search" size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="odontogram-patient-search"
              type="text"
              className="search-with-icon w-full rounded-xl border border-line bg-white py-2 ps-11 pe-4 text-xs outline-none transition focus:border-accent"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={label("Nom, téléphone ou numéro de dossier…", "الاسم أو الهاتف أو رقم الملف...")}
              autoComplete="off"
            />
          </div>
          <select
            aria-label={label("Choisir un patient", "اختر مريضاً")}
            className="input"
            value={selectedPatientId}
            onChange={(event) => changePatient(event.target.value)}
            disabled={loadingPatients || savingDentition || filteredPatients.length === 0}
          >
            {loadingPatients && <option value="">{label("Chargement des patients…", "جار تحميل المرضى...")}</option>}
            {!loadingPatients && filteredPatients.length === 0 && <option value="">{label("Aucun patient trouvé", "لم يتم العثور على مريض")}</option>}
            {filteredPatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName} · {patient.patientNumber} · {patient.phone}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {selectedPatient && <p className="pb-2 text-xs text-slate-500">{selectedPatient.patientNumber} · {selectedPatient.phone}</p>}
          <div className="flex rounded-xl bg-slate-100 p-1">
            {viewOptions.map((option) => (
              <button key={option.id} type="button" onClick={() => changeView(option.id)} className={`rounded-lg px-3 py-2 text-xs transition ${view === option.id ? "bg-white font-semibold text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(["adult", "child"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => void changeDentition(kind)} disabled={!selectedPatient || loadingChart || savingDentition} aria-pressed={dentition === kind} className={`rounded-lg px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${dentition === kind ? "bg-white font-semibold text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`}>
                {savingDentition && dentition === kind ? label("Enregistrement…", "جار الحفظ...") : kind === "adult" ? label("Adulte", "بالغ") : label("Enfant", "طفل")}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
      {!loadingPatients && !patients.length && !error && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{label("Aucun patient disponible.", "لا يوجد مرضى.")}</p>}

      {selectedPatient && (
        <div ref={printRef} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-ink">{label("Odontogramme ·", "مخطط الأسنان ·")} {selectedPatient.firstName} {selectedPatient.lastName}</h2>
                <p className="mt-1 text-xs text-slate-400">{dentition === "adult" ? t("patient.permanentDentition") : label("Dentition temporaire · Numérotation FDI", "الأسنان اللبنية · ترقيم FDI")}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">● FDI</span>
            </div>
            <div className={`relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-7 ${loadingChart ? "opacity-60" : ""}`}>
              {loadingChart && <p className="absolute inset-x-0 top-2 text-center text-xs text-slate-500">{label("Chargement de l’odontogramme…", "جار تحميل مخطط الأسنان...")}</p>}
              <div className="flex min-w-max justify-center gap-1.5">{upperTeeth.map((tooth) => <ToothButton key={tooth} number={tooth} inverted />)}</div>
              <div className="my-5 border-t border-dashed border-slate-300" />
              <div className="flex min-w-max justify-center gap-1.5">{lowerTeeth.map((tooth) => <ToothButton key={tooth} number={tooth} inverted={false} />)}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
              {[
                ["Carie", "bg-rose-400"],
                ["Obturation / implant", "bg-blue-400"],
                ["Couronne / bridge", "bg-amber-400"],
                ["Planifié", "bg-emerald-400"],
                ["Absente / extraction", "bg-slate-500"],
              ].map(([legend, color]) => <span key={legend} className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-full ${color}`} />{legend}</span>)}
            </div>
            <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-xs text-blue-700">
              <Icon name="info" size={14} className="mr-2 inline" />
              {label("L’odontogramme est un support de saisie clinique. Les observations restent sous la responsabilité du praticien.", "مخطط الأسنان أداة للإدخال السريري. تبقى الملاحظات تحت مسؤولية الطبيب.")}
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm print:break-inside-avoid">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-ink">{label("Dent", "سن")} {selectedTooth ?? "—"}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedTooth ? `${view === "initial" ? t("patient.initial") : t("patient.current")} : ${t(Object.hasOwn(statusKeys, selectedStatus) ? statusKeys[selectedStatus] : selectedStatus)}` : label("Sélectionnez une dent sur le schéma.", "اختر سناً من المخطط.")}
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-600">● FDI</span>
            </div>

            <div className="mt-5 flex items-center gap-3 border-b border-line pb-4">
              <div className="grid h-16 w-14 place-items-center rounded-xl border border-line bg-slate-50">
                {selectedTooth && <ToothDrawing number={selectedTooth} inverted={dentition === "adult" ? upperTeeth.includes(selectedTooth) : upperTeeth.includes(selectedTooth)} />}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{label("Dent sélectionnée", "السن المحدد")}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedTooth ? label("Modifiez son état et sa note clinique.", "عدّل حالته وملاحظته السريرية.") : label("Cliquez sur une dent pour modifier sa fiche.", "انقر على سن لتعديل بياناته.")}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <h3 className="mb-3 text-sm font-bold text-ink">{label("État clinique", "الحالة السريرية")}</h3>
              <div className="flex flex-wrap items-center gap-2">
                {orderedClinicalStatuses.map((status) => {
                  const statusLabel = Object.hasOwn(statusKeys, status) ? t(statusKeys[status]) : status;
                  const statusStyle = Object.hasOwn(statusStyles, status) ? statusStyles[status] : "border-violet-300 bg-violet-50 text-violet-700";
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={!selectedTooth || loadingChart}
                      onClick={() => {
                        updateSelectedTooth(view === "initial" ? { initialStatus: status } : { currentStatus: status });
                        setAddingClinicalStatus(status === "Autre");
                      }}
                      aria-pressed={selectedTooth !== null && selectedStatus === status}
                      className={`inline-flex h-9 flex-none items-center justify-center whitespace-nowrap rounded-lg border px-2 text-xs leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${selectedStatus === status && selectedTooth ? `${statusStyle} font-semibold shadow-sm` : "border-slate-200 bg-white text-slate-500 hover:border-accent/50"}`}
                    >
                      {statusLabel}
                    </button>
                  );
                })}
              </div>
              {addingClinicalStatus && (
                <form onSubmit={addClinicalStatus} className="mt-4 rounded-xl border-2 border-accent/30 bg-accent/5 p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-ink">{label("Ajouter un état clinique personnalisé", "إضافة حالة سريرية مخصصة")}</h4>
                  <p className="mt-1 text-xs text-slate-500">{label("Cet état sera disponible pour tous les patients du cabinet.", "ستكون هذه الحالة متاحة لجميع مرضى العيادة.")}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="min-w-40 flex-1 text-sm font-semibold text-slate-700">
                      {label("Nom du nouvel état", "اسم الحالة الجديدة")}
                      <input
                        value={customStatusDraft}
                        onChange={(event) => setCustomStatusDraft(event.target.value)}
                        maxLength={40}
                        placeholder={label("Ex. Sensibilité dentaire", "مثال: حساسية الأسنان")}
                        className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10"
                        required
                      />
                    </label>
                    <Button type="submit" variant="primary" className="h-11 px-5" disabled={savingClinicalStatus}>
                      <Icon name="plus" size={16} /> {savingClinicalStatus ? label("Ajout…", "جارٍ الإضافة…") : label("Ajouter l’état", "إضافة الحالة")}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-ink">{label("Informations associées", "معلومات مرتبطة")}</h3>
              <p className="mt-1 text-xs text-slate-500">{label("Rattachez une observation au dossier de cette dent.", "أضف ملاحظة إلى سجل هذا السن.")}</p>
              <label htmlFor="tooth-note" className="mt-4 block text-xs font-semibold text-slate-600">{t("patient.clinicalNote")}</label>
              <textarea
                id="tooth-note"
                value={selectedNote}
                onChange={(event) => updateSelectedTooth(view === "initial" ? { initialNote: event.target.value } : { currentNote: event.target.value })}
                disabled={!selectedTooth || loadingChart}
                placeholder={selectedTooth ? label(`Observation sur la dent ${selectedTooth}…`, `ملاحظة على السن ${selectedTooth}...`) : label("Sélectionnez une dent…", "اختر سناً...")}
                className="mt-1 min-h-24 w-full rounded-lg border border-line bg-white p-3 text-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <Button variant="primary" className="mt-3" disabled={!selectedTooth || loadingChart || saving} onClick={saveCurrentTooth}>
                <Icon name="check" size={14} />
                {saving ? label("Enregistrement…", "جار الحفظ...") : label("Enregistrer l’état", "حفظ الحالة")}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
