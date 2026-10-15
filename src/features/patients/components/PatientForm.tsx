"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { GOVERNORATES } from "@/lib/tunisia";
import { createPatient, updatePatient } from "../api";
import { EMPTY_PATIENT_FORM, toFormValues, type PatientDetail, type PatientFormValues } from "../types";

type Props = { patient?: PatientDetail; onSaved: () => void; onCancel: () => void };

const inputClass = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent";

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function PatientForm({ patient, onSaved, onCancel }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<PatientFormValues>(patient ? toFormValues(patient) : EMPTY_PATIENT_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const text = (name: keyof PatientFormValues) => ({
    className: inputClass,
    value: values[name] as string,
    onChange: (e: { target: { value: string } }) => setValues((c) => ({ ...c, [name]: e.target.value })),
  });
  const flag = (name: "diabetes" | "hypertension" | "anticoagulants", label: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" checked={values[name]} onChange={(e) => setValues((c) => ({ ...c, [name]: e.target.checked }))} />
      {label}
    </label>
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (patient) await updatePatient(patient.id, values);
      else await createPatient(values);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Section title={t("form.identity")}>
        <Field label={t("form.firstName")}><input {...text("firstName")} required /></Field>
        <Field label={t("form.lastName")}><input {...text("lastName")} required /></Field>
        <Field label={t("form.birthDate")}><input {...text("dateOfBirth")} type="date" /></Field>
        <Field label={t("form.sex")}>
          <select {...text("sex")}><option value="">—</option><option value="Femme">{t("form.female")}</option><option value="Homme">{t("form.male")}</option></select>
        </Field>
        <Field label={t("form.nationalId")}><input {...text("nationalId")} inputMode="numeric" /></Field>
        <Field label={t("form.maritalStatus")}>
          <select {...text("maritalStatus")}>
            <option value="">—</option><option>Célibataire</option><option>Marié(e)</option>
            <option>Divorcé(e)</option><option>Veuf / Veuve</option>
          </select>
        </Field>
        <Field label={t("form.profession")}><input {...text("profession")} /></Field>
      </Section>

      <Section title={t("form.contact")}>
        <Field label={t("form.phone")}><input {...text("phone")} required /></Field>
        <Field label={t("form.whatsapp")}><input {...text("whatsapp")} /></Field>
        <Field label={t("form.email")}><input {...text("email")} type="email" /></Field>
        <Field label={t("form.emergency")}><input {...text("emergencyContact")} /></Field>
        <Field label={t("form.address")} full><input {...text("address")} /></Field>
        <Field label={t("form.city")}><input {...text("city")} /></Field>
        <Field label={t("form.governorate")}>
          <select {...text("governorate")}>
            <option value="">—</option>
            {GOVERNORATES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </Section>

      <Section title={t("form.medical")}>
        <Field label={t("form.allergies")} full><textarea {...text("allergies")} rows={2} /></Field>
        <Field label={t("form.conditions")} full><textarea {...text("chronicConditions")} rows={2} /></Field>
        <Field label={t("form.medications")} full><textarea {...text("medications")} rows={2} /></Field>
        <Field label={t("form.anamnesis")} full><textarea {...text("anamnesis")} rows={3} /></Field>
        <Field label={t("form.pregnancy")}>
          <select {...text("pregnancyStatus")}>
            <option value="">—</option><option>Non concernée</option><option>Non</option><option>Oui</option>
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 self-end pb-2">
          {flag("diabetes", t("form.diabetes"))}
          {flag("hypertension", t("form.hypertension"))}
          {flag("anticoagulants", t("form.anticoagulants"))}
        </div>
        <Field label={t("form.notes")} full><textarea {...text("medicalNotes")} rows={2} /></Field>
      </Section>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? t("form.saving") : t("common.save")}</Button>
      </div>
    </form>
  );
}