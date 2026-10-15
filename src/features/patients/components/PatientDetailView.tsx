"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { ageFromBirthDate } from "@/lib/dates";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { archivePatient } from "../api";
import type { PatientDetail } from "../types";
import { PatientForm } from "./PatientForm";

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 whitespace-pre-line wrap-break-word text-sm font-semibold text-ink">{value || "—"}</p>
    </div>
  );
}

function ActionButton({ children, icon, onClick }: { children: ReactNode; icon: ReactNode; onClick?: () => void }) {
  return <Button className="px-3 py-2 text-sm" onClick={onClick}>{icon}{children}</Button>;
}

// Le PDF utilise la police standard Helvetica, qui ne sait pas afficher tous les caractères Unicode.
// On retire donc les accents et les caractères non supportés avant d'écrire le contenu du document.
function pdfText(value: string) {
  // Le symbole degré est conservé avec un marqueur puis encodé en WinAnsi.
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/°/g, "__DEGREE__").replace(/[^\x20-\x7E]/g, "?");
}

// Les parenthèses et les antislashs ont une signification spéciale dans la syntaxe PDF.
// Ils doivent être échappés pour que le texte saisi dans le formulaire reste valide.
function escapePdf(value: string) {
  return pdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/__DEGREE__/g, "\\260");
}

// Un PDF minimal est composé d'objets référencés par une table xref.
// Cette fonction assemble ces objets en mémoire puis retourne un Blob téléchargeable.
type PrescriptionPdfData = {
  practitioner: string;
  registrationNumber: string;
  practitionerAddress: string;
  practitionerPhone: string;
  prescriptionNumber: string;
  date: string;
  patientName: string;
  patientNumber: string;
  patientBirthDate: string;
  patientAddress: string;
  medicines: string;
  instructions: string;
};

