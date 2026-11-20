"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

type Supplier = { id: number; code: string; name: string; contact: string; phone: string; email: string; specialty: string; address: string };

export function SuppliersView() {
  const { locale } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [expenseSupplier, setExpenseSupplier] = useState<Supplier | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/suppliers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? label("Chargement des fournisseurs impossible.", "تعذر تحميل الموردين."));
        return body as { data: Supplier[] };
      })
      .then(({ data }) => { if (!controller.signal.aborted) setSuppliers(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : label("Chargement des fournisseurs impossible.", "تعذر تحميل الموردين."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const filtered = useMemo(() => suppliers.filter((supplier) => [supplier.name, supplier.contact, supplier.phone, supplier.email, supplier.specialty, supplier.address].some((value) => value.toLowerCase().includes(search.toLowerCase()))), [search, suppliers]);

  async function createSupplier(values: Omit<Supplier, "id" | "code">) {
    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Ajout du fournisseur impossible.", "تعذرت إضافة المورد."));
    setSuppliers((current) => [body.data as Supplier, ...current]);
    setModalOpen(false);
    setError("");
    setMessage(label("Le fournisseur a été ajouté.", "تمت إضافة المورد."));
  }

  async function saveSupplierExpense(supplier: Supplier, operation: { date: string; amount: number; method: string; document: string; reason: string }) {
    const response = await fetch("/api/treasury", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...operation, amount: String(operation.amount), beneficiary: supplier.name, kind: "expense" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Enregistrement de la dépense impossible.", "تعذر تسجيل المصروف."));
    setExpenseSupplier(null);
    setError("");
    setMessage(label("La dépense a été enregistrée dans la trésorerie.", "تم تسجيل المصروف في الخزينة."));
  }

  function exportCsv() {
    const rows = [["Fournisseur", "Code", "Contact", "Téléphone", "E-mail", "Spécialité", "Adresse"], ...suppliers.map((s) => [s.name, s.code, s.contact, s.phone, s.email, s.specialty, s.address])];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "fournisseurs.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Fournisseurs", "الموردون")}</h1><p className="mt-1 text-sm text-slate-500">{label("Contacts, familles de produits et historique des achats du cabinet.", "جهات الاتصال وفئات المنتجات وتاريخ مشتريات العيادة.")}</p></div><div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Le fichier a été importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={14} /> {label("Ajouter un fournisseur", "إضافة مورد")}</Button></div></header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-3"><Metric icon="truck" label={label("Fournisseurs actifs", "الموردون النشطون")} value={suppliers.length} detail={label("Carnet du cabinet", "دليل العيادة")} tone="green" /><Metric icon="wallet" label={label("Dépenses ce mois", "مصاريف هذا الشهر")} value={formatMoney(0)} detail={label("Transactions enregistrées", "المعاملات المسجلة")} tone="orange" /><Metric icon="flask" label={label("Commandes laboratoire", "طلبات المختبر")} value={0} detail={label("Réseau de partenaires", "شبكة الشركاء")} tone="violet" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="border-b border-line p-4"><label className="relative block w-full max-w-sm"><Icon name="search" size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="search-with-icon w-full rounded-xl border border-line py-2 ps-11 pe-3 text-xs outline-none transition focus:border-accent" placeholder={label("Rechercher un fournisseur…", "البحث عن مورد…")} /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Fournisseur", "Contact", "Téléphone", "E-mail", "Spécialité", "Adresse", "Actions"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">{label("Chargement des fournisseurs…", "جارٍ تحميل الموردين…")}</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">{label("Aucun fournisseur enregistré.", "لا يوجد موردون مسجلون.")}</td></tr> : filtered.map((supplier) => <tr key={supplier.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4"><p className="font-semibold text-accent">{supplier.name}</p><p className="mt-1 text-[10px] text-slate-400">{supplier.code}</p></td><td className="px-4 py-4 text-slate-600">{supplier.contact || "—"}</td><td className="px-4 py-4 text-slate-600">{supplier.phone || "—"}</td><td className="px-4 py-4 text-slate-600">{supplier.email || "—"}</td><td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">● {supplier.specialty || "—"}</span></td><td className="px-4 py-4 text-slate-600">{supplier.address || "—"}</td><td className="px-4 py-4"><Button onClick={() => setExpenseSupplier(supplier)} title={label("Enregistrer une dépense", "تسجيل مصروف")}><Icon name="wallet" size={14} />{label("Enregistrer une dépense", "تسجيل مصروف")}</Button></td></tr>)}</tbody></table></div></section>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Achats récents", "المشتريات الأخيرة")}</h2><p className="mt-1 text-xs text-slate-400">{label("Opérations fournisseurs saisies en trésorerie", "عمليات الموردين المسجلة في الخزينة")}</p><p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">{label("Aucun achat enregistré.", "لا توجد مشتريات مسجلة.")}</p></section><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Commandes ouvertes", "الطلبات المفتوحة")}</h2><p className="mt-1 text-xs text-slate-400">{label("Suivi des travaux de laboratoire", "متابعة أعمال المختبر")}</p><p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">{label("Aucune commande enregistrée.", "لا توجد طلبات مسجلة.")}</p></section></div>
    {modalOpen && <SupplierModal locale={locale} onClose={() => setModalOpen(false)} onSave={createSupplier} />}
    {expenseSupplier && <SupplierExpenseModal supplier={expenseSupplier} locale={locale} onClose={() => setExpenseSupplier(null)} onSave={saveSupplierExpense} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number | string; detail: string; tone: "green" | "orange" | "violet" }) { const colors = { green: "bg-emerald-50 text-emerald-600", orange: "bg-orange-50 text-orange-600", violet: "bg-violet-50 text-violet-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }
function SupplierModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (supplier: Omit<Supplier, "id" | "code">) => Promise<void> }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [form, setForm] = useState({ name: "", contact: "", phone: "", email: "", specialty: "", address: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Ajout du fournisseur impossible.", "تعذرت إضافة المورد."));
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={label("Ajouter un fournisseur", "إضافة مورد")} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      {(["name", "contact", "phone", "email", "specialty", "address"] as const).map((key) => <label key={key} className="block text-xs font-semibold capitalize text-slate-500">
        {key}
        <input required={["name", "phone", "email"].includes(key)} type={key === "email" ? "email" : "text"} className="input mt-1" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
      </label>)}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Ajouter", "إضافة")}</Button>
      </div>
    </form>
  </Modal>;
}

function SupplierExpenseModal({ supplier, locale, onClose, onSave }: {
  supplier: Supplier;
  locale: "fr" | "ar";
  onClose: () => void;
  onSave: (supplier: Supplier, operation: { date: string; amount: number; method: string; document: string; reason: string }) => Promise<void>;
}) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const today = new Date();
  const [form, setForm] = useState({
    date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    amount: "",
    method: "Espèces",
    document: "",
    reason: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(supplier, { ...form, amount: Number(form.amount), document: form.document.trim() || "—" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Enregistrement de la dépense impossible.", "تعذر تسجيل المصروف."));
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={label("Enregistrer une dépense", "تسجيل مصروف")} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">{label("Montant (DT)", "المبلغ (د.ت)")}<input required min="0.001" max="999999999" step="0.001" type="number" className="input mt-1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        <label className="block text-sm font-semibold text-slate-700">{label("Mode de règlement", "طريقة الدفع")}<select className="input mt-1" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}><option>Espèces</option><option>Carte bancaire</option><option>Virement</option><option>Chèque</option></select></label>
        <label className="block text-sm font-semibold text-slate-700">{label("Date", "التاريخ")}<input required type="date" className="input mt-1" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <label className="block text-sm font-semibold text-slate-700">{label("Fournisseur / bénéficiaire", "المورد / المستفيد")}<input readOnly className="input mt-1 bg-slate-50" value={supplier.name} /></label>
        <label className="block text-sm font-semibold text-slate-700">{label("Référence", "المرجع")}<input maxLength={80} className="input mt-1" value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} /></label>
      </div>
      <label className="block text-sm font-semibold text-slate-700">{label("Motif de la dépense", "سبب المصروف")}<textarea required maxLength={255} className="input mt-1" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}><Icon name="check" size={14} />{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Enregistrer", "حفظ")}</Button></div>
    </form>
  </Modal>;
}
