"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { createPatient, fetchPatients } from "../api";
import type { PatientListItem } from "../types";
import { PatientForm } from "./PatientForm";

type ImportReport = { imported: number; rejected: string[] };

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "," || char === ";")) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvBoolean(value: string | undefined) {
  return ["1", "true", "oui", "yes", "vrai"].includes((value ?? "").toLowerCase());
}

function toCsvRow(patient: PatientListItem) {
  return [
    patient.patientNumber, patient.firstName, patient.lastName, patient.phone, patient.nationalId,
    patient.dateOfBirth, patient.sex, patient.whatsapp, patient.email, patient.city,
    patient.governorate, patient.allergies, patient.chronicConditions, patient.balance, patient.lastVisit,
  ].map(csvEscape).join(",");
}

export function PatientsView() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (query: string) => {
    try {
      setPatients(await fetchPatients(query));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  useEffect(() => {
    const query = searchParams.get("q") ?? "";
    const timer = window.setTimeout(() => {
      setSearch((current) => current === query ? current : query);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  async function exportCsv() {
    try {
      const allPatients = await fetchPatients("");
      const content = [
        ["patientNumber", "firstName", "lastName", "phone", "nationalId", "dateOfBirth", "sex", "whatsapp", "email", "city", "governorate", "allergies", "chronicConditions", "balance", "lastVisit"].join(","),
        ...allPatients.map(toCsvRow),
      ].join("\r\n");
      const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export CSV impossible.");
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportReport(null);
    const rejected: string[] = [];
    let imported = 0;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("Le fichier CSV ne contient aucune ligne patient.");
      const headers = rows[0].map((header) => header.replace(/^\ufeff/, "").trim());
      const index = (name: string) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
      const value = (row: string[], name: string) => {
        const position = index(name);
        return position >= 0 ? row[position] ?? "" : "";
      };
      if (index("firstName") < 0 || index("lastName") < 0 || index("phone") < 0) {
        throw new Error("Colonnes obligatoires manquantes : firstName, lastName et phone.");
      }
      for (let rowNumber = 1; rowNumber < rows.length; rowNumber += 1) {
        const row = rows[rowNumber];
        try {
          await createPatient({
            firstName: value(row, "firstName"),
            lastName: value(row, "lastName"),
            phone: value(row, "phone"),
            nationalId: value(row, "nationalId"),
            dateOfBirth: value(row, "dateOfBirth"),
            sex: value(row, "sex"),
            whatsapp: value(row, "whatsapp"),
            email: value(row, "email"),
            address: value(row, "address"),
            city: value(row, "city"),
            governorate: value(row, "governorate"),
            profession: value(row, "profession"),
            maritalStatus: value(row, "maritalStatus"),
            emergencyContact: value(row, "emergencyContact"),
            allergies: value(row, "allergies"),
            chronicConditions: value(row, "chronicConditions"),
            medications: value(row, "medications"),
            anamnesis: value(row, "anamnesis"),
            pregnancyStatus: value(row, "pregnancyStatus"),
            medicalNotes: value(row, "medicalNotes"),
            diabetes: csvBoolean(value(row, "diabetes")),
            hypertension: csvBoolean(value(row, "hypertension")),
            anticoagulants: csvBoolean(value(row, "anticoagulants")),
          });
          imported += 1;
        } catch (e) {
          rejected.push(`Ligne ${rowNumber + 1} : ${e instanceof Error ? e.message : "données invalides"}`);
        }
      }
      setImportReport({ imported, rejected });
      await load(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import CSV impossible.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{t("patients.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{patients.length} {t("patients.records")} · {t("patients.dataNotice")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Icon name="upload" size={16} /> {importing ? t("patients.importing") : t("patients.import")}
          </Button>
          <Button onClick={exportCsv}>
            <Icon name="download" size={16} /> CSV
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="userPlus" size={16} /> {t("patients.new")}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-md">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("patients.search")}
            className="w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <span className="text-xs text-slate-400">{patients.length} {t("patients.records")}</span>
      </div>

      {importReport && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">{importReport.imported} patient(s) importé(s).</p>
          {importReport.rejected.length > 0 && (
            <p className="mt-1 text-rose-700">{importReport.rejected.length} ligne(s) rejetée(s) : {importReport.rejected.slice(0, 3).join(" · ")}</p>
          )}
        </div>
      )}

      <Card className="overflow-hidden p-0!">
        {error && <p className="bg-rose-50 px-5 py-3 text-sm text-rose-600">{error}</p>}
        {loading ? <EmptyState title="Chargement…" /> : patients.length === 0 ? (
          <EmptyState title="Aucun patient" hint="Créez votre premier dossier avec « Nouveau patient »." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-245 text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Numéro / CIN</th>
                  <th className="px-4 py-3">Téléphone</th>
                  <th className="px-4 py-3">Dernière visite</th>
                  <th className="px-4 py-3">Antécédents médicaux</th>
                  <th className="px-4 py-3">Solde</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {patients.map((p) => (
                  <tr
                    key={p.id}
                    className="group cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                    onClick={() => router.push(`/patients/${p.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/patients/${p.id}`);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-xs font-bold text-accent">{initials(p.firstName, p.lastName)}</span>
                        <div><p className="font-semibold text-ink">{p.firstName} {p.lastName}</p><p className="text-xs text-slate-400">{p.city ?? p.governorate ?? "—"}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><p className="font-medium text-accent">{p.patientNumber}</p><p className="text-xs text-slate-400">CIN {p.nationalId ?? "—"}</p></td>
                    <td className="px-4 py-3">{p.phone}</td>
                    <td className="px-4 py-3">{formatDate(p.lastVisit, undefined, locale)}</td>
                    <td className="px-4 py-3">{p.allergies ? <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600">• {p.allergies}</span> : <span className="text-xs text-slate-400">Aucun signalement</span>}</td>
                    <td className={`px-4 py-3 font-semibold ${Number(p.balance) > 0 ? "text-amber-600" : "text-ink"}`}>{formatMoney(Number(p.balance))}</td>
                    <td className="px-4 py-3">
                      <Link href={`/patients/${p.id}`} aria-label={`Voir le dossier de ${p.firstName} ${p.lastName}`} onClick={(e) => e.stopPropagation()} className="inline-flex rounded-md p-1.5 text-slate-400 hover:bg-accent/10 hover:text-accent">
                        <Icon name="eye" size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <Modal title={t("patients.new")} onClose={() => setCreating(false)}><PatientForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(search); }} /></Modal>}
    </>
  );
}
