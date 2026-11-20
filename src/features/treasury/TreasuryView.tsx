"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type OperationKind = "receipt" | "expense";
type Operation = {
  id: string;
  reference: string;
  date: string;
  beneficiary: string;
  method: string;
  document: string;
  reason: string;
  amount: number;
  kind: OperationKind;
};
type Debtor = { patientId: number; patientNumber: string; patient: string; balance: number; invoiceCount: number };
type TreasuryData = { operations: Operation[]; debtors: Debtor[] };

export function TreasuryView() {
  const { locale } = useI18n();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | OperationKind>("all");
  const [modal, setModal] = useState<OperationKind | null>(null);
  const [message, setMessage] = useState("");
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/treasury", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (locale === "ar" ? "تعذر تحميل بيانات الخزينة." : "Chargement des données de trésorerie impossible."));
        return body as { data: TreasuryData };
      })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setOperations(data.operations);
        setDebtors(data.debtors);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : (locale === "ar" ? "تعذر تحميل بيانات الخزينة." : "Chargement des données de trésorerie impossible."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locale]);

  const filtered = useMemo(
    () => filter === "all" ? operations : operations.filter((operation) => operation.kind === filter),
    [filter, operations],
  );
  const receipts = operations.filter((operation) => operation.kind === "receipt").reduce((sum, operation) => sum + operation.amount, 0);
  const expenses = operations.filter((operation) => operation.kind === "expense").reduce((sum, operation) => sum + operation.amount, 0);
  const patientsDebt = debtors.reduce((sum, debtor) => sum + debtor.balance, 0);

  function exportCsv() {
    const rows = [
      ["Référence", "Date", "Patient / bénéficiaire", "Mode", "Document", "Motif", "Montant", "Type"],
      ...operations.map((operation) => [
        operation.reference, operation.date, operation.beneficiary, operation.method,
        operation.document, operation.reason, String(operation.amount), operation.kind,
      ]),
    ];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tresorerie.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveOperation(operation: Omit<Operation, "id" | "reference">) {
    const response = await fetch("/api/treasury", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...operation, amount: String(operation.amount) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Enregistrement de l’opération impossible.", "تعذر تسجيل العملية."));
    setOperations((current) => [body.data as Operation, ...current]);
    setModal(null);
    setError("");
    setMessage(label("Opération enregistrée.", "تم تسجيل العملية."));
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Trésorerie du cabinet", "خزينة العيادة")}</h1>
        <p className="mt-1 text-sm text-slate-500">{label("Journal des règlements, paiements partiels et dépenses du cabinet.", "سجل المدفوعات والدفعات الجزئية ومصاريف العيادة.")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setModal("expense")}><Icon name="plus" size={14} /> {label("Ajouter une dépense", "إضافة مصروف")}</Button>
        <Button onClick={exportCsv} disabled={loading || operations.length === 0}><Icon name="download" size={14} /> CSV</Button>
        <Button variant="primary" onClick={() => setModal("receipt")}><Icon name="plus" size={14} /> {label("Autre encaissement", "إيراد آخر")}</Button>
      </div>
    </header>
    {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={label("Encaissements", "المداخيل")} value={formatMoney(receipts)} detail={label("Paiements et autres recettes enregistrés", "الدفعات والإيرادات الأخرى المسجلة")} tone="green" />
      <Metric label={label("Dépenses", "المصاريف")} value={formatMoney(expenses)} detail={label("Dépenses saisies dans le journal", "المصاريف المسجلة")} tone="orange" />
      <Metric label={label("Solde net", "الرصيد الصافي")} value={formatMoney(receipts - expenses)} detail={label("Encaissements moins dépenses", "الإيرادات مطروحًا منها المصاريف")} />
      <Metric label={label("Créances patients", "ديون المرضى")} value={formatMoney(patientsDebt)} detail={`${debtors.length} ${label("patients débiteurs", "مرضى مدينون")}`} tone="orange" />
    </div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex rounded-lg bg-slate-100 p-1">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>{label("Toutes les opérations", "كل العمليات")}</FilterButton>
          <FilterButton active={filter === "receipt"} onClick={() => setFilter("receipt")}>{label("Encaissements", "المداخيل")}</FilterButton>
          <FilterButton active={filter === "expense"} onClick={() => setFilter("expense")}>{label("Dépenses", "المصاريف")}</FilterButton>
        </div>
        <Button onClick={() => window.print()}><Icon name="print" size={14} /> {label("Imprimer le journal", "طباعة السجل")}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>
            {["Référence", "Date", "Patient / bénéficiaire", "Mode", "Document lié", "Motif", "Montant", "Reçu"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{label("Chargement des opérations…", "جارٍ تحميل العمليات…")}</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{label("Aucune opération pour ce filtre.", "لا توجد عمليات لهذا المرشح.")}</td></tr>
                : filtered.map((operation) => <tr key={operation.id} className="border-t border-line transition hover:bg-slate-50/60">
                  <td className="px-4 py-4 font-semibold text-accent">{operation.reference}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(operation.date, undefined, locale)}</td>
                  <td className="px-4 py-4 font-semibold text-ink">{operation.beneficiary}</td>
                  <td className="px-4 py-4 text-slate-700">{operation.method}</td>
                  <td className="px-4 py-4 text-slate-600">{operation.document}</td>
                  <td className="px-4 py-4 text-slate-700">{operation.reason}</td>
                  <td className={`px-4 py-4 font-semibold ${operation.kind === "receipt" ? "text-emerald-700" : "text-orange-700"}`}>{operation.kind === "receipt" ? "+" : "-"}{formatMoney(operation.amount)}</td>
                  <td className="px-4 py-4">{operation.kind === "receipt" && <button type="button" title={label("Imprimer le reçu", "طباعة الإيصال")} onClick={() => window.print()} className="text-slate-500 hover:text-accent"><Icon name="print" size={14} /></button>}</td>
                </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-500">
        <span>{filtered.length} {label("opérations", "عملية")}</span><span>{label("Devise : TND", "العملة: دينار تونسي")}</span>
      </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line p-4">
        <h2 className="font-bold text-ink">{label("Patients avec solde", "المرضى الذين لديهم رصيد")}</h2>
        <p className="mt-1 text-xs text-slate-500">{label("Créances calculées à partir des factures impayées ou partiellement payées.", "الديون محسوبة من الفواتير غير المدفوعة أو المدفوعة جزئيًا.")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
            {[label("N° patient", "رقم المريض"), label("Patient", "المريض"), label("Factures ouvertes", "الفواتير المفتوحة"), label("Solde à payer", "الرصيد المستحق")].map((head) => <th key={head} className="px-4 py-3 font-semibold">{head}</th>)}
          </tr></thead>
          <tbody>{loading ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{label("Chargement…", "جارٍ التحميل…")}</td></tr>
            : debtors.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-600">{label("Aucun patient débiteur enregistré.", "لا يوجد مريض مدين مسجل.")}</td></tr>
              : debtors.map((debtor) => <tr key={debtor.patientId} className="border-t border-line">
                <td className="px-4 py-3 font-semibold text-accent">{debtor.patientNumber}</td>
                <td className="px-4 py-3 font-semibold text-ink">{debtor.patient}</td>
                <td className="px-4 py-3 text-slate-700">{debtor.invoiceCount}</td>
                <td className="px-4 py-3 font-bold text-orange-700">{formatMoney(debtor.balance)}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    {modal && <OperationModal kind={modal} locale={locale} onClose={() => setModal(null)} onSave={saveOperation} />}
  </div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-md px-3 py-2 text-[10px] font-semibold ${active ? "bg-white text-accent shadow-sm" : "text-slate-600"}`}>{children}</button>;
}

function Metric({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: "blue" | "green" | "orange" }) {
  const colors = { blue: "text-ink", green: "text-emerald-700", orange: "text-orange-700" };
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <p className="text-sm font-medium text-slate-700">{label}</p><p className={`mt-3 text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-xs text-slate-600">{detail}</p>
  </div>;
}

function OperationModal({ kind, locale, onClose, onSave }: {
  kind: OperationKind;
  locale: "fr" | "ar";
  onClose: () => void;
  onSave: (operation: Omit<Operation, "id" | "reference">) => Promise<void>;
}) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const localDate = new Date();
  const initialDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
  const [form, setForm] = useState({ date: initialDate, beneficiary: "", amount: "", reason: "", method: "Espèces", document: "—" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, amount: Number(form.amount), kind });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Enregistrement de l’opération impossible.", "تعذر تسجيل العملية."));
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={kind === "receipt" ? label("Autre encaissement", "إيراد آخر") : label("Ajouter une dépense", "إضافة مصروف")} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4" dir={locale === "ar" ? "rtl" : "ltr"}>
      <label className="block text-sm font-semibold text-slate-700">{label("Date", "التاريخ")}<input required type="date" className="input mt-1" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
      <label className="block text-sm font-semibold text-slate-700">{label("Patient / bénéficiaire", "المريض / المستفيد")}<input required maxLength={180} className="input mt-1" value={form.beneficiary} onChange={(event) => setForm({ ...form, beneficiary: event.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">{label("Montant", "المبلغ")}<input required min="0.001" max="999999999" step="0.001" type="number" className="input mt-1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        <label className="block text-sm font-semibold text-slate-700">{label("Mode", "طريقة الدفع")}<select className="input mt-1" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option>Espèces</option><option>Carte bancaire</option><option>Virement</option><option>Chèque</option></select></label>
      </div>
      <label className="block text-sm font-semibold text-slate-700">{label("Document lié (facultatif)", "المستند المرتبط (اختياري)")}<input maxLength={80} className="input mt-1" value={form.document === "—" ? "" : form.document} onChange={(event) => setForm({ ...form, document: event.target.value || "—" })} /></label>
      <label className="block text-sm font-semibold text-slate-700">{label("Motif", "السبب")}<input required maxLength={255} className="input mt-1" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Enregistrer", "حفظ")}</Button></div>
    </form>
  </Modal>;
}
