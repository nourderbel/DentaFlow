"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SearchableInput } from "@/components/ui/SearchableInput";
import { ToothPicker } from "@/components/ui/ToothPicker";
import { ageFromBirthDate } from "@/lib/dates";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { archivePatient, createPatientPrescription, fetchPatientPrescriptions, type PatientPrescription } from "../api";
import type { PatientDetail } from "../types";
import { PatientForm } from "./PatientForm";
import { dentalActCatalog } from "@/features/quotes/dentalActCatalog";

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
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  clinicEmail?: string;
  practitioner: string;
  registrationNumber: string;
  practitionerAddress: string;
  practitionerPhone: string;
  prescriptionNumber: string;
  date: string;
  patientName: string;
  patientNumber: string;
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
  const clinicContactLines = [data.clinicAddress, data.clinicPhone, data.clinicEmail].filter((line): line is string => Boolean(line));
  const medicineRows = medicineLines.slice(0, 12);
  const adviceRows = (data.instructions || "Aucune consigne particuliere.").match(/.{1,56}(\s|$)/g)?.slice(0, 4) ?? [];
  const content = [
    "q", "0.45 0.35 0.85 rg", "0 520 420 75 re", "f", "Q",
    pdfTextAt(35, 578, 18, data.clinicName || "DentaClinic", "1 1 1 rg"),
    pdfTextAt(35, 561, 9, "CABINET DENTAIRE - ORDONNANCE", "1 1 1 rg"),
    ...clinicContactLines.map((line, index) => pdfTextAt(35, 546 - (index * 11), 8.5, line, "1 1 1 rg")),
    pdfTextAt(30, 505, 16, "ORDONNANCE"),
    pdfTextAt(30, 485, 9.5, `Praticien : ${data.practitioner}`),
    pdfTextAt(30, 471, 9.5, `N° d'inscription à l'Ordre : ${data.registrationNumber}`),
    "0.88 0.89 0.93 RG", "1 w", "30 410 360 42 re", "S",
    pdfTextAt(40, 437, 10, "PATIENT"),
    pdfTextAt(40, 420, 9.5, patientName),
    "0.45 0.35 0.85 rg", "30 397 360 1 re", "f",
    pdfTextAt(30, 378, 12, "PRESCRIPTION"),
    pdfTextAt(30, 360, 9, `Date : ${data.date}`),
    pdfTextAt(220, 360, 9, `Ordonnance n° : ${prescriptionNumber}`),
    pdfTextAt(30, 342, 9, "DCI, dosage, forme, voie, posologie et duree :"),
    ...medicineRows.map((line, index) => pdfTextAt(38, 325 - (index * 11), 9, `${index + 1}. ${line}`)),
    "0.88 0.89 0.93 RG", "1 w", "30 120 360 75 re", "S",
    pdfTextAt(40, 178, 10, "CONSEILS ET PRECAUTIONS"),
    ...adviceRows.map((line, index) => pdfTextAt(40, 162 - (index * 11), 8.5, line.trim())),
    "0.88 0.89 0.93 RG", "1 w", "30 30 174 75 re", "S", "216 30 174 75 re", "S",
    pdfTextAt(40, 88, 9.5, "Signature du praticien"),
    pdfTextAt(226, 88, 9.5, "Cachet du cabinet"),
    pdfTextAt(30, 15, 5.5, "Document genere par DentaClinic - A verifier, signer et cacheter par le praticien avant remise au patient.", "0.35 0.38 0.45 rg"),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
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

function downloadPrescriptionPdf(data: PrescriptionPdfData) {
  const url = URL.createObjectURL(buildPrescriptionPdf(data));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ordonnance-${data.patientNumber}-${data.date}.pdf`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPrescriptionPdf(data: PrescriptionPdfData) {
  const url = URL.createObjectURL(buildPrescriptionPdf(data));
  const tab = window.open(url, "_blank");
  if (!tab) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
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
const patientFormControlClass = "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/10";
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

function ToothShape({ kind, inverted = false }: { kind: ToothKind; inverted?: boolean }) {
  const gradientId = useId();
  const artwork: Record<ToothKind, { crown: string; roots: string[]; grooves: string[] }> = {
    incisor: {
      crown: "M9 3.5C5.3 3.5 3.5 6.2 4.2 10.1c.6 3.7 2.2 6.1 4.4 8.1 1.4 1.2 2.5 1.6 5.4 1.6s4-.4 5.4-1.6c2.2-2 3.8-4.4 4.4-8.1.7-3.9-1.1-6.6-4.8-6.6-2.3 0-3.4 1.1-5 1.1s-2.7-1.1-5-1.1Z",
      roots: ["M8.6 17.3c1.5 1.5 3.2 2.1 5.4 2.1s3.9-.6 5.4-2.1c-1.1 7.1-2.5 16.3-4.1 28.3-.3 2.4-.9 3.7-1.4 3.7s-1.1-1.3-1.4-3.7c-1.4-10.4-2.7-20.7-3.9-28.3Z"],
      grooves: ["M7.2 8.2c2.5-1.6 4.4-1.1 6.8-.2 2.4-.9 4.3-1.4 6.8.2", "M10.4 22c1.1.5 2.3.6 3.6.6s2.5-.1 3.6-.6"],
    },
    canine: {
      crown: "M10.1 3.2c-4.5 0-6.7 3-5.5 7.4 1 3.8 3 6.6 6.4 8.7 1 .6 2 .9 3 .9s2-.3 3-.9c3.4-2.1 5.4-4.9 6.4-8.7 1.2-4.4-1-7.4-5.5-7.4-1.8 0-2.8.7-3.9 2-1.1-1.3-2.1-2-3.9-2Z",
      roots: ["M8.2 17.2c1.6 1.6 3.6 2.5 5.8 2.5s4.2-.9 5.8-2.5c-1.5 8.1-3.1 18.1-5 30.1-.2 1.4-.5 2.1-.8 2.1s-.6-.7-.8-2.1c-1.9-12-3.5-22-5-30.1Z"],
      grooves: ["M8.2 8c2.1 1.1 3.8 1.2 5.8 1.2s3.7-.1 5.8-1.2", "M11.1 22c.9.3 1.9.5 2.9.5s2-.2 2.9-.5"],
    },
    premolar: {
      crown: "M8.2 3.7c-4 0-5.7 2.8-4.5 6.5 1.1 3.4 2.5 5.8 5.1 7.7 1.4 1 2.6 1.5 5.2 1.5s3.8-.5 5.2-1.5c2.6-1.9 4-4.3 5.1-7.7 1.2-3.7-.5-6.5-4.5-6.5-2.2 0-3.8 1.3-5.4 2.6-1.6-1.3-3.2-2.6-5.4-2.6Z",
      roots: [
        "M8.1 17c1.2 1.5 2.6 2.3 4.8 2.5-.2 7.1-1.3 15.2-2.8 25.3-.3 2.3-.8 3.4-1.3 3.4s-.9-.8-1.1-2.3c-1.2-10.2-.7-20.6.4-28.9Z",
        "M15.1 19.5c2.2-.2 3.6-1 4.8-2.5 1.1 8.3 1.6 18.7.4 28.9-.2 1.5-.6 2.3-1.1 2.3s-1-.1-1.3-2.4c-1.5-10.1-2.6-19.2-2.8-26.3Z",
      ],
      grooves: ["M7 8c2.4.8 4.2 1.7 5.8 3.1 1.6-1.4 3.4-2.3 5.8-3.1", "M10.2 21c1.8.5 3.8.5 5.6 0"],
    },
    molar: {
      crown: "M7.3 3.6c-4.3-.5-6.2 2.5-5.2 6.4.8 3.1 1.6 5.8 3.4 7.8 1.5 1.7 3.1 2.1 5 1.6 1.3-.4 2.2-1.3 3.5-1.3s2.2.9 3.5 1.3c1.9.5 3.5.1 5-1.6 1.8-2 2.6-4.7 3.4-7.8 1-3.9-.9-6.9-5.2-6.4-2.4.3-4.6 1.4-6.7 2.9-2.1-1.5-4.3-2.6-6.7-2.9Z",
      roots: [
        "M5.2 16.3c1.5 2.1 3.1 2.9 5.6 2.2.7 8.8-.6 17.6-2.8 27.8-.4 1.8-1.1 2.7-1.8 2.5-.6-.2-.8-1.1-.8-2.8-.2-10.6-.5-20.3-.2-29.7Z",
        "M13 18.6c.6-.4 1-.8 1.5-.8s.9.4 1.5.8c.2 8.2-.2 16.6-.9 27.1-.1 1.8-.3 2.7-.6 2.7s-.5-.9-.6-2.7c-.7-10.5-1.1-18.9-.9-27.1Z",
        "M18.2 18.5c2.5.7 4.1-.1 5.6-2.2.3 9.4 0 19.1-.2 29.7 0 1.7-.2 2.6-.8 2.8-.7.2-1.4-.7-1.8-2.5-2.2-10.2-3.5-19-2.8-27.8Z",
      ],
      grooves: ["M5.1 8c2.7 1.2 4.5 1.6 7.9 1.7M15 9.7c3.4-.1 5.2-.5 7.9-1.7", "M13 8.8v6.1", "M8 12.2c1.2-.8 2.3-.8 3.5 0M16.5 12.2c1.2-.8 2.3-.8 3.5 0"],
    },
  };
  const { crown, roots, grooves } = artwork[kind];

  return (
    <svg viewBox="0 0 28 52" aria-hidden="true" className="mb-1 h-10 w-7 drop-shadow-[0_1px_1px_rgba(51,65,85,0.16)]" style={{ transform: inverted ? "rotate(180deg)" : undefined }}>
      <defs>
        <linearGradient id={`${gradientId}-enamel`} x1="0" y1="0" x2="1" y2="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".48" stopColor="#fffef9" />
          <stop offset="1" stopColor="#d9e5e9" />
        </linearGradient>
        <linearGradient id={`${gradientId}-root`} x1="0" y1="0" x2="1" y2=".1">
          <stop offset="0" stopColor="#f1f4ed" />
          <stop offset=".5" stopColor="#fffdf5" />
          <stop offset="1" stopColor="#dce5e4" />
        </linearGradient>
      </defs>
      {roots.map((root, index) => (
        <path key={`root-${index}`} d={root} fill={`url(#${gradientId}-root)`} stroke="#aebdc2" strokeWidth=".7" strokeLinejoin="round" />
      ))}
      <path d={crown} fill={`url(#${gradientId}-enamel)`} stroke="#9cabb2" strokeWidth=".8" strokeLinejoin="round" />
      <path d={crown} fill="none" stroke="#fff" strokeWidth=".55" strokeDasharray="1 42" opacity=".9" />
      {grooves.map((groove, index) => (
        <path key={`groove-${index}`} d={groove} fill="none" stroke={index === 0 ? "#c6d0d1" : "#d6dede"} strokeWidth=".65" strokeLinecap="round" />
      ))}
      <path d="M9 19.2c2.9 1.1 7.1 1.1 10 0" fill="none" stroke="#b7c5c7" strokeWidth=".55" opacity=".8" />
    </svg>
  );
}

