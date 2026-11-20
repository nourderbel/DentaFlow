"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PatientSearchField, type PatientOption } from "@/features/quotes/PatientSearchField";
import { ClinicDocumentHeader } from "@/features/documents/ClinicDocumentHeader";
import { DocumentSignatureFields } from "@/features/documents/DocumentSignatureFields";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type InvoiceStatus = "Impayée" | "Partiellement payée" | "Payée";
type InvoiceFilter = "all" | "pending" | "partial" | "overdue" | "paid";
type InvoiceItem = { description: string; quantity: number; unitPrice: number; discount: number; tooth: number | null };
type Invoice = {
  id: number; number: string; date: string; patientId: number; patient: string; patientNumber: string;
  patientAddress: string | null; patientCity: string | null; patientGovernorate: string | null;
  patientPhone: string; patientNationalId: string | null; subtotal: number; total: number; discount: number;
  paid: number; status: InvoiceStatus; quoteId: number | null; items: InvoiceItem[];
};
type ClinicProfile = { name: string; address: string; city: string; governorate: string; phone: string; email: string };

const statusStyles: Record<InvoiceStatus, string> = {
  "Impayée": "bg-orange-50 text-orange-700",
  "Partiellement payée": "bg-orange-50 text-orange-700",
  "Payée": "bg-emerald-50 text-emerald-700",
};

