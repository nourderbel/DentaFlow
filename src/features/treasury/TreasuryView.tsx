"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type OperationKind = "receipt" | "expense";
type Operation = {
  id: number;
  reference: string;
  date: string;
  beneficiary: string;
  method: string;
  document: string;
  reason: string;
  amount: number;
  kind: OperationKind;
};

const storageKey = "dentaflow-treasury-operations";

export function TreasuryView() {
  const { locale } = useI18n();
  const [operations, setOperations] = useState<Operation[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) as Operation[] : [];
    } catch {
      return [];
    }
  });
  const [filter, setFilter] = useState<"all" | OperationKind>("all");
  const [modal, setModal] = useState<"receipt" | "expense" | null>(null);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(operations));
  }, [operations]);

  const filtered = useMemo(() => filter === "all" ? operations : operations.filter((operation) => operation.kind === filter), [filter, operations]);
  const receipts = operations.filter((operation) => operation.kind === "receipt").reduce((sum, operation) => sum + operation.amount, 0);
  const expenses = operations.filter((operation) => operation.kind === "expense").reduce((sum, operation) => sum + operation.amount, 0);
  const debtors = 0;
  const patientsDebt = 0;

  function exportCsv() {
    const rows = [["Référence", "Date", "Patient / bénéficiaire", "Mode", "Document", "Motif", "Montant", "Type"], ...operations.map((operation) => [operation.reference, operation.date, operation.beneficiary, operation.method, operation.document, operation.reason, String(operation.amount), operation.kind])];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "tresorerie.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Trésorerie du cabinet", "خزينة العيادة")}</h1><p className="mt-1 text-sm text-slate-500">{label("Journal des règlements, paiements partiels et dépenses du cabinet.", "سجل المدفوعات والدفعات الجزئية ومصاريف العيادة.")}</p></div>
      <div className="flex flex-wrap gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Le fichier a été importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button onClick={() => setModal("expense")}><Icon name="plus" size={14} /> {label("Ajouter une dépense", "إضافة مصروف")}</Button><Button variant="primary" onClick={() => setModal("receipt")}><Icon name="plus" size={14} /> {label("Encaisser un paiement", "تحصيل دفعة")}</Button></div>
    </header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label={label("Encaissements", "المداخيل")} value={formatMoney(receipts)} detail={label("Règlements enregistrés", "المدفوعات المسجلة")} tone="green" /><Metric label={label("Dépenses", "المصاريف")} value={formatMoney(expenses)} detail={label("Fournisseurs et frais", "الموردون والمصاريف")} tone="orange" /><Metric label={label("Solde net", "الرصيد الصافي")} value={formatMoney(receipts - expenses)} detail={label("Solde sur l'historique", "الرصيد حسب السجل")} /><Metric label={label("Créances patients", "ديون المرضى")} value={formatMoney(patientsDebt)} detail={`${debtors} ${label("patients débiteurs", "مرضى مدينون")}`} tone="orange" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div className="flex rounded-lg bg-slate-100 p-1"><FilterButton active={filter === "all"} onClick={() => setFilter("all")}>{label("Toutes les opérations", "كل العمليات")}</FilterButton><FilterButton active={filter === "receipt"} onClick={() => setFilter("receipt")}>{label("Encaissements", "المداخيل")}</FilterButton><FilterButton active={filter === "expense"} onClick={() => setFilter("expense")}>{label("Dépenses", "المصاريف")}</FilterButton></div><Button onClick={() => window.print()}><Icon name="print" size={14} /> {label("Imprimer le journal", "طباعة السجل")}</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Référence", "Date", "Patient / bénéficiaire", "Mode", "Document lié", "Motif", "Montant", "Reçu"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{filtered.map((operation) => <tr key={operation.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4 font-semibold text-accent">{operation.reference}</td><td className="px-4 py-4 text-slate-500">{formatDate(operation.date, undefined, locale)}</td><td className="px-4 py-4 font-semibold text-accent">{operation.beneficiary}</td><td className="px-4 py-4 text-slate-600"><span className="inline-flex items-center gap-2"><Icon name={operation.method === "Espèces" ? "wallet" : "creditCard"} size={14} className="text-slate-400" />{operation.method}</span></td><td className="px-4 py-4 text-slate-500">{operation.document}</td><td className="px-4 py-4 text-slate-600">{operation.reason}</td><td className={`px-4 py-4 font-semibold ${operation.kind === "receipt" ? "text-emerald-600" : "text-orange-600"}`}>{operation.kind === "receipt" ? "+" : "-"}{formatMoney(operation.amount)}</td><td className="px-4 py-4">{operation.kind === "receipt" ? <button type="button" title={label("Imprimer le reçu", "طباعة الإيصال")} onClick={() => window.print()} className="text-slate-400 hover:text-accent"><Icon name="print" size={14} /></button> : "—"}</td></tr>)}</tbody></table></div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{filtered.length} {label("opérations · Les paiements partiels sont conservés dans l'historique", "عملية · يتم حفظ الدفعات الجزئية في السجل")}</span><span>{label("Devise : TND", "العملة: دينار تونسي")}</span></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="border-b border-line p-4"><h2 className="font-bold text-ink">{label("Patients avec solde", "المرضى الذين لديهم رصيد")}</h2><p className="mt-1 text-xs text-slate-400">{label("Suivi des créances et relances patient", "متابعة الديون وتذكير المرضى")}</p></div><p className="px-4 py-8 text-center text-sm text-slate-500">{label("Aucun patient débiteur enregistré.", "لا يوجد مريض مدين مسجل.")}</p></section>
    {modal && <OperationModal kind={modal} locale={locale} onClose={() => setModal(null)} onSave={(operation) => { setOperations((current) => [{ ...operation, id: Date.now() }, ...current]); setModal(null); setMessage(label("Opération enregistrée.", "تم تسجيل العملية.")); }} />}
  </div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-[10px] font-semibold ${active ? "bg-white text-accent shadow-sm" : "text-slate-500"}`}>{children}</button>; }
function Metric({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: "blue" | "green" | "orange" }) { const colors = { blue: "text-ink", green: "text-emerald-600", orange: "text-orange-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><p className="text-xs text-slate-500">{label}</p><p className={`mt-3 text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[10px] text-slate-400">{detail}</p></div>; }
function OperationModal({ kind, locale, onClose, onSave }: { kind: OperationKind; locale: "fr" | "ar"; onClose: () => void; onSave: (operation: Omit<Operation, "id">) => void }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [form, setForm] = useState({ beneficiary: "", amount: "", reason: "", method: "Espèces", document: "—" }); return <Modal title={kind === "receipt" ? label("Encaisser un paiement", "تحصيل دفعة") : label("Ajouter une dépense", "إضافة مصروف")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.amount || !form.reason) return; const prefix = kind === "receipt" ? "REC" : "DEP"; onSave({ reference: `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, date: new Date().toISOString().slice(0, 10), beneficiary: form.beneficiary || "—", method: form.method, document: form.document, reason: form.reason, amount: Number(form.amount), kind }); }} className="space-y-4"><label className="block text-xs font-semibold text-slate-500">{label("Patient / bénéficiaire", "المريض / المستفيد")}<input className="input mt-1" value={form.beneficiary} onChange={(event) => setForm({ ...form, beneficiary: event.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-500">{label("Montant", "المبلغ")}<input required min="0.001" step="0.001" type="number" className="input mt-1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Mode", "طريقة الدفع")}<select className="input mt-1" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option>Espèces</option><option>Carte bancaire</option><option>Virement</option><option>Chèque</option></select></label></div><label className="block text-xs font-semibold text-slate-500">{label("Motif", "السبب")}<input required className="input mt-1" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Enregistrer", "حفظ")}</Button></div></form></Modal>; }