function Tooth({ number, selected, status = "Sain", onClick, inverted = false }: { number: number; selected?: boolean; status?: string; onClick?: () => void; inverted?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Dent ${number}`} className={`relative flex h-16 w-12 flex-col items-center justify-center rounded-xl border bg-white text-xs transition ${selected ? "border-accent text-accent shadow-[0_0_0_2px_rgba(108,92,231,0.15)]" : status !== "Sain" && Object.hasOwn(statusColors, status) ? statusColors[status] : "border-line text-slate-400 hover:border-accent"}`}>
      <ToothShape kind={toothKind(number)} inverted={inverted} />
      <span>{number}</span>
      {status !== "Sain" && <span aria-label={`État : ${status}`} className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${Object.hasOwn(statusDotColors, status) ? statusDotColors[status] : "bg-slate-400"}`} />}
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
const catalogActNames = new Set(dentalActCatalog.flatMap((group) => group.acts.map((act) => act.toLocaleLowerCase())));

type TreatmentFinance = {
  treatmentId: number;
  treatment: string;
  phase: string;
  teeth: string | null;
  treatmentDate: string | null;
  totalAgreed: string | number;
  totalPaid: string | number;
  remaining: string | number;
  financialStatus: "IMPAYE" | "PARTIELLEMENT_PAYE" | "PAYE";
};
type FinanceDetails = {
  payments: Array<{ id: number; amount: string | number; paymentDate: string; method: string; note: string | null; createdBy: number; createdByName: string | null }>;
  priceHistory: Array<{ id: number; oldAmount: string | number; newAmount: string | number; reason: string; changedBy: number; changedByName: string | null; changedAt: string }>;
};
type PractitionerOption = { id: number; name: string };
type AppointmentStatus = "PENDING" | "CONFIRMED" | "ARRIVED" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type PatientDocument = {
  id: number;
  category: "Analyse" | "Scanner / imagerie" | "Autre";
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

type PatientRecording = {
  id: number;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  label: string | null;
  createdAt: string;
};

function toMilli(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 1000) : 0;
}

