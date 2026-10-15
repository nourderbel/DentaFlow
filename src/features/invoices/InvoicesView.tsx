"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type InvoiceStatus = "Impayée" | "Partiellement payée" | "Payée";
type Invoice = { id: number; number: string; date: string; patient: string; total: number; paid: number; status: InvoiceStatus };

const storageKey = "dentaflow-invoices";

const statusStyles: Record<InvoiceStatus, string> = {
  "Impayée": "bg-orange-50 text-orange-700",
  "Partiellement payée": "bg-orange-50 text-orange-700",
  "Payée": "bg-emerald-50 text-emerald-700",
};

export function InvoicesView() {
  const { locale } = useI18n();
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "null") ?? []; } catch { return []; }
  });
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const billed = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const collected = invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const unpaid = invoices.filter((invoice) => invoice.status !== "Payée").length;
  const remaining = billed - collected;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(invoices));
  }, [invoices]);

  function exportCsv() {
    const rows = [["Numéro", "Date", "Patient", "Total", "Payé", "Reste", "Statut"], ...invoices.map((invoice) => [invoice.number, invoice.date, invoice.patient, String(invoice.total), String(invoice.paid), String(invoice.total - invoice.paid), invoice.status])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "factures.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function registerPayment(id: number, amount: number) {
    setInvoices((current) => current.map((invoice) => {
      if (invoice.id !== id) return invoice;
      const paid = Math.min(invoice.total, invoice.paid + amount);
      return { ...invoice, paid, status: paid >= invoice.total ? "Payée" : paid > 0 ? "Partiellement payée" : "Impayée" };
    }));
    setPaymentInvoice(null);
    setMessage(label("Paiement enregistré.", "تم تسجيل الدفعة."));
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Factures", "الفواتير")}</h1><p className="mt-1 text-sm text-slate-500">{label("Facturation en dinars tunisiens, paiements partiels et reçus imprimables.", "الفوترة بالدينار التونسي والدفعات الجزئية والإيصالات القابلة للطباعة.")}</p></div><div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Fichier importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} /> {label("Nouvelle facture", "فاتورة جديدة")}</Button></div></header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label={label("Montant facturé", "المبلغ المفوتر")} value={formatMoney(billed)} detail={`${invoices.length} ${label("factures émises", "فواتير صادرة")}`} /><Metric label={label("Montant encaissé", "المبلغ المحصل")} value={formatMoney(collected)} detail={label("Paiements enregistrés", "الدفعات المسجلة")} tone="green" /><Metric label={label("Reste à recouvrer", "المتبقي للتحصيل")} value={formatMoney(remaining)} detail={label("Solde des factures ouvertes", "رصيد الفواتير المفتوحة")} tone="orange" /><Metric label={label("Factures impayées", "الفواتير غير المدفوعة")} value={unpaid} detail={label("Possibilité de paiement partiel", "إمكانية الدفع الجزئي")} /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Numéro", "Date", "Patient", "Total", "Payé", "Reste à payer", "Statut", "Actions"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4 font-semibold text-accent">{invoice.number}</td><td className="px-4 py-4 text-slate-500">{formatDate(invoice.date, undefined, locale)}</td><td className="px-4 py-4 font-semibold text-accent">{invoice.patient}</td><td className="px-4 py-4 font-semibold text-ink">{formatMoney(invoice.total)}</td><td className="px-4 py-4 text-slate-600">{formatMoney(invoice.paid)}</td><td className="px-4 py-4 font-semibold text-ink">{formatMoney(invoice.total - invoice.paid)}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[invoice.status]}`}>● {invoice.status}</span></td><td className="px-4 py-4"><div className="flex items-center gap-3"><button type="button" onClick={() => window.print()} title={label("Imprimer", "طباعة")} className="text-slate-400 hover:text-accent"><Icon name="print" size={14} /></button>{invoice.status !== "Payée" && <button type="button" onClick={() => setPaymentInvoice(invoice)} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700">{label("Encaisser", "تحصيل")}</button>}</div></td></tr>)}</tbody></table></div><div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{invoices.length} {label("factures · Paiements modifiables depuis la fiche patient", "فواتير · الدفعات قابلة للتعديل من ملف المريض")}</span><span className="font-semibold text-accent">{label("Ouvrir la trésorerie →", "فتح الخزينة ←")}</span></div></section>
    {paymentInvoice && <PaymentModal invoice={paymentInvoice} locale={locale} onClose={() => setPaymentInvoice(null)} onSave={registerPayment} />}
    {newOpen && <NewInvoiceModal locale={locale} onClose={() => setNewOpen(false)} onSave={(invoice) => { setInvoices((current) => [{ ...invoice, id: Date.now() }, ...current]); setNewOpen(false); setMessage(label("La facture a été créée.", "تم إنشاء الفاتورة.")); }} />}
  </div>;
}

function Metric({ label, value, detail, tone = "blue" }: { label: string; value: string | number; detail: string; tone?: "blue" | "green" | "orange" }) {
  const colors = { blue: "text-ink", green: "text-emerald-600", orange: "text-orange-600" };
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><p className="text-xs text-slate-500">{label}</p><p className={`mt-3 text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[10px] text-slate-400">{detail}</p></div>;
}

function PaymentModal({ invoice, locale, onClose, onSave }: { invoice: Invoice; locale: "fr" | "ar"; onClose: () => void; onSave: (id: number, amount: number) => void }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [amount, setAmount] = useState(String(invoice.total - invoice.paid));
  return <Modal title={label("Enregistrer un paiement", "تسجيل دفعة")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); const value = Number(amount); if (value > 0) onSave(invoice.id, value); }} className="space-y-4"><p className="text-sm text-slate-500">{invoice.number} · {invoice.patient}<br />{label("Reste à payer", "المتبقي للدفع")}: <strong>{formatMoney(invoice.total - invoice.paid)}</strong></p><label className="block text-xs font-semibold text-slate-500">{label("Montant encaissé", "المبلغ المحصل")}<input required min="0.001" step="0.001" type="number" className="input mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Enregistrer", "حفظ")}</Button></div></form></Modal>;
}

function NewInvoiceModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (invoice: Omit<Invoice, "id">) => void }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [form, setForm] = useState({ patient: "", total: "" });
  return <Modal title={label("Nouvelle facture", "فاتورة جديدة")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.patient || !form.total) return; onSave({ number: `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, date: new Date().toISOString().slice(0, 10), patient: form.patient, total: Number(form.total), paid: 0, status: "Impayée" }); }} className="space-y-4"><label className="block text-xs font-semibold text-slate-500">{label("Patient", "المريض")}<input required className="input mt-1" value={form.patient} onChange={(event) => setForm({ ...form, patient: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Total TTC", "المجموع")}<input required min="0" step="0.001" type="number" className="input mt-1" value={form.total} onChange={(event) => setForm({ ...form, total: event.target.value })} /></label><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Créer la facture", "إنشاء الفاتورة")}</Button></div></form></Modal>;
}
