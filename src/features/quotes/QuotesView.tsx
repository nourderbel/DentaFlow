"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SearchableInput } from "@/components/ui/SearchableInput";
import { FDI_TEETH } from "@/components/ui/ToothPicker";
import { PatientSearchField, type PatientOption } from "./PatientSearchField";
import { dentalActCatalog } from "./dentalActCatalog";
import { ClinicDocumentHeader } from "@/features/documents/ClinicDocumentHeader";
import { DocumentSignatureFields } from "@/features/documents/DocumentSignatureFields";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type QuoteStatus = "Brouillon" | "Envoyé" | "Accepté" | "Refusé";
type ClinicProfile = { name: string; address: string; city: string; governorate: string; phone: string; email: string };
type QuoteItem = { description: string; quantity: number; unitPrice: number; tooth: number | null };
type Quote = { id: number; number: string; date: string; patient: string; patientId: number; items: QuoteItem[]; act: string; acts: number; amount: number; notes: string; status: QuoteStatus; invoiceNumber: string | null };
type QuoteItemForm = { id: number; description: string; quantity: string; unitPrice: string; tooth: string };
type TreatmentOption = { treatment: string };

const statusStyles: Record<QuoteStatus, string> = {
  Brouillon: "bg-amber-50 text-amber-700",
  Envoyé: "bg-orange-50 text-orange-700",
  Accepté: "bg-emerald-50 text-emerald-700",
  Refusé: "bg-rose-50 text-rose-700",
};