export function PatientDetailView({ patient: p, canArchive }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentCategory, setDocumentCategory] = useState<PatientDocument["category"]>("Analyse");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [odontogramOpen, setOdontogramOpen] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [toothStatus, setToothStatus] = useState("Sain");
  const [customClinicalStatuses, setCustomClinicalStatuses] = useState<string[]>([]);
  const [addingClinicalStatus, setAddingClinicalStatus] = useState(false);
  const [customStatusDraft, setCustomStatusDraft] = useState("");
  const [savingClinicalStatus, setSavingClinicalStatus] = useState(false);
  const [clinicalStatusError, setClinicalStatusError] = useState("");
  const [toothNote, setToothNote] = useState("");
  const [toothStates, setToothStates] = useState<Record<number, { initialStatus: string; initialNote: string; currentStatus: string; currentNote: string }>>({});
  const [savingTooth, setSavingTooth] = useState(false);
  const [odontogramView, setOdontogramView] = useState<OdontogramView>("current");
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [treatmentOptions, setTreatmentOptions] = useState<string[]>([]);
  const additionalTreatmentOptions = treatmentOptions.filter((act) => !catalogActNames.has(act.toLocaleLowerCase()));
  const [practitionerOptions, setPractitionerOptions] = useState<string[]>([]);
  const [finances, setFinances] = useState<TreatmentFinance[]>([]);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [financeRole, setFinanceRole] = useState("");
  const [selectedFinance, setSelectedFinance] = useState<TreatmentFinance | null>(null);
  const [financeDetails, setFinanceDetails] = useState<FinanceDetails>({ payments: [], priceHistory: [] });
  const [financeDetailsLoading, setFinanceDetailsLoading] = useState(false);
  const [financeSaving, setFinanceSaving] = useState(false);
  const [financeError, setFinanceError] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "Espèces", note: "",
  });
  const [priceForm, setPriceForm] = useState({ totalAgreed: "", reason: "" });
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentError, setAppointmentError] = useState("");
  const [appointmentPractitioners, setAppointmentPractitioners] = useState<PractitionerOption[]>([]);
  const [appointmentPractitionersLoading, setAppointmentPractitionersLoading] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    type: "Consultation",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    durationMinutes: "30",
    dentistId: "",
    chairId: "Fauteuil 1",
    status: "PENDING" as AppointmentStatus,
    notes: "",
  });
  const [consultationOpen, setConsultationOpen] = useState(false);
  const [consultationSaving, setConsultationSaving] = useState(false);
  const [consultationError, setConsultationError] = useState("");
  const [consultationForm, setConsultationForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    reason: "",
    diagnosis: "",
    anamnesis: "",
    treatment: "",
    recommendations: "",
    nextAppointmentDate: "",
  });
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [clinicDocumentDetails, setClinicDocumentDetails] = useState({ name: "DentaClinic", address: "", phone: "", email: "" });
  const [prescriptionHistory, setPrescriptionHistory] = useState<PatientPrescription[]>([]);
  const [prescriptionHistoryLoading, setPrescriptionHistoryLoading] = useState(false);
  const [prescriptionHistoryError, setPrescriptionHistoryError] = useState("");
  const [prescriptionError, setPrescriptionError] = useState("");
  const [savingPrescription, setSavingPrescription] = useState(false);
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

  // --- Patient audio recording state ---
  const [patientRecordings, setPatientRecordings] = useState<PatientRecording[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(true);
  const [audioConsent, setAudioConsent] = useState(false);
  const [audioRecording, setAudioRecording] = useState(false);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioElapsedMs, setAudioElapsedMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioError, setAudioError] = useState("");
  const [audioLabel, setAudioLabel] = useState("");
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElapsedRef = useRef(0);
  const audioDiscardRef = useRef(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Compte praticien introuvable.");
        return payload as { user?: { name?: string; role?: string } };
      })
      .then(({ user }) => {
        if (user?.role) setFinanceRole(user.role.toUpperCase());
        if (user?.name) {
          setPrescription((current) => ({ ...current, practitioner: current.practitioner || user.name || "" }));
        }
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Chargement du compte praticien impossible.");
      });
  }, []);

  useEffect(() => {
    if (!prescriptionOpen) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setPrescriptionHistoryLoading(true);
      setPrescriptionHistoryError("");
      fetchPatientPrescriptions(p.id)
        .then(({ data }) => { if (active) setPrescriptionHistory(data); })
        .catch((loadError: unknown) => {
          if (active) setPrescriptionHistoryError(loadError instanceof Error ? loadError.message : "Chargement de l’historique impossible.");
        })
        .finally(() => { if (active) setPrescriptionHistoryLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [p.id, prescriptionOpen]);

  useEffect(() => {
    if (!appointmentOpen) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setAppointmentPractitionersLoading(true);
      setAppointmentError("");
      fetch("/api/practitioners", { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error ?? "Chargement des praticiens impossible.");
          return body as { data: PractitionerOption[] };
        })
        .then(({ data }) => {
          if (!active) return;
          setAppointmentPractitioners(data);
          setAppointmentForm((current) => ({
            ...current,
            dentistId: current.dentistId || String(data[0]?.id ?? ""),
          }));
        })
        .catch((loadError: unknown) => {
          if (active) setAppointmentError(loadError instanceof Error ? loadError.message : "Chargement des praticiens impossible.");
        })
        .finally(() => { if (active) setAppointmentPractitionersLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [appointmentOpen]);

  useEffect(() => {
    fetch(`/api/patients/${p.id}/odontogram`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement de l'odontogramme impossible.");
        return response.json() as Promise<{
          data: Array<{ toothNumber: number; initialStatus: string; initialNote: string | null; currentStatus: string; currentNote: string | null }>;
          clinicalStatuses: string[];
        }>;
      })
      .then(({ data, clinicalStatuses }) => {
        setCustomClinicalStatuses(clinicalStatuses);
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
    let active = true;
    fetch(`/api/patients/${p.id}/documents`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Chargement des documents impossible.");
        return body as { data: PatientDocument[] };
      })
      .then(({ data }) => { if (active) setDocuments(data); })
      .catch((loadError: unknown) => {
        if (active) setDocumentError(loadError instanceof Error ? loadError.message : "Chargement des documents impossible.");
      })
      .finally(() => { if (active) setDocumentsLoading(false); });
    return () => { active = false; };
  }, [p.id]);

  // --- Load existing patient recordings ---
  useEffect(() => {
    let active = true;
    fetch(`/api/patients/${p.id}/recordings`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Chargement des enregistrements impossible.");
        return body as { data: PatientRecording[] };
      })
      .then(({ data }) => { if (active) setPatientRecordings(data); })
      .catch(() => { /* silent: recordings feature is optional */ })
      .finally(() => { if (active) setRecordingsLoading(false); });
    return () => { active = false; };
  }, [p.id]);

  // --- Audio recording elapsed timer ---
  useEffect(() => {
    if (!audioRecording) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.min(audioElapsedRef.current + 500, 30 * 60 * 1000);
      audioElapsedRef.current = elapsed;
      setAudioElapsedMs(elapsed);
      if (elapsed >= 30 * 60 * 1000 && audioRecorderRef.current?.state === "recording") {
        audioRecorderRef.current.stop();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [audioRecording]);

  // --- Cleanup audio stream & preview URL ---
  useEffect(() => () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    fetch(`/api/patients/${p.id}/treatments`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement du plan de traitement impossible.");
        return response.json() as Promise<{ data: Treatment[] }>;
      })
      .then(({ data }) => setTreatments(data))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Chargement du plan impossible."));
  }, [p.id]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/treatments", { cache: "no-store" }),
      fetch("/api/practitioners", { cache: "no-store" }),
    ])
      .then(async ([treatmentResponse, practitionerResponse]) => {
        const [treatmentBody, practitionerBody] = await Promise.all([
          treatmentResponse.json().catch(() => ({})),
          practitionerResponse.json().catch(() => ({})),
        ]);
        if (!treatmentResponse.ok || !practitionerResponse.ok) {
          throw new Error(treatmentBody.error ?? practitionerBody.error ?? "Chargement des listes de traitements et praticiens impossible.");
        }
        return {
          treatmentNames: (treatmentBody as { data: Array<{ treatment: string }> }).data.map((item) => item.treatment),
          practitionerNames: (practitionerBody as { data: Array<{ name: string }> }).data.map((item) => item.name),
        };
      })
      .then(({ treatmentNames, practitionerNames }) => {
        if (!active) return;
        setTreatmentOptions([...new Set(treatmentNames.filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")));
        setPractitionerOptions([...new Set(practitionerNames.filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Chargement des listes de choix impossible.");
      });
    return () => { active = false; };
  }, []);

  const refreshFinances = useCallback(async (): Promise<TreatmentFinance[]> => {
    setFinanceLoading(true);
    try {
      const response = await fetch(`/api/patients/${p.id}/finances`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Chargement du suivi financier impossible.");
      const data = (body as { data: TreatmentFinance[] }).data;
      setFinances(data);
      return data;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement du suivi financier impossible.");
      throw loadError;
    } finally {
      setFinanceLoading(false);
    }
  }, [p.id]);

  useEffect(() => {
    let active = true;
    fetch(`/api/patients/${p.id}/finances`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Chargement du suivi financier impossible.");
        return (body as { data: TreatmentFinance[] }).data;
      })
      .then((data) => {
        if (active) setFinances(data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Chargement du suivi financier impossible.");
      })
      .finally(() => {
        if (active) setFinanceLoading(false);
      });
    return () => { active = false; };
  }, [p.id]);

  async function openFinanceDetails(item: TreatmentFinance) {
    setSelectedFinance(item);
    setFinanceError("");
    setFinanceDetailsLoading(true);
    setPaymentForm({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "Espèces", note: "" });
    setPriceForm({ totalAgreed: String(item.totalAgreed), reason: "" });
    try {
      const response = await fetch(`/api/patients/${p.id}/finances/${item.treatmentId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Chargement de l'historique impossible.");
      setFinanceDetails((body as { data: FinanceDetails }).data);
    } catch (loadError) {
      setFinanceError(loadError instanceof Error ? loadError.message : "Chargement de l'historique impossible.");
    } finally {
      setFinanceDetailsLoading(false);
    }
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFinance) return;
    setFinanceSaving(true);
    setFinanceError("");
    try {
      const response = await fetch(`/api/patients/${p.id}/finances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treatmentId: selectedFinance.treatmentId, ...paymentForm }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Enregistrement du paiement impossible.");
      const rows = await refreshFinances();
      const updated = rows.find((item) => item.treatmentId === selectedFinance.treatmentId) ?? selectedFinance;
      setSelectedFinance(updated);
      await openFinanceDetails(updated);
      setSuccess("Paiement enregistré.");
    } catch (saveError) {
      setFinanceError(saveError instanceof Error ? saveError.message : "Enregistrement du paiement impossible.");
    } finally {
      setFinanceSaving(false);
    }
  }

  async function saveAgreedPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFinance) return;
    setFinanceSaving(true);
    setFinanceError("");
    try {
      const response = await fetch(`/api/patients/${p.id}/finances/${selectedFinance.treatmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priceForm),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Modification du prix impossible.");
      const savedPrice = (body as { data: { totalAgreed: string | number; changed: boolean } }).data;
      const paid = Number(selectedFinance.totalPaid);
      const updatedFinance: TreatmentFinance = {
        ...selectedFinance,
        totalAgreed: savedPrice.totalAgreed,
        remaining: Math.max(Number(savedPrice.totalAgreed) - paid, 0),
        financialStatus: paid === 0 ? "IMPAYE" : paid >= Number(savedPrice.totalAgreed) ? "PAYE" : "PARTIELLEMENT_PAYE",
      };
      setFinances((current) => current.map((item) =>
        item.treatmentId === updatedFinance.treatmentId ? updatedFinance : item,
      ));
      setSelectedFinance(updatedFinance);
      const rows = await refreshFinances();
      const updated = rows.find((item) => item.treatmentId === selectedFinance.treatmentId) ?? updatedFinance;
      setSelectedFinance(updated);
      await openFinanceDetails(updated);
      setSuccess(savedPrice.changed
        ? "Prix convenu mis à jour et modification tracée."
        : "Le prix convenu est inchangé.");
    } catch (saveError) {
      setFinanceError(saveError instanceof Error ? saveError.message : "Modification du prix impossible.");
    } finally {
      setFinanceSaving(false);
    }
  }

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

  async function addClinicalStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const status = customStatusDraft.trim();
    if (!status) return;
    setSavingClinicalStatus(true);
    setClinicalStatusError("");
    try {
      const response = await fetch(`/api/patients/${p.id}/odontogram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Ajout de l’état clinique impossible.");
      const result = body as { status: string; clinicalStatuses: string[] };
      setCustomClinicalStatuses(result.clinicalStatuses);
      setToothStatus(result.status);
      setCustomStatusDraft("");
      setAddingClinicalStatus(false);
      setSuccess(`L’état clinique « ${result.status} » est disponible pour le cabinet.`);
    } catch (saveError) {
      setClinicalStatusError(saveError instanceof Error ? saveError.message : "Ajout de l’état clinique impossible.");
    } finally {
      setSavingClinicalStatus(false);
    }
  }

  async function openPrescriptionForm() {
    try {
      const response = await fetch("/api/clinic-profile", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Chargement des informations du cabinet impossible.");
      const { data } = body as { data: { name: string; address: string; city: string; governorate: string; phone: string; email: string } };
      const address = [data.address, data.city, data.governorate].filter(Boolean).join(" · ");
      setClinicDocumentDetails({ name: data.name, address, phone: data.phone, email: data.email });
      setPrescription((current) => ({
        ...current,
        practitionerAddress: address,
        practitionerPhone: data.phone,
      }));
      setError("");
      setPrescriptionOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Chargement des informations du cabinet impossible.");
    }
  }

  function openAppointmentForm() {
    setAppointmentForm({
      type: "Consultation",
      date: new Date().toISOString().slice(0, 10),
      time: "09:00",
      durationMinutes: "30",
      dentistId: "",
      chairId: "Fauteuil 1",
      status: "PENDING",
      notes: "",
    });
    setAppointmentError("");
    setAppointmentOpen(true);
  }

  function openClinicalConsultationForm() {
    setConsultationForm({
      date: new Date().toISOString().slice(0, 10),
      reason: "",
      diagnosis: "",
      anamnesis: "",
      treatment: "",
      recommendations: "",
      nextAppointmentDate: "",
    });
    setConsultationError("");
    setConsultationOpen(true);
  }

  async function savePatientAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppointmentSaving(true);
    setAppointmentError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: p.id,
          dentistId: Number(appointmentForm.dentistId),
          chairId: appointmentForm.chairId,
          date: appointmentForm.date,
          time: appointmentForm.time,
          durationMinutes: Number(appointmentForm.durationMinutes),
          type: appointmentForm.type,
          status: appointmentForm.status,
          notes: appointmentForm.notes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Création du rendez-vous impossible.");
      setAppointmentOpen(false);
      setSuccess("Le rendez-vous a été créé.");
    } catch (saveError) {
      setAppointmentError(saveError instanceof Error ? saveError.message : "Création du rendez-vous impossible.");
    } finally {
      setAppointmentSaving(false);
    }
  }

  async function savePatientConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsultationSaving(true);
    setConsultationError("");
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: p.id,
          ...consultationForm,
          nextAppointmentDate: consultationForm.nextAppointmentDate || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Enregistrement de la consultation impossible.");
      setConsultationOpen(false);
      setConsultationForm({
        date: new Date().toISOString().slice(0, 10),
        reason: "",
        diagnosis: "",
        anamnesis: "",
        treatment: "",
        recommendations: "",
        nextAppointmentDate: "",
      });
      setSuccess("La consultation a été enregistrée dans le dossier médical.");
    } catch (saveError) {
      setConsultationError(saveError instanceof Error ? saveError.message : "Enregistrement de la consultation impossible.");
    } finally {
      setConsultationSaving(false);
    }
  }

  async function uploadPatientDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentFile) {
      setDocumentError("Sélectionnez un document avant de l’ajouter.");
      return;
    }
    setDocumentSaving(true);
    setDocumentError("");
    try {
      const formData = new FormData();
      formData.set("file", documentFile);
      formData.set("category", documentCategory);
      const response = await fetch(`/api/patients/${p.id}/documents`, { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Ajout du document impossible.");
      const { data } = body as { data: PatientDocument };
      setDocuments((current) => [data, ...current]);
      setDocumentFile(null);
      if (documentInputRef.current) documentInputRef.current.value = "";
      setSuccess("Le document a été ajouté au dossier du patient.");
    } catch (uploadError) {
      setDocumentError(uploadError instanceof Error ? uploadError.message : "Ajout du document impossible.");
    } finally {
      setDocumentSaving(false);
    }
  }

  function formatFileSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
      : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function clearAudioPreview() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setAudioBlob(null);
    setAudioDurationMs(0);
    setAudioElapsedMs(0);
    audioElapsedRef.current = 0;
  }

  async function startPatientRecording() {
    setAudioError("");
    clearAudioPreview();
    if (!window.isSecureContext) {
      setAudioError("Le microphone nécessite une connexion sécurisée HTTPS ou localhost.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAudioError("L'enregistrement audio n'est pas pris en charge par ce navigateur.");
      return;
    }
    if (!audioConsent) {
      setAudioError("Confirmez d'abord le consentement explicite du patient.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      audioRecorderRef.current = recorder;
      audioChunksRef.current = [];
      audioDiscardRef.current = false;
      audioElapsedRef.current = 0;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        setAudioRecording(false);
        if (audioDiscardRef.current) {
          audioDiscardRef.current = false;
          return;
        }
        const elapsed = audioElapsedRef.current;
        const mimeType = recorder.mimeType || preferredType || "";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const normalizedType = mimeType.split(";")[0];
        if (elapsed < 1000 || !["audio/webm", "audio/mp4"].includes(normalizedType)) {
          setAudioError("Enregistrement trop court ou format non pris en charge.");
          return;
        }
        setAudioBlob(blob);
        setAudioDurationMs(elapsed);
        setAudioUrl(URL.createObjectURL(blob));
        void savePatientRecording(blob, elapsed);
      };
      recorder.start(1000);
      setAudioElapsedMs(0);
      setAudioRecording(true);
    } catch (reason) {
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      if (reason instanceof DOMException) {
        if (reason.name === "NotAllowedError" || reason.name === "SecurityError") {
          setAudioError("Accès au microphone refusé. Autorisez le microphone dans les paramètres du navigateur.");
        } else if (reason.name === "NotFoundError" || reason.name === "DevicesNotFoundError") {
          setAudioError("Aucun microphone détecté sur cet appareil.");
        } else if (reason.name === "NotReadableError" || reason.name === "TrackStartError") {
          setAudioError("Le microphone est utilisé ou inaccessible. Fermez les autres applications qui l’utilisent.");
        } else if (reason.name === "AbortError") {
          setAudioError("L’accès au microphone a été interrompu. Réessayez.");
        } else {
          setAudioError(`Impossible de démarrer le microphone : ${reason.message || reason.name}.`);
        }
      } else {
        setAudioError("Impossible de démarrer le microphone.");
      }
    }
  }

  function stopPatientRecording(discard = false) {
    audioDiscardRef.current = discard;
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") audioRecorderRef.current.stop();
  }

  async function savePatientRecording(blob = audioBlob, durationMs = audioDurationMs) {
    if (!blob) return;
    setAudioUploading(true);
    setAudioError("");
    try {
      const mimeType = blob.type.split(";")[0];
      const formData = new FormData();
      formData.set("file", new File([blob], "patient-audio", { type: mimeType }));
      formData.set("durationMs", String(Math.round(durationMs)));
      formData.set("consent", "true");
      if (audioLabel.trim()) formData.set("label", audioLabel.trim());
      const response = await fetch(`/api/patients/${p.id}/recordings`, { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setPatientRecordings((current) => [body.data as PatientRecording, ...current]);
      clearAudioPreview();
      setAudioConsent(false);
      setAudioLabel("");
      setSuccess("L'enregistrement audio a été sauvegardé dans le dossier du patient et ajouté aux consultations.");
    } catch (reason) {
      setAudioError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setAudioUploading(false);
    }
  }

  async function deletePatientRecording(recordingId: number) {
    if (!window.confirm("Voulez-vous vraiment supprimer cet enregistrement audio ?")) return;
    try {
      const response = await fetch(`/api/patients/${p.id}/recordings/${recordingId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Suppression impossible.");
      setPatientRecordings((current) => current.filter((r) => r.id !== recordingId));
      setSuccess("L'enregistrement audio a été supprimé.");
    } catch (reason) {
      setAudioError(reason instanceof Error ? reason.message : "Suppression impossible.");
    }
  }

  const audioMinutes = Math.floor(audioElapsedMs / 60000).toString().padStart(2, "0");
  const audioSeconds = Math.floor((audioElapsedMs % 60000) / 1000).toString().padStart(2, "0");

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
  const agreedTotal = finances.reduce((total, item) => total + toMilli(item.totalAgreed), 0) / 1000;
  const orderedClinicalStatuses = [...new Map(
    [...clinicalStatuses, ...customClinicalStatuses].map((status) => [status.toLocaleLowerCase(), status]),
  ).values()].sort((first, second) => {
    const firstLabel = Object.hasOwn(statusKeys, first) ? t(statusKeys[first]) : first;
    const secondLabel = Object.hasOwn(statusKeys, second) ? t(statusKeys[second]) : second;
    return firstLabel.length - secondLabel.length || firstLabel.localeCompare(secondLabel, "fr");
  });
  const paidTotal = finances.reduce((total, item) => total + toMilli(item.totalPaid), 0) / 1000;
  const remainingTotal = finances.reduce((total, item) => total + toMilli(item.remaining), 0) / 1000;

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
        await refreshFinances();
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
          <ActionButton icon={<Icon name="calendar" size={14} />} onClick={openAppointmentForm}>{t("patient.appointment")}</ActionButton>
          <ActionButton icon={<Icon name="clipboard" size={14} />} onClick={openClinicalConsultationForm}>Consultation clinique</ActionButton>
          <ActionButton icon={<Icon name="file" size={14} />} onClick={openPrescriptionForm}>Ordonnance</ActionButton>
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Documents médicaux</h2>
                <p className="mt-1 text-xs text-slate-500">Analyses, scanners, radiographies et autres documents utiles au suivi.</p>
              </div>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">{documents.length} document(s)</span>
            </div>
            <form onSubmit={uploadPatientDocument} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-end">
                <label className="text-xs font-semibold text-slate-700">
                  Choisir un document
                  <input
                    ref={documentInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.dcm,application/pdf,image/png,image/jpeg,image/webp,application/dicom"
                    onChange={(event) => { setDocumentFile(event.target.files?.[0] ?? null); setDocumentError(""); }}
                    className="mt-1 block w-full rounded-lg border border-line bg-white text-xs text-slate-600 file:mr-3 file:border-0 file:bg-accent/10 file:px-3 file:py-2.5 file:text-xs file:font-semibold file:text-accent hover:file:bg-accent/15"
                    required
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Catégorie
                  <select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value as PatientDocument["category"])} className="mt-1 block h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10">
                    <option>Analyse</option>
                    <option>Scanner / imagerie</option>
                    <option>Autre</option>
                  </select>
                </label>
                <Button type="submit" variant="primary" className="h-10" disabled={documentSaving || documentsLoading}>
                  <Icon name="upload" size={14} /> {documentSaving ? "Ajout…" : "Ajouter"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Formats acceptés : PDF, PNG, JPG, WEBP et DICOM (.dcm), jusqu’à 15 Mo par fichier.</p>
              {documentError && <p role="alert" className="mt-2 text-xs text-rose-600">{documentError}</p>}
            </form>
            <div className="mt-4">
              {documentsLoading ? <p className="py-4 text-center text-sm text-slate-400">Chargement des documents…</p>
                : documentError && documents.length === 0 ? <p role="alert" className="py-4 text-sm text-rose-600">{documentError}</p>
                  : documents.length === 0 ? <div className="rounded-lg bg-slate-50 px-4 py-6 text-center">
                    <Icon name="file" size={22} className="mx-auto text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">Aucun document médical</p>
                    <p className="mt-1 text-xs text-slate-400">Les documents ajoutés seront conservés dans ce dossier patient.</p>
                  </div>
                    : <ul className="divide-y divide-line">
                      {documents.map((document) => (
                        <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><Icon name="file" size={16} /></span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">{document.fileName}</p>
                              <p className="text-xs text-slate-400">{document.category} · {formatFileSize(document.fileSize)} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(document.uploadedAt))}</p>
                            </div>
                          </div>
                          <a
                            href={`/api/patients/${p.id}/documents/${document.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent/5"
                          >
                            <Icon name={document.mimeType === "application/dicom" ? "download" : "eye"} size={14} />
                            {document.mimeType === "application/dicom" ? "Télécharger" : "Consulter"}
                          </a>
                        </li>
                      ))}
                    </ul>}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">Enregistrements audio</h2>
                <p className="mt-1 text-xs text-slate-500">Dictées vocales, notes audio et observations orales rattachées au dossier.</p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-600">{patientRecordings.length} audio(s)</span>
            </div>

            <section className="mt-4 space-y-3 rounded-xl border border-violet-100 bg-violet-50/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm text-ink">Nouvel enregistrement</strong>
                <span className="text-[10px] text-slate-400">Audio uniquement · maximum 30 min</span>
              </div>
              <p className="rounded-md bg-violet-50 px-3 py-2 text-[11px] leading-5 text-violet-800">
                Confirmez le consentement du patient, démarrez et autorisez le microphone. Une fois arrêté, l&apos;enregistrement est sauvegardé automatiquement dans le dossier patient et ajouté aux consultations.
              </p>
              <label className="flex items-start gap-2 text-[11px] leading-5 text-slate-600">
                <input type="checkbox" checked={audioConsent} disabled={audioRecording || audioUploading} onChange={(event) => setAudioConsent(event.target.checked)} className="mt-1 accent-violet-600" />
                <span>Je confirme avoir informé le patient et obtenu son consentement explicite à l&apos;enregistrement audio.</span>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Libellé (facultatif)
                <input maxLength={120} value={audioLabel} onChange={(event) => setAudioLabel(event.target.value)} disabled={audioRecording || audioUploading} placeholder="Ex. Anamnèse, observation post-opératoire…" className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:bg-slate-50" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {!audioRecording ? <button type="button" disabled={!audioConsent || audioUploading} onClick={startPatientRecording} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Démarrer l&apos;enregistrement
                </button> : <>
                  <button type="button" onClick={() => stopPatientRecording()} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Arrêter · {audioMinutes}:{audioSeconds}</button>
                  <button type="button" onClick={() => stopPatientRecording(true)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600">Annuler</button>
                </>}
                {audioUploading && <span className="text-xs font-semibold text-emerald-700">Enregistrement automatique en cours…</span>}
              </div>
              {audioUrl && <audio className="w-full" controls src={audioUrl} />}
              {audioRecording && <p role="status" className="text-xs font-medium text-rose-700">Enregistrement en cours. Cliquez sur « Arrêter » quand vous avez terminé.</p>}
              {audioError && <p role="alert" className="text-xs text-rose-600">{audioError}</p>}
            </section>

            <div className="mt-4">
              {recordingsLoading ? <p className="py-4 text-center text-sm text-slate-400">Chargement des enregistrements…</p>
                : patientRecordings.length === 0 ? <div className="rounded-lg bg-slate-50 px-4 py-6 text-center">
                  <Icon name="mic" size={22} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-600">Aucun enregistrement audio</p>
                  <p className="mt-1 text-xs text-slate-400">Les audio ajoutés seront conservés dans ce dossier patient.</p>
                </div>
                  : <ul className="divide-y divide-line">
                    {patientRecordings.map((recording) => (
                      <li key={recording.id} className="space-y-1 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600"><Icon name="mic" size={16} /></span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">{recording.label || "Enregistrement audio"}</p>
                              <p className="text-xs text-slate-400">
                                Durée : {Math.floor(recording.durationMs / 60000)}:{Math.floor((recording.durationMs % 60000) / 1000).toString().padStart(2, "0")}
                                {" · "}{formatFileSize(recording.sizeBytes)}
                                {" · "}{new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(recording.createdAt))}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <a
                              href={`/api/patients/${p.id}/recordings/${recording.id}`}
                              download={`audio-${recording.id}.webm`}
                              title="Télécharger l'audio"
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                            >
                              <Icon name="download" size={15} />
                            </a>
                            <button
                              type="button"
                              title="Supprimer l'enregistrement"
                              onClick={() => deletePatientRecording(recording.id)}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </div>
                        <audio className="w-full" controls preload="none" src={`/api/patients/${p.id}/recordings/${recording.id}`} />
                      </li>
                    ))}
                  </ul>}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-start justify-between">
              <div><h2 className="text-base font-bold text-ink">{t("patient.odontogram")}</h2><p className="text-xs text-slate-400">{t("patient.permanentDentition")}</p></div>
              <button type="button" onClick={() => setOdontogramOpen(true)} className="text-xs font-semibold text-accent">{t("patient.viewAll")}</button>
            </div>
            <div className="rounded-lg border border-line bg-slate-50/60 px-3 py-4">
              <div className="flex flex-wrap justify-center gap-1.5">{upperTeeth.map((tooth) => <Tooth key={tooth} number={tooth} status={toothStates[tooth]?.currentStatus} selected={tooth === selectedTooth} onClick={() => selectTooth(tooth)} inverted />)}</div>
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
              <div className="mt-3 space-y-2">
                {treatments.map((item) => (
                  <div key={item.id} className="rounded-xl border border-line bg-white p-3 transition hover:border-violet-200 hover:bg-violet-50/30">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.status === "Terminé" ? "bg-emerald-50 text-emerald-600" : item.status === "En cours" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                          <Icon name="tooth" size={15} />
                        </span>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-ink">{item.treatment}</p>
                          <p className="mt-1 text-xs text-slate-400">{item.phase}{item.teeth ? ` · Dent(s) ${item.teeth}` : ""}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.status === "Terminé" ? "bg-emerald-50 text-emerald-600" : item.status === "En cours" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>{item.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-slate-500">
                      <span>{item.dentist}</span>
                      <span>{formatDate(item.plannedDate)}</span>
                      <span className="font-semibold text-ink">{formatMoney(Number(item.amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <div className="flex items-start justify-between"><div><h2 className="text-base font-bold text-ink">Finances</h2><p className="text-xs text-slate-400">Montants calculés depuis les traitements et paiements</p></div><Icon name="plus" size={16} className="text-slate-400" /></div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Info label="Prix convenu" value={financeLoading ? "…" : formatMoney(agreedTotal)} />
              <Info label="Total payé" value={financeLoading ? "…" : formatMoney(paidTotal)} />
              <Info label="Créance" value={financeLoading ? "…" : <span className="text-amber-600">{formatMoney(remainingTotal)}</span>} />
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

      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-ink">Suivi financier par traitement</h2>
            <p className="text-xs text-slate-400">Chaque paiement et solde reste rattaché à son traitement médical.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Créances : {financeLoading ? "…" : formatMoney(remainingTotal)}
          </span>
        </div>
        {financeLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">Chargement du suivi financier…</p>
        ) : finances.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Aucun traitement médical à suivre financièrement. Ajoutez d’abord un traitement au plan de soins ; il apparaîtra ici sans créer de doublon.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-3 font-semibold">Traitement / acte</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 text-right font-semibold">Prix total</th>
                  <th className="px-3 py-3 text-right font-semibold">Payé</th>
                  <th className="px-3 py-3 text-right font-semibold">Solde</th>
                  <th className="px-3 py-3 font-semibold">Statut</th>
                  <th className="px-3 py-3 text-right font-semibold">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {finances.map((item) => (
                  <tr key={item.treatmentId} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ink">{item.treatment}</p>
                      <p className="text-xs text-slate-400">{item.phase}{item.teeth ? ` · Dent(s) ${item.teeth}` : ""}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(item.treatmentDate)}</td>
                    <td className="px-3 py-3 text-right text-slate-600">{formatMoney(Number(item.totalAgreed))}</td>
                    <td className="px-3 py-3 text-right text-emerald-700">{formatMoney(Number(item.totalPaid))}</td>
                    <td className="px-3 py-3 text-right font-semibold text-amber-700">{formatMoney(Number(item.remaining))}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.financialStatus === "PAYE" ? "bg-emerald-50 text-emerald-700"
                          : item.financialStatus === "PARTIELLEMENT_PAYE" ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                      }`}>
                        {item.financialStatus === "PAYE" ? "Payé" : item.financialStatus === "PARTIELLEMENT_PAYE" ? "Partiellement payé" : "Impayé"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button className="px-2.5 py-1.5 text-xs" onClick={() => void openFinanceDetails(item)}>Détails / paiement</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-slate-50/70 text-sm font-bold text-ink">
                <tr>
                  <td className="px-3 py-3" colSpan={2}>Totaux patient</td>
                  <td className="px-3 py-3 text-right">{formatMoney(agreedTotal)}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{formatMoney(paidTotal)}</td>
                  <td className="px-3 py-3 text-right text-amber-700">{formatMoney(remainingTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {selectedFinance && (
        <Modal title={`Finances · ${selectedFinance.treatment}`} wide onClose={() => setSelectedFinance(null)}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Info label="Prix convenu" value={formatMoney(Number(selectedFinance.totalAgreed))} />
                <Info label="Payé" value={formatMoney(Number(selectedFinance.totalPaid))} />
                <Info label="Solde" value={<span className="text-amber-700">{formatMoney(Number(selectedFinance.remaining))}</span>} />
              </div>

              <form onSubmit={savePayment} className="rounded-xl border border-line p-4">
                <h3 className="mb-3 text-sm font-bold text-ink">Enregistrer un paiement</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-500">Montant (DT) *
                    <input required type="number" min="0.001" max={Number(selectedFinance.remaining)} step="0.001" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">Date *
                    <input required type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
                  </label>
                  <label className="text-xs font-semibold text-slate-500">Mode de paiement *
                    <select required value={paymentForm.method} onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-accent">
                      <option>Espèces</option><option>Carte bancaire</option><option>Virement</option><option>Chèque</option><option>Autre</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-500">Note
                    <input maxLength={255} value={paymentForm.note} onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="submit" variant="primary" disabled={financeSaving || Number(selectedFinance.remaining) <= 0}>
                    {financeSaving ? "Enregistrement…" : "Enregistrer le paiement"}
                  </Button>
                </div>
              </form>

              {financeRole === "DENTIST" ? (
                <form onSubmit={saveAgreedPrice} className="rounded-xl border border-line p-4">
                  <h3 className="mb-3 text-sm font-bold text-ink">Modifier le prix convenu</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-500">Nouveau prix (DT) *
                      <input required type="number" min="0" step="0.001" value={priceForm.totalAgreed} onChange={(event) => setPriceForm((current) => ({ ...current, totalAgreed: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">Motif *
                      <input required maxLength={255} value={priceForm.reason} onChange={(event) => setPriceForm((current) => ({ ...current, reason: event.target.value }))} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button type="submit" disabled={financeSaving}>{financeSaving ? "Enregistrement…" : "Enregistrer le nouveau prix"}</Button>
                  </div>
                </form>
              ) : null}
              {financeError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{financeError}</p>}
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border border-line p-4">
                <h3 className="mb-3 text-sm font-bold text-ink">Historique des paiements</h3>
                {financeDetailsLoading ? <p className="text-sm text-slate-400">Chargement…</p>
                  : financeDetails.payments.length === 0 ? <p className="text-sm text-slate-400">Aucun paiement enregistré pour ce traitement.</p>
                    : <ul className="divide-y divide-line">
                      {financeDetails.payments.map((payment) => (
                        <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                          <div><p className="font-semibold text-ink">{payment.method}{payment.note ? ` · ${payment.note}` : ""}</p><p className="text-xs text-slate-400">{formatDate(payment.paymentDate)} · Enregistré par {payment.createdByName || `#${payment.createdBy}`}</p></div>
                          <span className="shrink-0 font-semibold text-emerald-700">{formatMoney(Number(payment.amount))}</span>
                        </li>
                      ))}
                    </ul>}
              </section>
              <section className="rounded-xl border border-line p-4">
                <h3 className="mb-3 text-sm font-bold text-ink">Historique des prix</h3>
                {financeDetailsLoading ? <p className="text-sm text-slate-400">Chargement…</p>
                  : financeDetails.priceHistory.length === 0 ? <p className="text-sm text-slate-400">Aucune modification du prix.</p>
                    : <ul className="divide-y divide-line">
                      {financeDetails.priceHistory.map((change) => (
                        <li key={change.id} className="py-2.5 text-sm">
                          <p className="font-semibold text-ink">{formatMoney(Number(change.oldAmount))} → {formatMoney(Number(change.newAmount))}</p>
                          <p className="text-xs text-slate-500">{change.reason}</p>
                          <p className="text-xs text-slate-400">{formatDate(change.changedAt)} · Modifié par {change.changedByName || `#${change.changedBy}`}</p>
                        </li>
                      ))}
                    </ul>}
              </section>
            </div>
          </div>
        </Modal>
      )}

      {treatmentOpen && (
        <Modal title="Ajouter au plan de traitement" onClose={() => setTreatmentOpen(false)}>
          <form onSubmit={saveTreatment}>
            <p className="mb-4 text-sm text-slate-500">Ajoutez une étape au plan de traitement du patient.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-500">Patient
                <input value={`${p.firstName} ${p.lastName} · ${p.patientNumber}`} disabled className="mt-1 w-full rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-500" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Phase
                <select required value={treatmentForm.phase} onChange={(event) => setTreatmentForm((current) => ({ ...current, phase: event.target.value }))} className="mt-1 w-full rounded-lg border border-accent bg-white px-3 py-2.5 text-sm outline-none">
                  <option>Phase 1</option><option>Phase 2</option><option>Phase 3</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">Acte / traitement *
                <SearchableInput required value={treatmentForm.treatment} onChange={(value) => setTreatmentForm((current) => ({ ...current, treatment: value }))} options={additionalTreatmentOptions} groups={dentalActCatalog.map((group) => ({ label: group.label, options: group.acts }))} placeholder="Rechercher ou saisir un acte" className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Dent(s) concernée(s)
                <ToothPicker value={treatmentForm.teeth} onChange={(value) => setTreatmentForm((current) => ({ ...current, teeth: value }))} />
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
                <SearchableInput required value={treatmentForm.dentist} onChange={(value) => setTreatmentForm((current) => ({ ...current, dentist: value }))} options={practitionerOptions} placeholder="Rechercher ou saisir un praticien" className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent" />
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
                  <div className="flex flex-wrap justify-center gap-2">{upperTeeth.map((tooth) => <Tooth key={tooth} number={tooth} status={tooth === selectedTooth ? toothStatus : displayedStatus(tooth)} selected={tooth === selectedTooth} onClick={() => selectTooth(tooth)} inverted />)}</div>
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
                        ? `${odontogramView === "initial" ? t("patient.initial") : t("patient.current")} : ${t(Object.hasOwn(statusKeys, toothStatus) ? statusKeys[toothStatus] : toothStatus)}`
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
                  <div className="flex flex-wrap items-center gap-2">
                    {orderedClinicalStatuses.map((status) => {
                      const label = Object.hasOwn(statusKeys, status) ? t(statusKeys[status]) : status;
                      return (
                        <button
                          type="button"
                          key={status}
                          onClick={() => {
                            setToothStatus(status);
                            setAddingClinicalStatus(status === "Autre");
                            setClinicalStatusError("");
                          }}
                          className={`inline-flex h-9 flex-none items-center justify-center whitespace-nowrap rounded-md border px-2 text-xs leading-none transition ${toothStatus === status ? `${Object.hasOwn(statusColors, status) ? statusColors[status] : "border-violet-300 bg-violet-50 text-violet-700"} font-semibold` : "border-line bg-white text-slate-500 hover:border-accent"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {addingClinicalStatus && (
                    <form onSubmit={addClinicalStatus} className="mt-4 rounded-xl border-2 border-accent/30 bg-accent/5 p-4 shadow-sm">
                      <h6 className="text-sm font-bold text-ink">Ajouter un état clinique personnalisé</h6>
                      <p className="mt-1 text-xs text-slate-500">Cet état sera disponible pour tous les patients du cabinet.</p>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="min-w-40 flex-1 text-sm font-semibold text-slate-700">
                        Nom du nouvel état
                        <input
                          value={customStatusDraft}
                          onChange={(event) => setCustomStatusDraft(event.target.value)}
                          maxLength={40}
                          placeholder="Ex. Sensibilité dentaire"
                          className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10"
                          required
                        />
                      </label>
                      <Button variant="primary" type="submit" className="h-11 px-5" disabled={savingClinicalStatus}>
                        <Icon name="plus" size={16} /> {savingClinicalStatus ? "Ajout…" : "Ajouter l’état"}
                      </Button>
                      {clinicalStatusError && <p role="alert" className="w-full text-xs text-rose-600">{clinicalStatusError}</p>}
                      </div>
                    </form>
                  )}
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
      {appointmentOpen && (
        <Modal title="Nouveau rendez-vous" onClose={() => setAppointmentOpen(false)}>
          <form onSubmit={savePatientAppointment} className="space-y-4">
            <p className="text-xs text-slate-500">Un contrôle de disponibilité évite les doubles réservations.</p>
            <label className="block text-xs font-semibold text-slate-700">
              Patient
              <div className="mt-1 rounded-xl border border-line bg-slate-50 px-3 py-2.5 text-sm font-medium text-ink">{p.firstName} {p.lastName} · {p.phone}</div>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Type de rendez-vous
                <select required className={patientFormControlClass} value={appointmentForm.type} onChange={(event) => setAppointmentForm((current) => ({ ...current, type: event.target.value }))}>
                  {["Consultation", "Contrôle", "Détartrage", "Urgence", "Extraction", "Soins", "Prothèse", "Autre"].map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Date
                <input type="date" min={new Date().toISOString().slice(0, 10)} required className={patientFormControlClass} value={appointmentForm.date} onChange={(event) => setAppointmentForm((current) => ({ ...current, date: event.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Heure
                <input type="time" required className={patientFormControlClass} value={appointmentForm.time} onChange={(event) => setAppointmentForm((current) => ({ ...current, time: event.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Durée (minutes)
                <input type="number" min="10" max="480" step="5" required className={patientFormControlClass} value={appointmentForm.durationMinutes} onChange={(event) => setAppointmentForm((current) => ({ ...current, durationMinutes: event.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Praticien
                <select required className={patientFormControlClass} value={appointmentForm.dentistId} onChange={(event) => setAppointmentForm((current) => ({ ...current, dentistId: event.target.value }))} disabled={appointmentPractitionersLoading || appointmentPractitioners.length === 0}>
                  <option value="">{appointmentPractitionersLoading ? "Chargement…" : "Sélectionner un praticien"}</option>
                  {appointmentPractitioners.map((practitioner) => <option key={practitioner.id} value={practitioner.id}>{practitioner.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Fauteuil
                <select required className={patientFormControlClass} value={appointmentForm.chairId} onChange={(event) => setAppointmentForm((current) => ({ ...current, chairId: event.target.value }))}>
                  {["Fauteuil 1", "Fauteuil 2", "Fauteuil 3"].map((chair) => <option key={chair}>{chair}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Statut
                <select className={patientFormControlClass} value={appointmentForm.status} onChange={(event) => setAppointmentForm((current) => ({ ...current, status: event.target.value as AppointmentStatus }))}>
                  <option value="PENDING">En attente</option>
                  <option value="CONFIRMED">Confirmé</option>
                  <option value="ARRIVED">Arrivé</option>
                  <option value="IN_CONSULTATION">En consultation</option>
                  <option value="COMPLETED">Terminé</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Notes
              <textarea rows={3} className={patientFormControlClass} value={appointmentForm.notes} onChange={(event) => setAppointmentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Motif, informations utiles..." />
            </label>
            {appointmentError && <p role="alert" className="text-sm text-rose-600">{appointmentError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setAppointmentOpen(false)}>Annuler</Button>
              <Button variant="primary" type="submit" disabled={appointmentSaving || appointmentPractitionersLoading || appointmentPractitioners.length === 0}>
                <Icon name="check" size={14} /> {appointmentSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {consultationOpen && (
        <Modal title="Nouvelle consultation" wide onClose={() => setConsultationOpen(false)}>
          <form onSubmit={savePatientConsultation} className="space-y-4">
            <p className="text-xs text-slate-500">Le contenu clinique est enregistré dans le dossier du patient.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Patient
                <div className="mt-1 rounded-xl border border-line bg-slate-50 px-3 py-2.5 text-sm font-medium text-ink">{p.firstName} {p.lastName} · {p.phone}</div>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Date de consultation
                <input type="date" required className={patientFormControlClass} value={consultationForm.date} onChange={(event) => setConsultationForm((current) => ({ ...current, date: event.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Motif de consultation
                <input required maxLength={255} className={patientFormControlClass} value={consultationForm.reason} onChange={(event) => setConsultationForm((current) => ({ ...current, reason: event.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Diagnostic
                <input className={patientFormControlClass} value={consultationForm.diagnosis} onChange={(event) => setConsultationForm((current) => ({ ...current, diagnosis: event.target.value }))} />
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Anamnèse
              <textarea rows={3} className={patientFormControlClass} value={consultationForm.anamnesis} onChange={(event) => setConsultationForm((current) => ({ ...current, anamnesis: event.target.value }))} />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Traitement réalisé / proposé
              <textarea rows={3} className={patientFormControlClass} value={consultationForm.treatment} onChange={(event) => setConsultationForm((current) => ({ ...current, treatment: event.target.value }))} />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Recommandations du praticien
              <textarea rows={3} className={patientFormControlClass} value={consultationForm.recommendations} onChange={(event) => setConsultationForm((current) => ({ ...current, recommendations: event.target.value }))} />
            </label>
            <label className="block max-w-sm text-xs font-semibold text-slate-700">
              Prochain rendez-vous
              <input type="date" className={patientFormControlClass} value={consultationForm.nextAppointmentDate} onChange={(event) => setConsultationForm((current) => ({ ...current, nextAppointmentDate: event.target.value }))} />
            </label>
            {consultationError && <p role="alert" className="text-sm text-rose-600">{consultationError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setConsultationOpen(false)}>Annuler</Button>
              <Button variant="primary" type="submit" disabled={consultationSaving}>
                <Icon name="check" size={14} /> {consultationSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {prescriptionOpen && (
        <Modal title="Modèle d’ordonnance" wide onClose={() => setPrescriptionOpen(false)}>
          <form className="space-y-4" onSubmit={async (event) => {
            event.preventDefault();
            if (!prescription.practitioner.trim() || !prescription.registrationNumber.trim() || !prescription.medicines.trim()) {
              setPrescriptionError("L’ordonnance doit comporter le praticien, son numéro d’inscription et au moins un médicament détaillé.");
              return;
            }
            setSavingPrescription(true);
            setPrescriptionError("");
            try {
              const { data } = await createPatientPrescription(p.id, {
                ...prescription,
                patientName: `${p.firstName} ${p.lastName}`,
                patientNumber: p.patientNumber,
              });
              setPrescriptionHistory((current) => [data, ...current]);
              downloadPrescriptionPdf({
                ...data,
                clinicName: clinicDocumentDetails.name,
                clinicAddress: clinicDocumentDetails.address,
                clinicPhone: clinicDocumentDetails.phone,
                clinicEmail: clinicDocumentDetails.email,
              });
              setSuccess("L’ordonnance a été enregistrée dans l’historique et téléchargée.");
              setPrescriptionOpen(false);
            } catch (saveError) {
              setPrescriptionError(saveError instanceof Error ? saveError.message : "Enregistrement de l’ordonnance impossible.");
            } finally {
              setSavingPrescription(false);
            }
          }}>
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">Ce modèle est un support de rédaction. Le praticien doit vérifier la prescription, compléter les mentions professionnelles et signer/cacheter le document avant remise au patient.</p>
            <section className="rounded-lg border border-line p-3">
              <h3 className="text-sm font-bold text-ink">Historique des ordonnances</h3>
              {prescriptionHistoryLoading ? <p className="mt-2 text-xs text-slate-500">Chargement de l’historique…</p>
                : prescriptionHistoryError ? <p role="alert" className="mt-2 text-xs text-rose-600">{prescriptionHistoryError}</p>
                  : prescriptionHistory.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucune ordonnance enregistrée pour ce patient.</p>
                    : <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                      {prescriptionHistory.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-ink">{formatDate(item.date)} · {item.prescriptionNumber}</p>
                            <p className="truncate text-xs text-slate-500">{item.practitioner}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              className="px-2 py-1 text-xs"
                              onClick={() => {
                                if (!openPrescriptionPdf({
                                  ...item,
                                  clinicName: clinicDocumentDetails.name,
                                  clinicAddress: clinicDocumentDetails.address,
                                  clinicPhone: clinicDocumentDetails.phone,
                                  clinicEmail: clinicDocumentDetails.email,
                                })) setError("La consultation a été bloquée par le navigateur. Autorisez les fenêtres contextuelles puis réessayez.");
                              }}
                            >
                              <Icon name="eye" size={13} /> Consulter
                            </Button>
                            <Button type="button" className="px-2 py-1 text-xs" onClick={() => downloadPrescriptionPdf({
                              ...item,
                              clinicName: clinicDocumentDetails.name,
                              clinicAddress: clinicDocumentDetails.address,
                              clinicPhone: clinicDocumentDetails.phone,
                              clinicEmail: clinicDocumentDetails.email,
                            })}>
                              <Icon name="download" size={13} /> Télécharger
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>}
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">Date de prescription<input type="date" className="mt-1 block h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10" value={prescription.date} onChange={(event) => setPrescription((current) => ({ ...current, date: event.target.value }))} required /></label>
              <label className="text-xs font-semibold text-slate-700">Numéro d’ordonnance<input className="mt-1 block h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10" value={prescription.prescriptionNumber} onChange={(event) => setPrescription((current) => ({ ...current, prescriptionNumber: event.target.value }))} placeholder="Généré si vide" /></label>
              <label className="text-xs font-semibold text-slate-700">Nom et prénom du praticien<input className="mt-1 block h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10" value={prescription.practitioner} onChange={(event) => setPrescription((current) => ({ ...current, practitioner: event.target.value }))} required /></label>
              <label className="text-xs font-semibold text-slate-700">N° d’inscription à l’Ordre<input className="mt-1 block h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10" value={prescription.registrationNumber} onChange={(event) => setPrescription((current) => ({ ...current, registrationNumber: event.target.value }))} required /></label>
              <label className="text-xs font-semibold text-slate-700">Adresse du cabinet<input className="mt-1 block h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10" value={prescription.practitionerAddress} onChange={(event) => setPrescription((current) => ({ ...current, practitionerAddress: event.target.value }))} /></label>
              <label className="text-xs font-semibold text-slate-700">Téléphone du cabinet<input className="mt-1 block h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10" value={prescription.practitionerPhone} onChange={(event) => setPrescription((current) => ({ ...current, practitionerPhone: event.target.value }))} /></label>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong>Patient :</strong> {p.firstName} {p.lastName} · {p.patientNumber} · Né(e) le {p.dateOfBirth || "à compléter"} · {p.address || p.city || "Adresse à compléter"}</div>
            <label className="block text-xs font-semibold text-slate-700">Prescription détaillée<textarea className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white p-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10 min-h-32 resize-y" value={prescription.medicines} onChange={(event) => setPrescription((current) => ({ ...current, medicines: event.target.value }))} placeholder="Une ligne par médicament : DCI, dosage, forme, voie, posologie et durée." required /></label>
            <label className="block text-xs font-semibold text-slate-700">Conseils et précautions<textarea className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white p-3 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/10 min-h-20 resize-y" value={prescription.instructions} onChange={(event) => setPrescription((current) => ({ ...current, instructions: event.target.value }))} placeholder="Allergies, précautions, consignes de suivi..." /></label>
            {prescriptionError && <p role="alert" className="text-sm text-rose-600">{prescriptionError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" onClick={() => setPrescriptionOpen(false)}>Annuler</Button><Button variant="primary" type="submit" disabled={savingPrescription}><Icon name="download" size={14} /> {savingPrescription ? "Enregistrement…" : "Enregistrer et télécharger"}</Button></div>
          </form>
        </Modal>
      )}

      {editing && <Modal title={t("patient.edit")} wide onClose={() => setEditing(false)}><PatientForm patient={p} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} /></Modal>}
    </>
  );
}
