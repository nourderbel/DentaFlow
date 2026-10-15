"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import type { PatientListItem } from "@/features/patients/types";

type Treatment = {
  id: number; patientId: number; patientName: string; patientNumber: string; phase: string;
  treatment: string; teeth: string | null; amount: string | number;
  status: "À faire" | "En cours" | "Terminé"; dentist: string; plannedDate: string;
};

const statusStyles: Record<Treatment["status"], string> = {
  "À faire": "bg-amber-50 text-amber-700",
  "En cours": "bg-blue-50 text-blue-700",
  "Terminé": "bg-emerald-50 text-emerald-700",
};

export function TreatmentsView() {
  const { locale, t } = useI18n();
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [patientFilter, setPatientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ patientId: "", phase: "Phase 1", treatment: "", teeth: "", amount: "", status: "À faire" as Treatment["status"], dentist: "Praticien", plannedDate: new Date().toISOString().slice(0, 10) });

  async function load() {
    setLoading(true);
    try {
      const [treatmentResponse, patientResponse] = await Promise.all([fetch("/api/treatments", { cache: "no-store" }), fetch("/api/patients", { cache: "no-store" })]);
      const treatmentBody = await treatmentResponse.json();
      const patientBody = await patientResponse.json();
      if (!treatmentResponse.ok || !patientResponse.ok) throw new Error(treatmentBody.error ?? patientBody.error ?? "Chargement impossible.");
      setTreatments(treatmentBody.data);
      setPatients(patientBody.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = treatments.filter((item) => (!patientFilter || String(item.patientId) === patientFilter) && (!statusFilter || item.status === statusFilter));
  const phases = [...new Set(filtered.map((item) => item.phase))];
  const completed = treatments.filter((item) => item.status === "Terminé").length;
  const inProgress = treatments.filter((item) => item.status === "En cours").length;
  const plannedAmount = treatments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const progress = treatments.length ? Math.round((completed / treatments.length) * 100) : 0;
  const phaseCounts = useMemo(() => phases.map((phase) => ({ phase, count: filtered.filter((item) => item.phase === phase).length })), [filtered, phases]);

  async function saveTreatment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.patientId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/patients/${form.patientId}/treatments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: Number(form.amount) || 0 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setModalOpen(false);
      setForm((current) => ({ ...current, treatment: "", teeth: "", amount: "" }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Traitements", "العلاجات")}</h1><p className="mt-1 text-sm text-slate-500">{label("Plans de traitement par patient, par phase et par dent.", "خطط العلاج حسب المريض والمرحلة والسن.")}</p></div>
      <div className="flex gap-2"><Button><Icon name="upload" size={15} /> {label("Importer", "استيراد")}</Button><Button><Icon name="download" size={15} /> CSV</Button><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={15} /> {label("Ajouter un acte", "إضافة علاج")}</Button></div>
    </div>
    {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon="activity" label={label("Actes au programme", "العلاجات المبرمجة")} value={String(treatments.length)} detail={label("Tous les patients", "كل المرضى")} tone="violet" />
      <Metric icon="check" label={label("Actes terminés", "العلاجات المكتملة")} value={String(completed)} detail={`${progress}% ${label("de progression", "من التقدم")}`} tone="green" />
      <Metric icon="clock" label={label("En cours", "قيد التنفيذ")} value={String(inProgress)} detail={label("À suivre en consultation", "تحتاج إلى متابعة")} tone="amber" />
      <Metric icon="creditCard" label={label("Montant planifié", "المبلغ المخطط")} value={formatMoney(plannedAmount)} detail={label("Tarifs du cabinet", "تعريفات العيادة")} tone="violet" />
    </div>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="flex justify-between"><div><h2 className="font-bold text-ink">{label("Progression des traitements", "تقدم العلاجات")}</h2><p className="mt-1 text-xs text-slate-400">{label("Vue d'ensemble du cabinet", "نظرة عامة على العيادة")}</p></div><strong className="text-accent">{progress}%</strong></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all" style={{ width: `${progress}%` }} /></div></section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5"><div><h2 className="font-bold text-ink">{label("Plan de traitement", "خطة العلاج")}</h2><p className="mt-1 text-xs text-slate-400">{label("Par patient · statut · praticien", "حسب المريض · الحالة · الممارس")}</p></div><div className="flex gap-2"><select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)} className="rounded-lg border border-line px-3 py-2 text-xs"><option value="">{label("Tous les patients", "كل المرضى")}</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-line px-3 py-2 text-xs"><option value="">{label("Tous les statuts", "كل الحالات")}</option>{["À faire", "En cours", "Terminé"].map((status) => <option key={status}>{status}</option>)}</select></div></div>{loading ? <p className="p-8 text-center text-sm text-slate-400">{t("common.loading")}</p> : filtered.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">{label("Aucun traitement enregistré.", "لا توجد علاجات مسجلة.")}</p> : <div>{phases.map((phase) => <div key={phase}><div className="flex justify-between border-b border-line bg-slate-50 px-5 py-3 text-xs font-semibold text-ink"><span>{phase}</span><span className="text-slate-400">{filtered.filter((item) => item.phase === phase).length} acte(s)</span></div>{filtered.filter((item) => item.phase === phase).map((item) => <div key={item.id} className="grid items-center gap-3 border-b border-line px-5 py-4 text-xs md:grid-cols-[minmax(180px,1.5fr)_70px_100px_80px_100px]"><div><p className="font-semibold text-ink">{item.treatment}</p><p className="mt-1 text-[10px] text-slate-400">{item.patientName} · {item.dentist}</p></div><span className="text-slate-500">{item.teeth || "—"}</span><span className={`rounded-full px-2 py-1 text-center font-semibold ${statusStyles[item.status]}`}>{item.status}</span><span className="font-semibold text-slate-600">{formatMoney(Number(item.amount))}</span><span className="text-slate-500">{formatDate(item.plannedDate, undefined, locale)}</span></div>)}</div>)}</div>}</section>
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Phases types", "مراحل العلاج")}</h2><p className="mt-1 text-xs text-slate-400">{label("Progression des soins", "تقدم الرعاية")}</p><div className="mt-5 space-y-3">{phaseCounts.map((item, index) => <div key={item.phase} className="flex items-center gap-3 border-b border-line pb-3"><span className="grid h-6 w-6 place-items-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink">{item.phase}</p><p className="mt-1 text-[10px] text-slate-400">{item.count} acte(s)</p></div></div>)}{phaseCounts.length === 0 && <p className="py-6 text-sm text-slate-400">{label("Aucune phase.", "لا توجد مراحل.")}</p>}</div><p className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">{label("Les plans et tarifs sont établis et validés par le praticien.", "يتم إعداد الخطط والتعريفات واعتمادها من قبل الممارس.")}</p></section>
    </div>
    {modalOpen && <Modal title={label("Ajouter un acte", "إضافة علاج")} onClose={() => setModalOpen(false)}><form onSubmit={saveTreatment} className="space-y-4"><Field label={label("Patient", "المريض")}><select required value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })} className="input"><option value="">{label("Sélectionner", "اختر")}</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName}</option>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={label("Phase", "المرحلة")}><input className="input" value={form.phase} onChange={(event) => setForm({ ...form, phase: event.target.value })} /></Field><Field label={label("Acte / traitement", "العلاج")}><input required className="input" value={form.treatment} onChange={(event) => setForm({ ...form, treatment: event.target.value })} /></Field><Field label={label("Dent(s)", "السن")}><input className="input" value={form.teeth} onChange={(event) => setForm({ ...form, teeth: event.target.value })} /></Field><Field label={label("Montant", "المبلغ")}><input type="number" min="0" step="0.001" className="input" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label={label("Statut", "الحالة")}><select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Treatment["status"] })}>{["À faire", "En cours", "Terminé"].map((status) => <option key={status}>{status}</option>)}</select></Field><Field label={label("Date prévue", "التاريخ المتوقع")}><input type="date" className="input" value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })} /></Field></div><Field label={label("Praticien", "الممارس")}><input className="input" value={form.dentist} onChange={(event) => setForm({ ...form, dentist: event.target.value })} /></Field><div className="flex justify-end gap-2"><Button type="button" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? t("form.saving") : t("common.save")}</Button></div></form></Modal>}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-semibold text-slate-500">{label}<span className="mt-1 block">{children}</span></label>; }
function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: string; detail: string; tone: "violet" | "green" | "amber" }) { const colors = { violet: "bg-violet-50 text-violet-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div>; }