function pdfTextAt(x: number, y: number, size: number, value: string, color = "0.09 0.17 0.30 rg") {
  return `BT ${color} /F1 ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
}

function buildPrescriptionPdf(data: PrescriptionPdfData) {
  const medicineLines = data.medicines.split(/\r?\n/).filter(Boolean);
  const prescriptionNumber = data.prescriptionNumber || `${data.patientNumber}-${data.date.replaceAll("-", "")}`;
  const patientName = `Nom et prenom : ${data.patientName}`;
  const patientBirthDate = `Date de naissance : ${data.patientBirthDate || "A completer"}`;
  const patientAddress = `Adresse : ${data.patientAddress || "A completer"}`;
  const medicineRows = medicineLines.slice(0, 12);
  const adviceRows = (data.instructions || "Aucune consigne particuliere.").match(/.{1,86}(\s|$)/g)?.slice(0, 4) ?? [];
  const content = [
    "q", "0.45 0.35 0.85 rg", "0 790 595 52 re", "f", "Q",
    pdfTextAt(60, 814, 22, "DentaFlow", "1 1 1 rg"),
    pdfTextAt(60, 796, 9, "CABINET DENTAIRE - ORDONNANCE", "1 1 1 rg"),
    pdfTextAt(60, 758, 17, "ORDONNANCE"),
    pdfTextAt(60, 734, 9, `Praticien : ${data.practitioner}`),
    pdfTextAt(60, 718, 9, `N° d'inscription à l'Ordre : ${data.registrationNumber}`),
    pdfTextAt(60, 702, 9, `Adresse professionnelle : ${data.practitionerAddress || "A completer"}`),
    pdfTextAt(60, 686, 9, `Telephone professionnel : ${data.practitionerPhone || "A completer"}`),
    "0.88 0.89 0.93 RG", "1 w", "50 570 495 96 re", "S",
    pdfTextAt(65, 646, 11, "PATIENT"),
    pdfTextAt(65, 626, 9, patientName),
    pdfTextAt(65, 610, 9, `N° dossier : ${data.patientNumber}`),
    pdfTextAt(65, 594, 9, patientBirthDate),
    pdfTextAt(65, 578, 9, patientAddress),
    "0.45 0.35 0.85 rg", "50 548 495 1 re", "f",
    pdfTextAt(60, 524, 12, "PRESCRIPTION"),
    pdfTextAt(60, 504, 9, `Date : ${data.date}`),
    pdfTextAt(310, 504, 9, `Ordonnance n° : ${prescriptionNumber}`),
    pdfTextAt(60, 482, 9, "DCI, dosage, forme, voie, posologie et duree :"),
    ...medicineRows.map((line, index) => pdfTextAt(72, 458 - (index * 17), 10, `${index + 1}. ${line}`)),
    "0.88 0.89 0.93 RG", "1 w", "50 190 495 105 re", "S",
    pdfTextAt(65, 270, 11, "CONSEILS ET PRECAUTIONS"),
    ...adviceRows.map((line, index) => pdfTextAt(65, 248 - (index * 16), 9, line.trim())),
    pdfTextAt(350, 156, 10, "Signature et cachet du praticien"),
    "0.88 0.89 0.93 RG", "1 w", "345 70 185 75 re", "S",
    pdfTextAt(50, 42, 8, "Document genere par DentaFlow - A verifier, signer et cacheter par le praticien avant remise au patient.", "0.35 0.38 0.45 rg"),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

const upperTeeth = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const lowerTeeth = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const clinicalStatuses = ["Sain", "Carie", "Obturation", "Couronne", "Bridge", "Implant", "Endodontie", "Extraction", "Absente", "Planifié", "Prothèse", "Facette", "Fracture", "Mobilité", "Infection", "Autre"];
const statusKeys: Record<string, string> = {
  Sain: "status.healthy", Carie: "status.cavity", Obturation: "status.filling", Couronne: "status.crown",
  Bridge: "status.bridge", Implant: "status.implant", Endodontie: "status.endodontics", Extraction: "status.extraction",
  Absente: "status.missing", Planifié: "status.planned", Prothèse: "status.prosthesis", Facette: "status.facet",
  Fracture: "status.fracture", Mobilité: "status.mobility", Infection: "status.infection", Autre: "status.other",
};
type OdontogramView = "initial" | "current" | "completed" | "planned";
const completedStatuses = new Set(["Obturation", "Couronne", "Bridge", "Implant", "Endodontie", "Extraction", "Absente", "Facette"]);
const plannedStatuses = new Set(["Planifié", "Prothèse"]);
const statusColors: Record<string, string> = {
  Sain: "border-line text-slate-400",
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
const statusDotColors: Record<string, string> = {
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

type ToothKind = "incisor" | "canine" | "premolar" | "molar";

function toothKind(number: number): ToothKind {
  const position = number % 10;
  if (position <= 2) return "incisor";
  if (position === 3) return "canine";
  if (position <= 5) return "premolar";
  return "molar";
}

function ToothShape({ kind }: { kind: ToothKind }) {
  const paths = {
    incisor: "M8 2.5C5.2 2.5 3.5 4.3 3.8 7.1c.3 2.8 1.2 4.4 1.1 7.5-.1 4.3.8 8.9 2.8 8.9 1.8 0 1.4-5.1 2.3-8.1.9 3 .5 8.1 2.3 8.1 2 0 2.9-4.6 2.8-8.9-.1-3.1.8-4.7 1.1-7.5.3-2.8-1.4-4.6-4.2-4.6-1.5 0-2.2.8-3.1.8S9.5 2.5 8 2.5Z",
    canine: "M8.2 2.4C5 2.4 3.2 4.6 3.8 7.8c.6 3.1 1.8 4.5 1.6 8.5-.2 4.7.4 7.2 2.2 7.2 2.1 0 1.7-5.8 2.4-10.5.7 4.7.3 10.5 2.4 10.5 1.8 0 2.4-2.5 2.2-7.2-.2-4 1-5.4 1.6-8.5.6-3.2-1.2-5.4-4.4-5.4-1.5 0-1.4.9-2.2.9s-.7-.9-2.2-.9Z",
    premolar: "M6.8 2.8C4.1 2.8 2.9 4.8 3.7 7.5c.7 2.5 1.4 4 1.2 7.7-.2 4.3.7 8.3 2.7 8.3 1.5 0 1.7-3.5 2.4-6.4.7 2.9.9 6.4 2.4 6.4 2 0 2.9-4 2.7-8.3-.2-3.7.5-5.2 1.2-7.7.8-2.7-.4-4.7-3.1-4.7-1.6 0-2.1.8-3.2.8s-1.6-.8-3.2-.8Z",
    molar: "M6.1 2.9C3.2 2.9 2.5 5.2 3.2 7.8c.6 2.2.8 4.1.8 7.5.1 4.6.6 8.2 2.7 8.2 1.7 0 1.8-3.5 3.3-5.8 1.5 2.3 1.6 5.8 3.3 5.8 2.1 0 2.6-3.6 2.7-8.2 0-3.4.2-5.3.8-7.5.7-2.6 0-4.9-2.9-4.9-1.8 0-2.4.8-3.9.8s-2.1-.8-3.9-.8Z",
  } as const;

  return (
    <svg viewBox="0 0 20 24" aria-hidden="true" className="mb-1 h-8 w-6 fill-[#fbfdff] stroke-current stroke-[1.05]">
      <path d={paths[kind]} />
      {kind === "molar" && <path d="M5.6 7.2c1-.9 2-.8 2.8.2.8-1 1.8-1.1 2.8-.2M5.7 9.5c1-.7 2.2-.7 3.3.1 1.1-.8 2.3-.8 3.3-.1M7 12.2c.8-.6 1.3-.6 2 0 .7-.6 1.2-.6 2 0" />}
      {kind === "premolar" && <path d="M6.4 7.5c.8-.8 1.6-.7 2.3.1.7-.8 1.5-.9 2.3-.1M7 10c.8-.6 1.7-.6 2.7 0" />}
    </svg>
  );
}

function Tooth({ number, selected, status = "Sain", onClick }: { number: number; selected?: boolean; status?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Dent ${number}`} className={`relative flex h-16 w-12 flex-col items-center justify-center rounded-xl border bg-white text-xs transition ${selected ? "border-accent text-accent shadow-[0_0_0_2px_rgba(108,92,231,0.15)]" : status !== "Sain" ? statusColors[status] : "border-line text-slate-400 hover:border-accent"}`}>
      <ToothShape kind={toothKind(number)} />
      <span>{number}</span>
      {status !== "Sain" && <span aria-label={`État : ${status}`} className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${statusDotColors[status] ?? "bg-slate-400"}`} />}
    </button>
  );
}

type Props = { patient: PatientDetail; canArchive: boolean };
type Treatment = {
  id: number;
  phase: string;
  treatment: string;
  teeth: string | null;
  amount: string | number;
  status: "À faire" | "En cours" | "Terminé";
  dentist: string;
  plannedDate: string;
};

export function PatientDetailView({ patient: p, canArchive }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [odontogramOpen, setOdontogramOpen] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [toothStatus, setToothStatus] = useState("Sain");
  const [toothNote, setToothNote] = useState("");
  const [toothStates, setToothStates] = useState<Record<number, { initialStatus: string; initialNote: string; currentStatus: string; currentNote: string }>>({});
  const [savingTooth, setSavingTooth] = useState(false);
  const [odontogramView, setOdontogramView] = useState<OdontogramView>("current");
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [prescription, setPrescription] = useState({
    date: new Date().toISOString().slice(0, 10),
    prescriptionNumber: "",
    practitioner: "",
    registrationNumber: "",
    practitionerAddress: "",
    practitionerPhone: "",
    medicines: "",
    instructions: "",
  });
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [treatmentForm, setTreatmentForm] = useState({
    phase: "Phase 1", treatment: "", teeth: "", amount: "", status: "À faire" as Treatment["status"],
    dentist: "Praticien", plannedDate: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Compte praticien introuvable.");
        return payload as { user?: { name?: string } };
      })
      .then(({ user }) => {
        if (user?.name) {
          setPrescription((current) => ({ ...current, practitioner: current.practitioner || user.name || "" }));
        }
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Chargement du compte praticien impossible.");
      });
  }, []);

  useEffect(() => {
    fetch(`/api/patients/${p.id}/odontogram`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement de l'odontogramme impossible.");
        return response.json() as Promise<{ data: Array<{ toothNumber: number; initialStatus: string; initialNote: string | null; currentStatus: string; currentNote: string | null }> }>;
      })
      .then(({ data }) => {
        setToothStates(Object.fromEntries(data.map((item) => [item.toothNumber, {
          initialStatus: item.initialStatus,
          initialNote: item.initialNote ?? "",
          currentStatus: item.currentStatus,
          currentNote: item.currentNote ?? "",
        }])));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Chargement de l'odontogramme impossible."));
  }, [p.id]);

  useEffect(() => {
    fetch(`/api/patients/${p.id}/treatments`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement du plan de traitement impossible.");
        return response.json() as Promise<{ data: Treatment[] }>;
      })
      .then(({ data }) => setTreatments(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Chargement du plan impossible."));
  }, [p.id]);

  function selectTooth(tooth: number) {
    const state = toothStates[tooth] ?? {
      initialStatus: "Sain",
      initialNote: "",
      currentStatus: "Sain",
      currentNote: "",
    };
    setSelectedTooth(tooth);
    setToothStatus(odontogramView === "initial" ? state.initialStatus : state.currentStatus);
    setToothNote(odontogramView === "initial" ? state.initialNote : state.currentNote);
    setSuccess("");
  }

  function displayedStatus(tooth: number) {
    const state = odontogramView === "initial"
      ? toothStates[tooth]?.initialStatus
      : toothStates[tooth]?.currentStatus;
    if (!state) return undefined;
    if (odontogramView === "completed" && !completedStatuses.has(state)) return undefined;
    if (odontogramView === "planned" && !plannedStatuses.has(state)) return undefined;
    return state;
  }

  function changeOdontogramView(view: OdontogramView) {
    setOdontogramView(view);
    if (!selectedTooth) return;
    const state = toothStates[selectedTooth];
    if (!state) return;
    if (view === "initial") {
      setToothStatus(state.initialStatus);
      setToothNote(state.initialNote);
    } else {
      setToothStatus(state.currentStatus);
      setToothNote(state.currentNote);
    }
  }

  async function saveToothState() {
    if (!selectedTooth) return;
    setSavingTooth(true);
    try {
      const response = await fetch(`/api/patients/${p.id}/odontogram`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toothNumber: selectedTooth,
          status: toothStatus,
          note: toothNote,
          view: odontogramView === "initial" ? "initial" : "current",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setToothStates((current) => {
        const previous = current[selectedTooth];
        return {
          ...current,
          [selectedTooth]: previous
            ? odontogramView === "initial"
              ? { ...previous, initialStatus: toothStatus, initialNote: toothNote }
              : { ...previous, currentStatus: toothStatus, currentNote: toothNote }
            : { initialStatus: toothStatus, initialNote: toothNote, currentStatus: toothStatus, currentNote: toothNote },
        };
      });
      setSuccess(`État « ${toothStatus} » enregistré pour la dent ${selectedTooth} (${odontogramView === "initial" ? "initial" : "actuel"}).`);
      setOdontogramOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
    } finally {
      setSavingTooth(false);
    }
  }
  const age = ageFromBirthDate(p.dateOfBirth);
  const flags = [
    p.diabetes ? "Diabète" : "",
    p.hypertension ? "Hypertension" : "",
    p.anticoagulants ? "Anticoagulants" : "",
    p.pregnancyStatus === "Oui" ? "Grossesse" : "",
  ].filter(Boolean);
  const precautions = flags.length > 0 ? flags.join(" · ") : "Aucune précaution signalée";

  async function archive() {
    if (!confirm(`Archiver le dossier de ${p.firstName} ${p.lastName} ? Il disparaîtra des listes.`)) return;
    try {
      await archivePatient(p.id);
      router.push("/patients");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archivage impossible.");
    }
  }

  async function saveTreatment(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setSavingTreatment(true);
      try {
        const response = await fetch(`/api/patients/${p.id}/treatments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...treatmentForm, amount: Number(treatmentForm.amount || 0) }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Enregistrement du traitement impossible.");
        const refreshed = await fetch(`/api/patients/${p.id}/treatments`);
        const result = await refreshed.json() as { data: Treatment[] };
        setTreatments(result.data);
        setTreatmentOpen(false);
        setTreatmentForm({ phase: "Phase 1", treatment: "", teeth: "", amount: "", status: "À faire", dentist: "Praticien", plannedDate: new Date().toISOString().slice(0, 10) });
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Enregistrement du traitement impossible.");
      } finally {
        setSavingTreatment(false);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-sm font-bold text-accent">{initials(p.firstName, p.lastName)}</span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink">{p.firstName} {p.lastName}</h1>
            <p className="text-sm text-slate-500">{p.patientNumber} · {p.sex ?? "Patient"}{age !== null ? ` · ${age} ans` : ""} · {p.city ?? "—"}</p>
            <p className="mt-1 text-[12px] text-slate-700">☎ {p.phone} · Né(e) le {p.dateOfBirth ? formatDate(p.dateOfBirth) : "—"} · CIN {p.nationalId ?? "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={<Icon name="edit" size={14} />} onClick={() => setEditing(true)}>{t("common.edit")}</ActionButton>
          <ActionButton icon={<Icon name="stethoscope" size={14} />}>{t("patient.consultation")}</ActionButton>
          <ActionButton icon={<Icon name="calendar" size={14} />}>{t("patient.appointment")}</ActionButton>
          <ActionButton icon={<Icon name="file" size={14} />} onClick={() => setPrescriptionOpen(true)}>Ordonnance</ActionButton>
          <Button variant="primary" className="px-3 py-2 text-sm"><Icon name="creditCard" size={14} /> {t("patient.payment")}</Button>
          {canArchive && <Button variant="danger" className="px-3 py-2 text-sm" onClick={archive}>{t("patient.archive")}</Button>}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      {success && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-start justify-between">
              <div><h2 className="text-base font-bold text-ink">{t("patient.medicalInfo")}</h2><p className="text-xs text-slate-400">{t("patient.confidential")}</p></div>
              <Button className="px-2.5 py-1.5 text-xs" onClick={() => setEditing(true)}>{t("patient.openRecord")}</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Allergies médicamenteuses" value={p.allergies || "Aucune allergie connue"} />
              <Info label="Maladies / antécédents dentaires" value={p.chronicConditions || "Aucune"} />
              <Info label="Médicaments en cours" value={p.medications || "À confirmer par le praticien"} />
              <Info label="Précautions cliniques" value={precautions} />
              <Info label="Personne à contacter" value={p.emergencyContact || p.phone} />
              <Info label="Profession / situation familiale" value={[p.profession, p.maritalStatus].filter(Boolean).join(" · ") || "—"} />
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-start justify-between">
              <div><h2 className="text-base font-bold text-ink">{t("patient.odontogram")}</h2><p className="text-xs text-slate-400">{t("patient.permanentDentition")}</p></div>
              <button type="button" onClick={() => setOdontogramOpen(true)} className="text-xs font-semibold text-accent">{t("patient.viewAll")}</button>
            </div>
            <div className="rounded-lg border border-line bg-slate-50/60 px-3 py-4">
              <div className="flex flex-wrap justify-center gap-1.5">{upperTeeth.map((tooth) => <Tooth key={tooth} number={tooth} status={toothStates[tooth]?.currentStatus} selected={tooth === selectedTooth} onClick={() => selectTooth(tooth)} />)}</div>
              <div className="my-3 border-t border-dashed border-line" />
              <div className="flex flex-wrap justify-center gap-1.5">{lowerTeeth.map((tooth) => <Tooth key={tooth} number={tooth} status={toothStates[tooth]?.currentStatus} selected={tooth === selectedTooth} onClick={() => selectTooth(tooth)} />)}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Carie</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400" />Obturation</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Couronne</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Planifié</span>
            </div>
          </Card>

          <Card className="min-h-51.25">
            <div className="flex items-start justify-between">
              <div><h2 className="text-base font-bold text-ink">Plan de traitement</h2><p className="text-xs text-slate-400">Étapes de soins actives</p></div>
              <button type="button" onClick={() => setTreatmentOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-accent"><Icon name="plus" size={12} /> Ajouter</button>
            </div>
            <div className="mt-3 h-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-accent" style={{ width: `${treatments.length ? Math.round((treatments.filter((item) => item.status === "Terminé").length / treatments.length) * 100) : 0}%` }} /></div>
            <p className="mt-2 text-xs text-slate-400">{treatments.length ? `${Math.round((treatments.filter((item) => item.status === "Terminé").length / treatments.length) * 100)}% du plan terminé` : "0% du plan terminé"}</p>
            {treatments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-7 text-center">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name="search" size={16} /></span>
                <p className="text-xs font-semibold text-slate-400">Aucun traitement planifié</p>
                <p className="text-xs text-slate-400">Ajoutez une étape au plan de soins.</p>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {treatments.map((item) => (
                  <div key={item.id} className="grid items-center gap-3 py-3 text-xs sm:grid-cols-[1fr_auto_auto_auto]">
                    <div><p className="font-semibold text-ink">{item.treatment}</p><p className="text-slate-400">{item.phase}{item.teeth ? ` · Dent(s) ${item.teeth}` : ""} · {item.dentist}</p></div>
                    <span className={`rounded-full px-3 py-1 text-center ${item.status === "Terminé" ? "bg-emerald-50 text-emerald-600" : item.status === "En cours" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>● {item.status}</span>
                    <span className="text-slate-500">{formatMoney(Number(item.amount))}</span>
                    <span className="text-slate-500">{formatDate(item.plannedDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <div className="flex items-start justify-between"><div><h2 className="text-base font-bold text-ink">Finances</h2><p className="text-xs text-slate-400">Synthèse des factures enregistrées</p></div><Icon name="plus" size={16} className="text-slate-400" /></div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Info label="Total facturé" value="0 DT" /><Info label="Payé" value="0 DT" /><Info label="Reste" value={<span className="text-amber-600">{formatMoney(Number(p.balance))}</span>} />
            </div>
          </Card>
          <Card>
            <div className="flex items-start justify-between"><div><h2 className="text-base font-bold text-ink">Historique du patient</h2><p className="text-xs text-slate-400">Parcours médical et administratif</p></div><button type="button" className="text-xs font-semibold text-accent">Tout voir</button></div>
            <div className="mt-4 flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent ring-4 ring-accent/10" /><div><p className="text-sm font-semibold text-ink">Rendez-vous</p><p className="text-xs text-slate-400">{p.lastVisit ? formatDate(p.lastVisit) : "Aucun rendez-vous enregistré"} · Consultation · Arrivé</p></div></div>
          </Card>
          <Card>
            <h2 className="text-base font-bold text-ink">Coordonnées</h2><p className="text-xs text-slate-400">Informations administratives</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><Info label="E-mail" value={p.email} /><Info label="Adresse" value={[p.address, p.city, p.governorate].filter(Boolean).join(", ")} /></div>
            <div className="mt-2 flex gap-2"><Button className="px-2.5 py-1.5 text-xs"><Icon name="message" size={12} /> WhatsApp</Button><Button className="px-2.5 py-1.5 text-xs"><Icon name="send" size={12} /> Rappeler SMS</Button></div>
          </Card>
        </div>
      </div>

      {treatmentOpen && (
        <Modal title="Ajouter au plan de traitement" onClose={() => setTreatmentOpen(false)}>
          <form onSubmit={saveTreatment}>
            <p className="mb-4 text-sm text-slate-500">Ajoutez une étape au plan de traitement du patient.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-500">Patient
                <input value={`${p.firstName} ${p.lastName} · ${p.patientNumber}`} disabled className="mt-1 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-500" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Phase
                <select value={treatmentForm.phase} onChange={(event) => setTreatmentForm((current) => ({ ...current, phase: event.target.value }))} className="mt-1 w-full rounded-lg border border-accent bg-white px-3 py-2.5 text-sm outline-none">
                  <option>Phase 1</option><option>Phase 2</option><option>Phase 3</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">Acte / traitement *
                <input required value={treatmentForm.treatment} onChange={(event) => setTreatmentForm((current) => ({ ...current, treatment: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Dent(s) concernée(s)
                <input value={treatmentForm.teeth} onChange={(event) => setTreatmentForm((current) => ({ ...current, teeth: event.target.value }))} placeholder="Ex. 16, 26" className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Montant (DT) *
                <input required type="number" min="0" step="0.001" value={treatmentForm.amount} onChange={(event) => setTreatmentForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Statut
                <select value={treatmentForm.status} onChange={(event) => setTreatmentForm((current) => ({ ...current, status: event.target.value as Treatment["status"] }))} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option>À faire</option><option>En cours</option><option>Terminé</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">Praticien
                <input value={treatmentForm.dentist} onChange={(event) => setTreatmentForm((current) => ({ ...current, dentist: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Date prévue
                <input required type="date" value={treatmentForm.plannedDate} onChange={(event) => setTreatmentForm((current) => ({ ...current, plannedDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" onClick={() => setTreatmentOpen(false)}>Annuler</Button>
              <Button type="submit" variant="primary" disabled={savingTreatment}><Icon name="check" size={16} /> {savingTreatment ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {odontogramOpen && (
        <Modal title="Odontogramme" wide onClose={() => setOdontogramOpen(false)}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">Odontogramme</h3>
                <p className="text-sm text-slate-500">Dentition FDI · sélectionnez une dent pour actualiser son état clinique.</p>
              </div>
              <div className="flex gap-2">
                <Button className="text-xs"><Icon name="print" size={14} /> Imprimer / PDF</Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
              <span className="text-sm text-slate-500">Patient :</span>
              <span className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink">{p.firstName} {p.lastName} - {p.patientNumber}</span>
              <div className="flex flex-wrap gap-1 rounded-lg bg-slate-50 p-1 text-xs">
                {([
                  ["initial", "Initiale"],
                  ["current", "Actuelle"],
                  ["completed", "Traitements réalisés"],
                  ["planned", "Traitements planifiés"],
                ] as const).map(([value]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => changeOdontogramView(value)}
                    className={`rounded-md px-3 py-1.5 ${odontogramView === value ? "bg-white font-semibold text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`}
                  >
                    {value === "initial" ? t("patient.initial") : value === "current" ? t("patient.current") : value === "completed" ? t("patient.completed") : t("patient.planned")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
              <Card className="p-4!">
                <div className="mb-3 flex items-start justify-between">
                  <div><h4 className="font-bold text-ink">Odontogramme · {p.firstName} {p.lastName}</h4><p className="text-xs text-slate-400">Dentition permanente · Numérotation FDI</p></div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">● FDI</span>
                </div>
                <div className="rounded-lg border border-line bg-slate-50/60 px-3 py-6">
                  <div className="flex flex-wrap justify-center gap-2">{upperTeeth.map((tooth) => <Tooth key={tooth} number={tooth} status={tooth === selectedTooth ? toothStatus : displayedStatus(tooth)} selected={tooth === selectedTooth} onClick={() => selectTooth(tooth)} />)}</div>
                  <div className="my-5 border-t border-dashed border-line" />
                  <div className="flex flex-wrap justify-center gap-2">{lowerTeeth.map((tooth) => <Tooth key={tooth} number={tooth} status={tooth === selectedTooth ? toothStatus : displayedStatus(tooth)} selected={tooth === selectedTooth} onClick={() => selectTooth(tooth)} />)}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Carie</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400" />Obturation / implant</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Couronne / bridge</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Planifié</span>
                </div>
                <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">ⓘ L&apos;odontogramme est un support de saisie clinique. Les observations restent sous la responsabilité du praticien.</p>
              </Card>

              <Card className="p-4!">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-ink">Dent {selectedTooth ?? "—"}</h4>
                    <p className="text-xs text-slate-500">
                      {selectedTooth
                        ? `${odontogramView === "initial" ? t("patient.initial") : t("patient.current")} : ${t(statusKeys[toothStatus] ?? toothStatus)}`
                        : "Aucune dent sélectionnée"}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-600">● FDI</span>
                </div>
                <div className="mt-5 flex items-center gap-3 border-b border-line pb-4">
                  <div className="rounded-lg border border-line p-2">
                    {selectedTooth ? <ToothShape kind={toothKind(selectedTooth)} /> : <div className="h-8 w-6" />}
                    <span className="block text-center text-[10px] text-slate-500">{selectedTooth ?? "—"}</span>
                  </div>
                  <div><p className="text-sm font-semibold text-ink">{t("patient.selectedTooth")}</p><p className="text-xs text-slate-500">Cliquez une autre dent pour modifier sa fiche.</p></div>
                </div>
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <h5 className="mb-2 text-sm font-bold text-ink">{t("patient.clinicalStatus")}</h5>
                  <div className="flex flex-wrap gap-2">
                    {clinicalStatuses.map((status) => (
                      <button type="button" key={status} onClick={() => setToothStatus(status)} className={`rounded-md border px-2 py-1 text-xs ${toothStatus === status ? `${statusColors[status]} font-semibold` : "border-line bg-white text-slate-500 hover:border-accent"}`}>{t(statusKeys[status])}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <h5 className="text-sm font-bold text-ink">Informations associées</h5>
                  <p className="mt-1 text-xs text-slate-500">Rattachez une observation au dossier de cette dent.</p>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">{t("patient.clinicalNote")}</label>
                  <textarea value={toothNote} onChange={(event) => setToothNote(event.target.value)} disabled={!selectedTooth} placeholder={selectedTooth ? `Observation sur la dent ${selectedTooth}...` : "Sélectionnez une dent..."} className="mt-1 min-h-24 w-full rounded-lg border border-line p-3 text-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-slate-50" />
                  <Button variant="primary" className="mt-2 text-xs" disabled={!selectedTooth || savingTooth} onClick={saveToothState}><Icon name="check" size={14} /> {savingTooth ? t("form.saving") : `${t("common.save")} ${odontogramView === "initial" ? t("patient.initial").toLowerCase() : t("patient.current").toLowerCase()}`}</Button>
                </div>
              </Card>
            </div>
          </div>
        </Modal>
      )}
      {prescriptionOpen && (
        <Modal title="Modèle d’ordonnance" wide onClose={() => setPrescriptionOpen(false)}>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (!prescription.practitioner.trim() || !prescription.registrationNumber.trim() || !prescription.medicines.trim()) {
              setError("L’ordonnance doit comporter le praticien, son numéro d’inscription et au moins un médicament détaillé.");
              return;
            }
            // Les lignes sont préparées séparément afin de garder un modèle lisible
            // et de permettre au praticien de modifier les médicaments avant export.
            // URL.createObjectURL expose temporairement le Blob comme un fichier local.
            // L'élément <a> déclenche le téléchargement sans envoyer les données au serveur.
            const url = URL.createObjectURL(buildPrescriptionPdf({
              practitioner: prescription.practitioner,
              registrationNumber: prescription.registrationNumber,
              practitionerAddress: prescription.practitionerAddress,
              practitionerPhone: prescription.practitionerPhone,
              prescriptionNumber: prescription.prescriptionNumber,
              date: prescription.date,
              patientName: `${p.firstName} ${p.lastName}`,
              patientNumber: p.patientNumber,
              patientBirthDate: p.dateOfBirth ?? "",
              patientAddress: p.address || p.city || "",
              medicines: prescription.medicines,
              instructions: prescription.instructions,
            }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `ordonnance-${p.patientNumber}.pdf`;
            anchor.click();
            URL.revokeObjectURL(url);
            setSuccess("L’ordonnance PDF a été téléchargée.");
            setPrescriptionOpen(false);
          }}>
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">Ce modèle est un support de rédaction. Le praticien doit vérifier la prescription, compléter les mentions professionnelles et signer/cacheter le document avant remise au patient.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-500">Date de prescription<input type="date" className="input mt-1" value={prescription.date} onChange={(event) => setPrescription((current) => ({ ...current, date: event.target.value }))} required /></label>
              <label className="text-xs font-semibold text-slate-500">Numéro d’ordonnance<input className="input mt-1" value={prescription.prescriptionNumber} onChange={(event) => setPrescription((current) => ({ ...current, prescriptionNumber: event.target.value }))} placeholder="Généré si vide" /></label>
              <label className="text-xs font-semibold text-slate-500">Nom et prénom du praticien<input className="input mt-1" value={prescription.practitioner} onChange={(event) => setPrescription((current) => ({ ...current, practitioner: event.target.value }))} required /></label>
              <label className="text-xs font-semibold text-slate-500">N° d’inscription à l’Ordre<input className="input mt-1" value={prescription.registrationNumber} onChange={(event) => setPrescription((current) => ({ ...current, registrationNumber: event.target.value }))} required /></label>
              <label className="text-xs font-semibold text-slate-500">Adresse professionnelle<input className="input mt-1" value={prescription.practitionerAddress} onChange={(event) => setPrescription((current) => ({ ...current, practitionerAddress: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-500">Téléphone professionnel<input className="input mt-1" value={prescription.practitionerPhone} onChange={(event) => setPrescription((current) => ({ ...current, practitionerPhone: event.target.value }))} /></label>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong>Patient :</strong> {p.firstName} {p.lastName} · {p.patientNumber} · Né(e) le {p.dateOfBirth || "à compléter"} · {p.address || p.city || "Adresse à compléter"}</div>
            <label className="block text-xs font-semibold text-slate-500">Prescription détaillée<textarea className="input mt-1 min-h-32 resize-y" value={prescription.medicines} onChange={(event) => setPrescription((current) => ({ ...current, medicines: event.target.value }))} placeholder="Une ligne par médicament : DCI, dosage, forme, voie, posologie et durée." required /></label>
            <label className="block text-xs font-semibold text-slate-500">Conseils et précautions<textarea className="input mt-1 min-h-20 resize-y" value={prescription.instructions} onChange={(event) => setPrescription((current) => ({ ...current, instructions: event.target.value }))} placeholder="Allergies, précautions, consignes de suivi..." /></label>
            <div className="flex justify-end gap-2"><Button type="button" onClick={() => setPrescriptionOpen(false)}>Annuler</Button><Button variant="primary" type="submit"><Icon name="download" size={14} /> Télécharger le PDF</Button></div>
          </form>
        </Modal>
      )}

      {editing && <Modal title={t("patient.edit")} wide onClose={() => setEditing(false)}><PatientForm patient={p} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} /></Modal>}
    </>
  );
}