export function QuotesView() {
  const { locale } = useI18n();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [printQuote, setPrintQuote] = useState<Quote | null>(null);
  const [clinic, setClinic] = useState<ClinicProfile>({ name: "DentaClinic", address: "", city: "", governorate: "", phone: "", email: "" });
  const [clinicLoaded, setClinicLoaded] = useState(false);
  const [processingQuoteId, setProcessingQuoteId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const printDocumentRef = useRef<HTMLElement>(null);
  const generatingPdf = useRef(false);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const pending = quotes.filter((quote) => quote.status === "Envoyé" || quote.status === "Brouillon").length;
  const accepted = quotes.filter((quote) => quote.status === "Accepté").length;
  const pendingAmount = quotes.filter((quote) => quote.status !== "Refusé").reduce((sum, quote) => sum + quote.amount, 0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/quotes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (locale === "ar" ? "تعذر تحميل عروض الأسعار." : "Chargement des devis impossible."));
        return body as { data: Quote[] };
      })
      .then(({ data }) => { if (!controller.signal.aborted) setQuotes(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : (locale === "ar" ? "تعذر تحميل عروض الأسعار." : "Chargement des devis impossible."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/clinic-profile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Chargement des informations du cabinet impossible.");
        return body as { data: ClinicProfile };
      })
      .then(({ data }) => { if (!controller.signal.aborted) setClinic(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Chargement des informations du cabinet impossible.");
      })
      .finally(() => { if (!controller.signal.aborted) setClinicLoaded(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!printQuote || !clinicLoaded || !printDocumentRef.current || generatingPdf.current) return;
    const quoteToPrint = printQuote;
    const timeout = window.setTimeout(() => {
      if (generatingPdf.current) return;
      generatingPdf.current = true;
      void generatePdf();
    }, 0);

    async function generatePdf() {
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);
        if (!printDocumentRef.current) return;

        const canvas = await html2canvas(printDocumentRef.current, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: printDocumentRef.current.scrollWidth,
          windowHeight: printDocumentRef.current.scrollHeight,
        });
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const margin = 12;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const contentWidth = pageWidth - margin * 2;
        const contentHeight = pageHeight - margin * 2;
        const sliceHeight = Math.floor(canvas.width * contentHeight / contentWidth);

        for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeight, page += 1) {
          const currentHeight = Math.min(sliceHeight, canvas.height - offset);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = currentHeight;
          const context = pageCanvas.getContext("2d");
          if (!context) throw new Error("Impossible de préparer la page PDF.");
          context.drawImage(canvas, 0, offset, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
          if (page > 0) pdf.addPage();
          pdf.addImage(
            pageCanvas.toDataURL("image/png"),
            "PNG",
            margin,
            margin,
            contentWidth,
            currentHeight * contentWidth / canvas.width,
          );
        }

        pdf.save(`devis-${quoteToPrint.number.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
        setError("");
        setMessage(locale === "ar" ? `تم تنزيل ملف PDF لعرض السعر ${quoteToPrint.number}.` : `Le PDF du devis ${quoteToPrint.number} a été téléchargé.`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : locale === "ar" ? "تعذر إنشاء ملف PDF." : "Génération du PDF impossible.");
      } finally {
        generatingPdf.current = false;
        setPrintQuote(null);
      }
    }

    return () => window.clearTimeout(timeout);
  }, [printQuote, clinicLoaded, locale]);

  function exportCsv() {
    const rows = [["Numéro", "Date", "Patient", "Actes", "Nombre", "Montant", "Statut", "Note"], ...quotes.map((quote) => [quote.number, quote.date, quote.patient, quote.items.map((item) => `${item.description}${item.tooth ? ` (dent ${item.tooth})` : ""} (x${item.quantity})`).join(" | "), String(quote.acts), String(quote.amount), quote.status, quote.notes])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "devis.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(label(`Le fichier « ${file.name} » a été importé.`, `تم استيراد الملف « ${file.name} ».`));
    event.target.value = "";
  }

  async function updateStatus(id: number, status: QuoteStatus) {
    setError("");
    setProcessingQuoteId(id);
    try {
      const response = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? label("Mise à jour du devis impossible.", "تعذر تحديث عرض السعر."));
      setQuotes((current) => current.map((quote) => quote.id === id ? { ...quote, status } : quote));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Mise à jour du devis impossible.", "تعذر تحديث عرض السعر."));
    } finally {
      setProcessingQuoteId(null);
    }
  }

  async function convertQuote(quote: Quote) {
    setError("");
    setProcessingQuoteId(quote.id);
    try {
      const response = await fetch(`/api/quotes/${quote.id}/convert`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? label("Conversion en facture impossible.", "تعذر تحويل العرض إلى فاتورة."));
      const data = body.data as { invoiceNumber: string; alreadyConverted: boolean };
      setQuotes((current) => current.map((item) => item.id === quote.id ? { ...item, status: "Accepté", invoiceNumber: data.invoiceNumber } : item));
      setMessage(data.alreadyConverted
        ? label(`Une facture existe déjà pour ${quote.number} : ${data.invoiceNumber}.`, `توجد فاتورة بالفعل للعرض ${quote.number}: ${data.invoiceNumber}.`)
        : label(`Le devis ${quote.number} a été converti en facture ${data.invoiceNumber}.`, `تم تحويل العرض ${quote.number} إلى الفاتورة ${data.invoiceNumber}.`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Conversion en facture impossible.", "تعذر تحويل العرض إلى فاتورة."));
    } finally {
      setProcessingQuoteId(null);
    }
  }

  async function createQuote(quote: { patientId: number; notes: string; items: Array<{ description: string; quantity: number; unitPrice: string; tooth: number | null }> }) {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quote),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Création du devis impossible.", "تعذر إنشاء عرض السعر."));
    const created = body.data as Quote;
    setQuotes((current) => [created, ...current]);
    setModalOpen(false);
    setMessage(label("Le devis a été enregistré.", "تم حفظ عرض السعر."));
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Devis", "عروض الأسعار")}</h1><p className="mt-1 text-sm text-slate-500">{label("Propositions de soins, tarifs configurables et conversion en facture.", "مقترحات العلاج والأسعار والتحويل إلى فاتورة.")}</p></div>
      <div className="flex gap-2">
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
        <Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button>
        <Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button>
        <Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={14} /> {label("Nouveau devis", "عرض سعر جديد")}</Button>
      </div>
    </header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-3">
      <Metric icon="file" label={label("Devis en attente", "عروض في الانتظار")} value={pending} detail={label("À présenter ou relancer", "للتقديم أو المتابعة")} tone="amber" />
      <Metric icon="checkCircle" label={label("Devis acceptés", "العروض المقبولة")} value={accepted} detail={label("Prêts à convertir", "جاهزة للتحويل")} tone="green" />
      <Metric icon="wallet" label={label("Montant en attente", "المبلغ المنتظر")} value={formatMoney(pendingAmount)} detail={label("Sans tarif imposé", "بدون تعريفة مفروضة")} tone="violet" />
    </div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Numéro", "Date", "Patient", "Acte / traitement", "Nombre", "Montant", "Statut", "Actions"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead>
          <tbody>{loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">{label("Chargement des devis…", "جارٍ تحميل عروض الأسعار…")}</td></tr> : quotes.map((quote) => <tr key={quote.id} className="border-t border-line transition hover:bg-slate-50/60">
            <td className="px-4 py-4 font-semibold text-accent">{quote.number}</td><td className="px-4 py-4 text-slate-500">{formatDate(quote.date, undefined, locale)}</td>
            <td className="px-4 py-4 font-semibold text-accent">{quote.patient}</td><td className="px-4 py-4 text-slate-600">{quote.items.length ? <ul className="space-y-1">{quote.items.map((item, index) => <li key={`${item.description}-${index}`}>{item.description}{item.tooth && <span className="ms-1 text-violet-600">· {label("dent", "سن")} {item.tooth}</span>} <span className="text-slate-400">× {item.quantity}</span></li>)}</ul> : <span className="text-slate-400">{label("Non précisé", "غير محدد")}</span>}</td><td className="px-4 py-4 text-slate-600">{quote.acts}</td>
            <td className="px-4 py-4 font-semibold text-ink">{formatMoney(quote.amount)}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[quote.status]}`}>● {quote.status}</span></td>
            <td className="px-4 py-4"><div className="flex flex-wrap items-center gap-2">
              <button type="button" title={label("Télécharger le devis en PDF", "تنزيل عرض السعر بصيغة PDF")} aria-label={label(`Télécharger le devis ${quote.number} en PDF`, `تنزيل عرض السعر ${quote.number} بصيغة PDF`)} onClick={() => setPrintQuote(quote)} className="px-1 text-slate-400 hover:text-accent"><Icon name="download" size={14} /></button>
              {quote.status === "Brouillon" && <>
                <button type="button" disabled={processingQuoteId === quote.id} onClick={() => updateStatus(quote.id, "Envoyé")} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700 disabled:opacity-50">{label("Envoyer", "إرسال")}</button>
                <button type="button" disabled={processingQuoteId === quote.id} onClick={() => updateStatus(quote.id, "Refusé")} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 disabled:opacity-50">{label("Refuser", "رفض")}</button>
              </>}
              {quote.status === "Envoyé" && <>
                <button type="button" disabled={processingQuoteId === quote.id} onClick={() => updateStatus(quote.id, "Accepté")} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-50">{label("Accepter", "قبول")}</button>
                <button type="button" disabled={processingQuoteId === quote.id} onClick={() => updateStatus(quote.id, "Refusé")} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 disabled:opacity-50">{label("Refuser", "رفض")}</button>
              </>}
              {quote.status === "Accepté" && (quote.invoiceNumber
                ? <span className="text-[10px] font-semibold text-emerald-700">{label("Facture", "فاتورة")} {quote.invoiceNumber}</span>
                : <button type="button" disabled={processingQuoteId === quote.id} onClick={() => convertQuote(quote)} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700 disabled:opacity-50">{processingQuoteId === quote.id ? label("Conversion…", "جارٍ التحويل…") : label("Convertir en facture", "تحويل إلى فاتورة")}</button>)}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{quotes.length} {label("devis", "عروض")}</span><span>{label("Les tarifs sont définis par le cabinet", "يحدد المكتب التعريفات")}</span></div>
    </section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Étapes des devis", "مراحل عروض الأسعار")}</h2><p className="mt-1 text-xs text-slate-400">{label("Un flux simple pour l'équipe", "مسار بسيط للفريق")}</p><div className="mt-5 grid gap-3 md:grid-cols-4">{[["1 · Préparer", "Brouillon", "Choisir les actes et dents concernées."], ["2 · Présenter", "Envoyé", "Imprimer ou transmettre au patient."], ["3 · Valider", "Accepté", "Le patient confirme la proposition."], ["4 · Facturer", "Facture", "Conversion sans ressaisie de montant."]].map(([step, title, text]) => <div key={title} className="rounded-xl border border-line p-4"><p className="text-[10px] text-slate-400">{step}</p><p className="mt-2 font-semibold text-ink">{title}</p><p className="mt-2 text-[10px] text-slate-400">{text}</p></div>)}</div></section>
    {printQuote && <QuotePrintDocument ref={printDocumentRef} quote={printQuote} clinic={clinic} locale={locale} />}
    {modalOpen && <NewQuoteModal locale={locale} onClose={() => setModalOpen(false)} onSave={createQuote} />}
  </div>;
}

const QuotePrintDocument = forwardRef<HTMLElement, { quote: Quote; clinic: ClinicProfile; locale: "fr" | "ar" }>(function QuotePrintDocument({ quote, clinic, locale }, ref) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  return (
    <article ref={ref} className="quote-print-root" dir={locale === "ar" ? "rtl" : "ltr"}>
      <ClinicDocumentHeader clinic={clinic} title={label("DEVIS", "عرض سعر")} subtitle={label("Proposition de soins", "مقترح العلاج")} number={quote.number} date={formatDate(quote.date, undefined, locale)} dateLabel={label("Date", "التاريخ")} />

      <section className="quote-print-patient">
        <p className="quote-print-section-title">{label("Patient", "المريض")}</p>
        <p className="quote-print-patient-name">{quote.patient}</p>
      </section>

      <table className="quote-print-table">
        <thead>
          <tr>
            <th>{label("Désignation des actes", "وصف العلاجات")}</th>
            <th>{label("Dent", "السن")}</th>
            <th>{label("Quantité", "الكمية")}</th>
            <th>{label("Prix unitaire", "سعر الوحدة")}</th>
            <th>{label("Total", "المجموع")}</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, index) => (
            <tr key={`${item.description}-${index}`}>
              <td>{item.description}</td>
              <td>{item.tooth ?? "—"}</td>
              <td>{item.quantity}</td>
              <td>{formatMoney(item.unitPrice)}</td>
              <td>{formatMoney(item.unitPrice * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="quote-print-total">
        <span>{label("Montant total du devis", "المبلغ الإجمالي للعرض")}</span>
        <strong>{formatMoney(quote.amount)}</strong>
      </section>

      {quote.notes && <section className="quote-print-patient"><p className="quote-print-section-title">{label("Note", "ملاحظة")}</p><p>{quote.notes}</p></section>}
      <p className="quote-print-note">{label("Statut :", "الحالة:")} {quote.status} · {label("Les soins seront réalisés après validation de cette proposition par le patient.", "يتم تنفيذ العلاجات بعد موافقة المريض على هذا المقترح.")}</p>

      <DocumentSignatureFields locale={locale} includePatientApproval />
      <p className="quote-print-footer">{label("Document de proposition de soins", "وثيقة مقترح العلاج")}</p>
    </article>
  );
});

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number | string; detail: string; tone: "amber" | "green" | "violet" }) {
  const colors = { amber: "bg-orange-50 text-orange-600", green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600" };
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
}

function NewQuoteModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (quote: { patientId: number; notes: string; items: Array<{ description: string; quantity: number; unitPrice: string; tooth: number | null }> }) => Promise<void> }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [items, setItems] = useState<QuoteItemForm[]>([{ id: 0, description: "", quantity: "1", unitPrice: "", tooth: "" }]);
  const [notes, setNotes] = useState("");
  const nextItemId = useRef(1);
  const [existingTreatmentOptions, setExistingTreatmentOptions] = useState<string[]>([]);
  const [treatmentsError, setTreatmentsError] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [patientSelectionError, setPatientSelectionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/treatments", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? (locale === "ar" ? "تعذر تحميل قائمة العلاجات." : "Chargement des actes impossible."));
        return body as { data: TreatmentOption[] };
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setExistingTreatmentOptions([...new Set(data.map((item) => item.treatment.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale)));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setTreatmentsError(error instanceof Error ? error.message : (locale === "ar" ? "تعذر تحميل قائمة العلاجات." : "Chargement des actes impossible."));
      });
    return () => controller.abort();
  }, [locale]);

  const catalogActs = new Set(dentalActCatalog.flatMap((group) => group.acts.map((act) => act.toLocaleLowerCase())));
  const additionalTreatmentOptions = existingTreatmentOptions.filter((act) => !catalogActs.has(act.toLocaleLowerCase()));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPatient) {
      setPatientSelectionError(label("Sélectionnez un patient dans les résultats de recherche.", "يرجى اختيار مريض من نتائج البحث."));
      return;
    }
    const validItems = items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice,
      tooth: item.tooth ? Number(item.tooth) : null,
    }));
    if (validItems.some((item) =>
      !item.description ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 ||
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(item.unitPrice) ||
      Number(item.unitPrice) <= 0
    )) {
      setError(label("Renseignez un acte, une quantité valide et un prix positif pour chaque ligne.", "يرجى إدخال علاج وكمية صحيحة وسعر موجب لكل سطر."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ patientId: selectedPatient.id, notes: notes.trim(), items: validItems });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Création du devis impossible.", "تعذر إنشاء عرض السعر."));
    } finally {
      setSaving(false);
    }
  }
  const fieldClass = "mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-ink shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-accent focus:ring-4 focus:ring-accent/10";
  const labelClass = "block text-sm font-semibold text-slate-700";
  return (
    <Modal title={label("Nouveau devis", "عرض سعر جديد")} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4" dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className="rounded-xl bg-violet-50/70 px-4 py-3">
          <p className="text-sm font-semibold text-violet-900">{label("Préparer une proposition de soins", "إعداد مقترح للعلاج")}</p>
          <p className="mt-1 text-xs leading-relaxed text-violet-700">{label("Choisissez parmi les actes dentaires prédéfinis ou saisissez un soin personnalisé. Le tarif reste à adapter au cabinet.", "اختر من قائمة العلاجات السنية المحددة مسبقاً أو أدخل علاجاً مخصصاً. يمكن تعديل السعر حسب العيادة.")}</p>
        </div>

        <PatientSearchField locale={locale} selectedPatient={selectedPatient} onSelect={(patient) => { setSelectedPatient(patient); setPatientSelectionError(""); }} />
        {patientSelectionError && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{patientSelectionError}</p>}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className={labelClass}>{label("Actes / traitements proposés", "العلاجات المقترحة")}</h3>
              {treatmentsError && <p role="alert" className="mt-1 text-xs font-normal text-rose-600">{treatmentsError}</p>}
            </div>
            <Button
              type="button"
              disabled={items.length >= 30}
              onClick={() => {
                setItems((current) => [...current, { id: nextItemId.current++, description: "", quantity: "1", unitPrice: "", tooth: "" }]);
              }}
            >
              <Icon name="plus" size={14} /> {label("Ajouter un acte", "إضافة علاج")}
            </Button>
          </div>
          {items.map((item, index) => (
            <div key={item.id} className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-line p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_96px_112px_156px_auto] xl:items-end">
              <label className={`${labelClass} min-w-0 md:col-span-2 xl:col-span-1`}>
                {label(`Acte / traitement ${index + 1}`, `العلاج ${index + 1}`)} <span className="text-rose-500" aria-hidden="true">*</span>
                <SearchableInput
                  required
                  value={item.description}
                  onChange={(description) => setItems((current) => current.map((line) => line.id === item.id ? { ...line, description } : line))}
                  options={additionalTreatmentOptions}
                  groups={dentalActCatalog.map((group) => ({ label: group.label, options: group.acts }))}
                  placeholder={label("Rechercher ou saisir un acte", "ابحث أو أدخل علاجاً")}
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                {label("Dent", "السن")}
                <select value={item.tooth} onChange={(event) => setItems((current) => current.map((line) => line.id === item.id ? { ...line, tooth: event.target.value } : line))} className={fieldClass}>
                  <option value="">{label("Aucune", "غير محدد")}</option>
                  {FDI_TEETH.map((tooth) => <option key={tooth} value={tooth}>{tooth}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                {label("Quantité", "الكمية")} <span className="text-rose-500" aria-hidden="true">*</span>
                <input required min="1" max="999" step="1" inputMode="numeric" type="number" className={fieldClass} value={item.quantity}
                  onChange={(event) => setItems((current) => current.map((line) => line.id === item.id ? { ...line, quantity: event.target.value } : line))} />
              </label>
              <label className={labelClass}>
                {label("Prix unitaire", "سعر الوحدة")} <span className="text-rose-500" aria-hidden="true">*</span>
                <span className="relative block">
                  <input required min="0" step="0.001" inputMode="decimal" type="number" className={`${fieldClass} pe-14`} value={item.unitPrice}
                    onChange={(event) => setItems((current) => current.map((line) => line.id === item.id ? { ...line, unitPrice: event.target.value } : line))} placeholder="0,000" />
                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">DT</span>
                </span>
              </label>
              <Button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((line) => line.id !== item.id))} aria-label={label(`Supprimer l’acte ${index + 1}`, `حذف العلاج ${index + 1}`)}>
                <Icon name="x" size={14} />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>
            {label("Note", "ملاحظة")}
            <textarea value={notes} maxLength={5000} rows={3} onChange={(event) => setNotes(event.target.value)} placeholder={label("Ajouter une précision ou une observation sur le devis…", "أضف توضيحاً أو ملاحظة حول عرض السعر…")} className={`${fieldClass} h-auto min-h-24 resize-y py-3`} />
          </label>
        </div>

        {Number.isFinite(total) && total >= 0 && (
          <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">{label("Total du devis", "إجمالي العرض")}</span>
            <span className="text-lg font-bold text-violet-700">{formatMoney(total)}</span>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button type="button" onClick={onClose} className="min-h-11 px-5">{label("Annuler", "إلغاء")}</Button>
          <Button type="submit" variant="primary" className="min-h-11 px-5" disabled={saving}><Icon name="plus" size={15} />{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Créer le devis", "إنشاء العرض")}</Button>
        </div>
      </form>
    </Modal>
  );
}