export function InvoicesView() {
  const { locale } = useI18n();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [downloadInvoice, setDownloadInvoice] = useState<Invoice | null>(null);
  const [clinic, setClinic] = useState<ClinicProfile>({ name: "DentaClinic", address: "", city: "", governorate: "", phone: "", email: "" });
  const [clinicLoaded, setClinicLoaded] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("all");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const invoiceDocumentRef = useRef<HTMLElement>(null);
  const generatingPdf = useRef(false);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const billed = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const collected = invoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const unpaid = invoices.filter((invoice) => invoice.status !== "Payée").length;
  const remaining = billed - collected;
  const localToday = new Date();
  const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const patients = useMemo(
    () => [...new Map(invoices.map((invoice) => [invoice.patientId, { id: invoice.patientId, name: invoice.patient }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [invoices, locale],
  );
  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return invoices.filter((invoice) => {
      const matchesSearch = !query || [invoice.number, invoice.patient, invoice.patientNumber]
        .some((value) => value.toLocaleLowerCase(locale).includes(query));
      const matchesPatient = selectedPatientId === "all" || String(invoice.patientId) === selectedPatientId;
      const isOverdue = invoice.status !== "Payée" && invoice.date < today;
      const matchesStatus = invoiceFilter === "all"
        || (invoiceFilter === "pending" && invoice.status === "Impayée" && !isOverdue)
        || (invoiceFilter === "partial" && invoice.status === "Partiellement payée")
        || (invoiceFilter === "overdue" && isOverdue)
        || (invoiceFilter === "paid" && invoice.status === "Payée");
      return matchesSearch && matchesPatient && matchesStatus;
    });
  }, [invoices, search, selectedPatientId, invoiceFilter, today, locale]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/invoices", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (locale === "ar" ? "تعذر تحميل الفواتير." : "Chargement des factures impossible."));
        return body as { data: Invoice[] };
      })
      .then(({ data }) => { if (!controller.signal.aborted) setInvoices(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : (locale === "ar" ? "تعذر تحميل الفواتير." : "Chargement des factures impossible."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/clinic-profile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (locale === "ar" ? "تعذر تحميل معلومات العيادة." : "Chargement des informations du cabinet impossible."));
        return body as { data: ClinicProfile };
      })
      .then(({ data }) => { if (!controller.signal.aborted) setClinic(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : (locale === "ar" ? "تعذر تحميل معلومات العيادة." : "Chargement des informations du cabinet impossible."));
      })
      .finally(() => { if (!controller.signal.aborted) setClinicLoaded(true); });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    if (!downloadInvoice || !clinicLoaded || !invoiceDocumentRef.current || generatingPdf.current) return;
    const invoiceToDownload = downloadInvoice;
    const timeout = window.setTimeout(() => {
      if (generatingPdf.current) return;
      generatingPdf.current = true;
      void generatePdf();
    }, 0);

    async function generatePdf() {
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
        if (!invoiceDocumentRef.current) return;
        const canvas = await html2canvas(invoiceDocumentRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: invoiceDocumentRef.current.scrollWidth,
          windowHeight: invoiceDocumentRef.current.scrollHeight,
        });
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const margin = 12;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const contentWidth = pageWidth - margin * 2;
        const sliceHeight = Math.floor(canvas.width * (pageHeight - margin * 2) / contentWidth);
        for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeight, page += 1) {
          const currentHeight = Math.min(sliceHeight, canvas.height - offset);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = currentHeight;
          const context = pageCanvas.getContext("2d");
          if (!context) throw new Error(locale === "ar" ? "تعذر تجهيز صفحة PDF." : "Impossible de préparer la page PDF.");
          context.drawImage(canvas, 0, offset, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
          if (page > 0) pdf.addPage();
          pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, contentWidth, currentHeight * contentWidth / canvas.width);
        }
        pdf.save(`facture-${invoiceToDownload.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
        setError("");
        setMessage(locale === "ar"
          ? `تم تنزيل الفاتورة ${invoiceToDownload.number} بصيغة PDF.`
          : `La facture ${invoiceToDownload.number} a été téléchargée en PDF.`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : (locale === "ar" ? "تعذر إنشاء ملف PDF للفاتورة." : "Génération de la facture PDF impossible."));
      } finally {
        generatingPdf.current = false;
        setDownloadInvoice(null);
      }
    }
    return () => window.clearTimeout(timeout);
  }, [downloadInvoice, clinicLoaded, locale]);

  function exportCsv() {
    const rows = [["Numéro", "Date", "Patient", "Total", "Payé", "Reste", "Statut"], ...filteredInvoices.map((invoice) => [invoice.number, invoice.date, invoice.patient, String(invoice.total), String(invoice.paid), String(invoice.total - invoice.paid), invoice.status])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "factures.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function registerPayment(id: number, amount: string, method: string, paymentDate: string) {
    const response = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, method, paymentDate }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Enregistrement du paiement impossible.", "تعذر تسجيل الدفعة."));
    const update = body.data as { id: number; paid: number; status: InvoiceStatus };
    setInvoices((current) => current.map((invoice) => invoice.id === id ? { ...invoice, paid: update.paid, status: update.status } : invoice));
    setPaymentInvoice(null);
    setMessage(label("Paiement enregistré.", "تم تسجيل الدفعة."));
  }

  async function createInvoice(invoice: { patientId: number; description: string; amount: string }) {
    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invoice),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Création de la facture impossible.", "تعذر إنشاء الفاتورة."));
    setInvoices((current) => [body.data as Invoice, ...current]);
    setNewOpen(false);
    setMessage(label("La facture a été enregistrée.", "تم حفظ الفاتورة."));
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Factures", "الفواتير")}</h1><p className="mt-1 text-sm text-slate-500">{label("Facturation en dinars tunisiens, paiements partiels et reçus imprimables.", "الفوترة بالدينار التونسي والدفعات الجزئية والإيصالات القابلة للطباعة.")}</p></div><div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Fichier importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} /> {label("Nouvelle facture", "فاتورة جديدة")}</Button></div></header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label={label("Montant facturé", "المبلغ المفوتر")} value={formatMoney(billed)} detail={`${invoices.length} ${label("factures émises", "فواتير صادرة")}`} /><Metric label={label("Montant encaissé", "المبلغ المحصل")} value={formatMoney(collected)} detail={label("Paiements enregistrés", "الدفعات المسجلة")} tone="green" /><Metric label={label("Reste à recouvrer", "المتبقي للتحصيل")} value={formatMoney(remaining)} detail={label("Solde des factures ouvertes", "رصيد الفواتير المفتوحة")} tone="orange" /><Metric label={label("Factures impayées", "الفواتير غير المدفوعة")} value={unpaid} detail={label("Possibilité de paiement partiel", "إمكانية الدفع الجزئي")} /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="space-y-4 border-b border-line p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="search-with-icon w-full rounded-xl border border-line bg-slate-50 py-2.5 ps-11 pe-4 text-sm outline-none transition focus:border-accent focus:bg-white" placeholder={label("Rechercher une facture ou un patient…", "ابحث عن فاتورة أو مريض…")} aria-label={label("Rechercher une facture ou un patient", "ابحث عن فاتورة أو مريض")} />
          </div>
          <select value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-accent sm:w-52" aria-label={label("Filtrer par patient", "تصفية حسب المريض")}>
            <option value="all">{label("Tous les patients", "كل المرضى")}</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={label("Filtrer les factures par statut", "تصفية الفواتير حسب الحالة")}>
          <InvoiceFilterButton active={invoiceFilter === "all"} onClick={() => setInvoiceFilter("all")}>{label("Toutes", "الكل")}</InvoiceFilterButton>
          <InvoiceFilterButton active={invoiceFilter === "pending"} onClick={() => setInvoiceFilter("pending")}>{label("En attente", "في الانتظار")}</InvoiceFilterButton>
          <InvoiceFilterButton active={invoiceFilter === "partial"} onClick={() => setInvoiceFilter("partial")}>{label("Partielles", "جزئية")}</InvoiceFilterButton>
          <InvoiceFilterButton active={invoiceFilter === "overdue"} onClick={() => setInvoiceFilter("overdue")} overdue>{label("En retard", "متأخرة")}</InvoiceFilterButton>
          <InvoiceFilterButton active={invoiceFilter === "paid"} onClick={() => setInvoiceFilter("paid")}>{label("Payées", "مدفوعة")}</InvoiceFilterButton>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Numéro", "Date", "Patient", "Total", "Payé", "Reste à payer", "Statut", "Actions"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">{label("Chargement des factures…", "جارٍ تحميل الفواتير…")}</td></tr> : filteredInvoices.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{label("Aucune facture ne correspond aux filtres.", "لا توجد فواتير مطابقة للتصفية.")}</td></tr> : filteredInvoices.map((invoice) => <tr key={invoice.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4 font-semibold text-accent">{invoice.number}</td><td className="px-4 py-4 text-slate-500">{formatDate(invoice.date, undefined, locale)}</td><td className="px-4 py-4 font-semibold text-accent">{invoice.patient}</td><td className="px-4 py-4 font-semibold text-ink">{formatMoney(invoice.total)}</td><td className="px-4 py-4 text-slate-600">{formatMoney(invoice.paid)}</td><td className="px-4 py-4 font-semibold text-ink">{formatMoney(invoice.total - invoice.paid)}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[invoice.status]}`}>● {invoice.status}</span></td><td className="px-4 py-4"><div className="flex items-center gap-3"><button type="button" onClick={() => setDownloadInvoice(invoice)} title={label("Télécharger la facture en PDF", "تنزيل الفاتورة بصيغة PDF")} aria-label={label(`Télécharger la facture ${invoice.number} en PDF`, `تنزيل الفاتورة ${invoice.number} بصيغة PDF`)} className="text-slate-400 hover:text-accent"><Icon name="download" size={14} /></button>{invoice.status !== "Payée" && <button type="button" onClick={() => setPaymentInvoice(invoice)} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700">{label("Encaisser", "تحصيل")}</button>}</div></td></tr>)}</tbody></table></div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{filteredInvoices.length} / {invoices.length} {label("facture(s)", "فاتورة")}</span><span className="font-semibold text-accent">{label("Ouvrir la trésorerie →", "فتح الخزينة ←")}</span></div>
    </section>
    {downloadInvoice && <InvoicePrintDocument ref={invoiceDocumentRef} invoice={downloadInvoice} clinic={clinic} locale={locale} />}
    {paymentInvoice && <PaymentModal invoice={paymentInvoice} locale={locale} onClose={() => setPaymentInvoice(null)} onSave={registerPayment} />}
    {newOpen && <NewInvoiceModal locale={locale} onClose={() => setNewOpen(false)} onSave={createInvoice} />}
  </div>;
}

function Metric({ label, value, detail, tone = "blue" }: { label: string; value: string | number; detail: string; tone?: "blue" | "green" | "orange" }) {
  const colors = { blue: "text-ink", green: "text-emerald-600", orange: "text-orange-600" };
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><p className="text-xs text-slate-500">{label}</p><p className={`mt-3 text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[10px] text-slate-400">{detail}</p></div>;
}

function InvoiceFilterButton({ active, onClick, children, overdue = false }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  overdue?: boolean;
}) {
  return <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
      active
        ? "border-teal-600 bg-teal-600 text-white shadow-sm"
        : overdue
          ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`}
  >{children}</button>;
}

const InvoicePrintDocument = forwardRef<HTMLElement, { invoice: Invoice; clinic: ClinicProfile; locale: "fr" | "ar" }>(function InvoicePrintDocument({ invoice, clinic, locale }, ref) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const address = [invoice.patientAddress, invoice.patientCity, invoice.patientGovernorate].filter(Boolean).join(" · ");
  return (
    <article ref={ref} className="quote-print-root invoice-print-root" dir={locale === "ar" ? "rtl" : "ltr"}>
      <ClinicDocumentHeader clinic={clinic} title={label("FACTURE", "فاتورة")} subtitle={label("Facture de soins dentaires", "فاتورة علاجات الأسنان")} number={invoice.number} date={formatDate(invoice.date, undefined, locale)} dateLabel={label("Date", "التاريخ")} />
      <section className="quote-print-patient invoice-print-patient">
        <p className="quote-print-section-title">{label("Facturé à", "فاتورة إلى")}</p>
        <p className="quote-print-patient-name">{invoice.patient}</p>
        <div className="invoice-print-patient-details">
          {invoice.patientNumber && <p>{label("N° patient", "رقم المريض")} : {invoice.patientNumber}</p>}
          {address && <p>{address}</p>}
          {invoice.patientPhone && <p>{label("Téléphone", "الهاتف")} : {invoice.patientPhone}</p>}
          {invoice.patientNationalId && <p>{label("Identifiant", "المعرّف")} : {invoice.patientNationalId}</p>}
        </div>
      </section>
      <table className="quote-print-table">
        <thead><tr>
          <th>{label("Désignation", "الوصف")}</th>
          <th>{label("Dent", "السن")}</th>
          <th>{label("Quantité", "الكمية")}</th>
          <th>{label("Prix unitaire", "سعر الوحدة")}</th>
          <th>{label("Remise", "الخصم")}</th>
          <th>{label("Total", "المجموع")}</th>
        </tr></thead>
        <tbody>{invoice.items.map((item, index) => (
          <tr key={`${item.description}-${index}`}>
            <td>{item.description}</td>
            <td>{item.tooth ?? "—"}</td>
            <td>{item.quantity}</td>
            <td>{formatMoney(item.unitPrice)}</td>
            <td>{formatMoney(item.discount)}</td>
            <td>{formatMoney(item.quantity * item.unitPrice - item.discount)}</td>
          </tr>
        ))}</tbody>
      </table>
      <section className="invoice-print-totals">
        <p><span>{label("Sous-total", "المجموع الفرعي")}</span><strong>{formatMoney(invoice.subtotal)}</strong></p>
        {invoice.discount > 0 && <p><span>{label("Remise", "الخصم")}</span><strong>- {formatMoney(invoice.discount)}</strong></p>}
        <p className="invoice-print-grand-total"><span>{label("Total de la facture", "إجمالي الفاتورة")}</span><strong>{formatMoney(invoice.total)}</strong></p>
        <p><span>{label("Montant payé", "المبلغ المدفوع")}</span><strong>{formatMoney(invoice.paid)}</strong></p>
        <p className="invoice-print-balance"><span>{label("Solde restant", "المبلغ المتبقي")}</span><strong>{formatMoney(invoice.total - invoice.paid)}</strong></p>
      </section>
      <p className="quote-print-note">{label("Statut :", "الحالة:")} {invoice.status}</p>
      <DocumentSignatureFields locale={locale} />
      <p className="quote-print-footer">{label("Document généré par DentaClinic à partir des données enregistrées.", "تم إنشاء هذه الوثيقة بواسطة DentaClinic اعتمادًا على البيانات المسجلة.")}</p>
    </article>
  );
});

function PaymentModal({ invoice, locale, onClose, onSave }: { invoice: Invoice; locale: "fr" | "ar"; onClose: () => void; onSave: (id: number, amount: string, method: string, paymentDate: string) => Promise<void> }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [amount, setAmount] = useState(String(invoice.total - invoice.paid));
  const now = new Date();
  const [paymentDate, setPaymentDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  const [method, setMethod] = useState("Espèces");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Number(amount) <= 0) return;
    setSaving(true);
    setError("");
    try {
      await onSave(invoice.id, amount, method, paymentDate);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Enregistrement du paiement impossible.", "تعذر تسجيل الدفعة."));
    } finally {
      setSaving(false);
    }
  }
  return <Modal title={label("Enregistrer un paiement", "تسجيل دفعة")} onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-600">{invoice.number} · {invoice.patient}<br />{label("Reste à payer", "المتبقي للدفع")}: <strong>{formatMoney(invoice.total - invoice.paid)}</strong></p><label className="block text-sm font-semibold text-slate-700">{label("Montant encaissé", "المبلغ المحصل")}<input required min="0.001" max={invoice.total - invoice.paid} step="0.001" type="number" className="input mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-700">{label("Date", "التاريخ")}<input required type="date" className="input mt-1" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><label className="block text-sm font-semibold text-slate-700">{label("Mode de paiement", "طريقة الدفع")}<select className="input mt-1" value={method} onChange={(event) => setMethod(event.target.value)}><option>Espèces</option><option>Carte bancaire</option><option>Virement</option><option>Chèque</option></select></label></div>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Enregistrer", "حفظ")}</Button></div></form></Modal>;
}

function NewInvoiceModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (invoice: { patientId: number; description: string; amount: string }) => Promise<void> }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [form, setForm] = useState({ description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) {
      setError(label("Sélectionnez un patient dans les résultats de recherche.", "يرجى اختيار مريض من نتائج البحث."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ patientId: patient.id, description: form.description, amount: form.amount });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Création de la facture impossible.", "تعذر إنشاء الفاتورة."));
    } finally {
      setSaving(false);
    }
  }
  return <Modal title={label("Nouvelle facture", "فاتورة جديدة")} onClose={onClose}><form onSubmit={submit} className="space-y-4" dir={locale === "ar" ? "rtl" : "ltr"}><PatientSearchField locale={locale} selectedPatient={patient} onSelect={setPatient} /><label className="block text-sm font-semibold text-slate-700">{label("Description", "الوصف")}<input required maxLength={180} className="input mt-1" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={label("Ex. : Détartrage", "مثال: إزالة الجير")} /></label><label className="block text-sm font-semibold text-slate-700">{label("Total TTC", "المجموع")}<input required min="0.001" step="0.001" type="number" className="input mt-1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Créer la facture", "إنشاء الفاتورة")}</Button></div></form></Modal>;
}
