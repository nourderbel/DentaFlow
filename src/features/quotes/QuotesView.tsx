"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type QuoteStatus = "Brouillon" | "Envoyé" | "Accepté" | "Refusé";
type Quote = { id: number; number: string; date: string; patient: string; acts: number; amount: number; status: QuoteStatus };

const statusStyles: Record<QuoteStatus, string> = {
  Brouillon: "bg-amber-50 text-amber-700",
  Envoyé: "bg-orange-50 text-orange-700",
  Accepté: "bg-emerald-50 text-emerald-700",
  Refusé: "bg-rose-50 text-rose-700",
};

const storageKey = "dentaflow-quotes";

export function QuotesView() {
  const { locale, t } = useI18n();
  const [quotes, setQuotes] = useState<Quote[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "null") ?? []; } catch { return []; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const pending = quotes.filter((quote) => quote.status === "Envoyé" || quote.status === "Brouillon").length;
  const accepted = quotes.filter((quote) => quote.status === "Accepté").length;
  const pendingAmount = quotes.filter((quote) => quote.status !== "Refusé").reduce((sum, quote) => sum + quote.amount, 0);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(quotes));
  }, [quotes]);

  function exportCsv() {
    const rows = [["Numéro", "Date", "Patient", "Actes", "Montant", "Statut"], ...quotes.map((quote) => [quote.number, quote.date, quote.patient, String(quote.acts), String(quote.amount), quote.status])];
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

  function updateStatus(id: number, status: QuoteStatus) {
    setQuotes((current) => current.map((quote) => quote.id === id ? { ...quote, status } : quote));
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
    <div className="grid gap-4 lg:grid-cols-3">
      <Metric icon="file" label={label("Devis en attente", "عروض في الانتظار")} value={pending} detail={label("À présenter ou relancer", "للتقديم أو المتابعة")} tone="amber" />
      <Metric icon="checkCircle" label={label("Devis acceptés", "العروض المقبولة")} value={accepted} detail={label("Prêts à convertir", "جاهزة للتحويل")} tone="green" />
      <Metric icon="wallet" label={label("Montant en attente", "المبلغ المنتظر")} value={formatMoney(pendingAmount)} detail={label("Sans tarif imposé", "بدون تعريفة مفروضة")} tone="violet" />
    </div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Numéro", "Date", "Patient", "Actes", "Montant", "Statut", "Actions"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead>
          <tbody>{quotes.map((quote) => <tr key={quote.id} className="border-t border-line transition hover:bg-slate-50/60">
            <td className="px-4 py-4 font-semibold text-accent">{quote.number}</td><td className="px-4 py-4 text-slate-500">{formatDate(quote.date, undefined, locale)}</td>
            <td className="px-4 py-4 font-semibold text-accent">{quote.patient}</td><td className="px-4 py-4 text-slate-600"><span>{quote.acts} {label("acte(s)", "علاج")}</span><small className="mt-1 block text-[10px] text-slate-400">{label("Actes du cabinet", "علاجات العيادة")}</small></td>
            <td className="px-4 py-4 font-semibold text-ink">{formatMoney(quote.amount)}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles[quote.status]}`}>● {quote.status}</span></td>
            <td className="px-4 py-4"><div className="flex items-center gap-3"><button type="button" title={label("Imprimer", "طباعة")} onClick={() => window.print()} className="text-slate-400 hover:text-accent"><Icon name="print" size={14} /></button>{quote.status === "Accepté" ? <button type="button" onClick={() => setMessage(label(`${quote.number} est prêt à être converti en facture.`, `${quote.number} جاهز للتحويل إلى فاتورة.`))} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700">{label("Convertir en facture", "تحويل إلى فاتورة")}</button> : quote.status === "Brouillon" && <button type="button" onClick={() => updateStatus(quote.id, "Envoyé")} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700">{label("Envoyer", "إرسال")}</button>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{quotes.length} {label("devis", "عروض")}</span><span>{label("Les tarifs sont définis par le cabinet", "يحدد المكتب التعريفات")}</span></div>
    </section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Étapes des devis", "مراحل عروض الأسعار")}</h2><p className="mt-1 text-xs text-slate-400">{label("Un flux simple pour l'équipe", "مسار بسيط للفريق")}</p><div className="mt-5 grid gap-3 md:grid-cols-4">{[["1 · Préparer", "Brouillon", "Choisir les actes et dents concernées."], ["2 · Présenter", "Envoyé", "Imprimer ou transmettre au patient."], ["3 · Valider", "Accepté", "Le patient confirme la proposition."], ["4 · Facturer", "Facture", "Conversion sans ressaisie de montant."]].map(([step, title, text]) => <div key={title} className="rounded-xl border border-line p-4"><p className="text-[10px] text-slate-400">{step}</p><p className="mt-2 font-semibold text-ink">{title}</p><p className="mt-2 text-[10px] text-slate-400">{text}</p></div>)}</div></section>
    {modalOpen && <NewQuoteModal locale={locale} onClose={() => setModalOpen(false)} onSave={(quote) => { setQuotes((current) => [{ ...quote, id: Date.now() }, ...current]); setModalOpen(false); setMessage(label("Le devis a été créé.", "تم إنشاء عرض السعر.")); }} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number | string; detail: string; tone: "amber" | "green" | "violet" }) {
  const colors = { amber: "bg-orange-50 text-orange-600", green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600" };
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
}

function NewQuoteModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (quote: Omit<Quote, "id">) => void }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [form, setForm] = useState({ patient: "", amount: "", acts: "1" });
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.patient || !form.amount) return;
    onSave({ number: `DEV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, date: new Date().toISOString().slice(0, 10), patient: form.patient, acts: Number(form.acts) || 1, amount: Number(form.amount), status: "Brouillon" });
  }
  return <Modal title={label("Nouveau devis", "عرض سعر جديد")} onClose={onClose}><form onSubmit={save} className="space-y-4"><label className="block text-xs font-semibold text-slate-500">{label("Patient", "المريض")}<input required className="input mt-1" value={form.patient} onChange={(event) => setForm({ ...form, patient: event.target.value })} placeholder={label("Nom du patient", "اسم المريض")} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-500">{label("Nombre d'actes", "عدد العلاجات")}<input required min="1" type="number" className="input mt-1" value={form.acts} onChange={(event) => setForm({ ...form, acts: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Montant", "المبلغ")}<input required min="0" step="0.001" type="number" className="input mt-1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></div><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Créer le devis", "إنشاء العرض")}</Button></div></form></Modal>;
}
