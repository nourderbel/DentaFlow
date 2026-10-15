"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";

type LabStatus = "En cours" | "Terminé" | "Essaye";
type LabOrder = {
  id: number;
  number: string;
  patient: string;
  work: string;
  tooth: string;
  laboratory: string;
  sentAt: string;
  dueAt: string;
  progress: number;
  status: LabStatus;
};

const storageKey = "dentaflow-laboratory-orders";

export function LaboratoryView() {
  const { locale } = useI18n();
  const [orders, setOrders] = useState<LabOrder[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "null") ?? []; } catch { return []; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(orders)); }, [orders]);

  const late = orders.filter((order) => order.status !== "Terminé" && order.dueAt < new Date().toISOString().slice(0, 10)).length;
  const dueThisWeek = orders.filter((order) => order.status !== "Terminé").length;
  const laboratories = new Set(orders.map((order) => order.laboratory)).size;

  function exportCsv() {
    const rows = [["Commande", "Patient", "Travail", "Dent", "Laboratoire", "Envoi", "Prévu", "Progression", "Statut"], ...orders.map((order) => [order.number, order.patient, order.work, order.tooth, order.laboratory, order.sentAt, order.dueAt, String(order.progress), order.status])];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "laboratoire.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function nextStep(id: number) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, progress: Math.min(5, order.progress + 1), status: order.progress + 1 >= 5 ? "Terminé" : "Essaye" } : order));
    setMessage(label("Étape du laboratoire mise à jour.", "تم تحديث مرحلة المختبر."));
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Laboratoire", "المخبر")}</h1><p className="mt-1 text-sm text-slate-500">{label("Commandes prothétiques, échéances et suivi des travaux externes.", "طلبات التركيبات ومواعيد التسليم ومتابعة الأعمال الخارجية.")}</p></div><div className="flex flex-wrap gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Le fichier a été importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={14} /> {label("Nouvelle commande", "طلب جديد")}</Button></div></header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon="flask" label={label("Commandes actives", "الطلبات النشطة")} value={orders.filter((order) => order.status !== "Terminé").length} detail={label("Travaux en cours", "أعمال قيد التنفيذ")} tone="violet" /><Metric icon="alert" label={label("En retard", "متأخرة")} value={late} detail={label("À relancer aujourd'hui", "تحتاج إلى متابعة اليوم")} tone="rose" /><Metric icon="clock" label={label("À recevoir cette semaine", "المستلمة هذا الأسبوع")} value={dueThisWeek} detail={label("Selon les délais saisis", "حسب المواعيد المسجلة")} tone="amber" /><Metric icon="truck" label={label("Laboratoires partenaires", "المخابر الشريكة")} value={laboratories} detail={label("Contacts configurables", "جهات اتصال قابلة للضبط")} tone="green" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["N° commande", "Patient", "Travail / dent", "Laboratoire", "Envoi", "Prévu", "Progression", "Action"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4 font-semibold text-accent">{order.number}</td><td className="px-4 py-4 font-semibold text-accent">{order.patient}</td><td className="px-4 py-4"><p className="font-semibold text-ink">{order.work}</p><p className="mt-1 text-[10px] text-slate-400">{order.tooth}</p></td><td className="px-4 py-4 text-slate-600">{order.laboratory}</td><td className="px-4 py-4 text-slate-500">{formatDate(order.sentAt, undefined, locale)}</td><td className="px-4 py-4 text-slate-500">{formatDate(order.dueAt, undefined, locale)}</td><td className="px-4 py-4"><div className="flex items-center gap-1">{Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < order.progress ? "bg-emerald-500" : "bg-slate-200"}`} />)}{order.status === "Essaye" && <span className="ml-1 text-[10px] text-amber-600">{label("Essayage", "تجربة")}</span>}</div></td><td className="px-4 py-4">{order.status === "Terminé" ? <span className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] text-slate-500">{label("Terminé", "مكتمل")}</span> : <button type="button" onClick={() => nextStep(order.id)} className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-semibold text-accent hover:bg-violet-50">{label("Étape suivante", "المرحلة التالية")}</button>}</td></tr>)}</tbody></table></div><div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{label("Progression indicative basée sur les statuts de votre cabinet", "التقدم تقريبي حسب حالات العيادة")}</span><button type="button" onClick={() => setMessage(label("La gestion des documents sera disponible depuis chaque commande.", "ستتوفر إدارة الوثائق من كل طلب."))} className="font-semibold text-accent">{label("Documents & photos →", "الوثائق والصور ←")}</button></div></section>
    {modalOpen && <NewOrderModal locale={locale} onClose={() => setModalOpen(false)} onSave={(order) => { setOrders((current) => [{ ...order, id: Date.now() }, ...current]); setModalOpen(false); setMessage(label("La commande laboratoire a été créée.", "تم إنشاء طلب المختبر.")); }} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number; detail: string; tone: "violet" | "rose" | "amber" | "green" }) { const colors = { violet: "bg-violet-50 text-violet-600", rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }

function NewOrderModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (order: Omit<LabOrder, "id">) => void }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [form, setForm] = useState({ patient: "", work: "", tooth: "", laboratory: "", dueAt: "" }); return <Modal title={label("Nouvelle commande laboratoire", "طلب مختبر جديد")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.patient || !form.work || !form.laboratory) return; onSave({ number: `LAB-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`, patient: form.patient, work: form.work, tooth: form.tooth || "—", laboratory: form.laboratory, sentAt: new Date().toISOString().slice(0, 10), dueAt: form.dueAt || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), progress: 1, status: "En cours" }); }} className="space-y-4"><label className="block text-xs font-semibold text-slate-500">{label("Patient", "المريض")}<input required className="input mt-1" value={form.patient} onChange={(event) => setForm({ ...form, patient: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Travail demandé", "العمل المطلوب")}<input required className="input mt-1" value={form.work} onChange={(event) => setForm({ ...form, work: event.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-500">{label("Dent / teinte", "السن / اللون")}<input className="input mt-1" value={form.tooth} onChange={(event) => setForm({ ...form, tooth: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Laboratoire", "المخبر")}<input required className="input mt-1" value={form.laboratory} onChange={(event) => setForm({ ...form, laboratory: event.target.value })} /></label></div><label className="block text-xs font-semibold text-slate-500">{label("Date prévue", "التاريخ المتوقع")}<input type="date" className="input mt-1" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Créer la commande", "إنشاء الطلب")}</Button></div></form></Modal>; }
