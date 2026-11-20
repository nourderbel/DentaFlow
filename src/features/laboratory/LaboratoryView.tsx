"use client";

import { useEffect, useRef, useState } from "react";
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

export function LaboratoryView() {
  const { locale } = useI18n();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultDueAt, setDefaultDueAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [highlightedOrderId, setHighlightedOrderId] = useState<number | null>(null);
  const handledOrderLink = useRef(false);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/laboratory", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? label("Chargement des commandes impossible.", "تعذر تحميل الطلبات."));
        return body as { data: LabOrder[] };
      })
      .then(({ data }) => { if (!controller.signal.aborted) setOrders(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : label("Chargement des commandes impossible.", "تعذر تحميل الطلبات."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (loading || handledOrderLink.current) return;
    const orderId = Number(new URLSearchParams(window.location.search).get("orderId"));
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return;
    handledOrderLink.current = true;
    if (!orders.some((order) => order.id === orderId)) {
      window.setTimeout(() => setError(label("La commande demandée est introuvable ou n’est plus accessible.", "الطلب المطلوب غير موجود أو لم يعد متاحا.")), 0);
      return;
    }
    window.setTimeout(() => {
      setHighlightedOrderId(orderId);
      const url = new URL(window.location.href);
      url.searchParams.delete("orderId");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.requestAnimationFrame(() => document.getElementById(`laboratory-order-${orderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }, 0);
  }, [loading, orders]);

  const late = orders.filter((order) => order.status !== "Terminé" && order.dueAt < new Date().toISOString().slice(0, 10)).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const dueThisWeek = orders.filter((order) => {
    const dueAt = new Date(`${order.dueAt}T00:00:00`);
    return order.status !== "Terminé" && dueAt >= today && dueAt <= weekEnd;
  }).length;
  const laboratories = new Set(orders.map((order) => order.laboratory)).size;

  async function nextStep(order: LabOrder) {
    setError("");
    try {
      const response = await fetch(`/api/laboratory/${order.id}`, { method: "PATCH" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? label("Mise à jour impossible.", "تعذر التحديث."));
      const updated = body.data as Pick<LabOrder, "id" | "progress" | "status">;
      setOrders((current) => current.map((item) => item.id === updated.id ? { ...item, progress: updated.progress, status: updated.status } : item));
      setMessage(label("Étape du laboratoire mise à jour.", "تم تحديث مرحلة المختبر."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Mise à jour impossible.", "تعذر التحديث."));
    }
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Laboratoire", "المخبر")}</h1><p className="mt-1 text-sm text-slate-500">{label("Commandes prothétiques, échéances et suivi des travaux externes.", "طلبات التركيبات ومواعيد التسليم ومتابعة الأعمال الخارجية.")}</p></div><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => { const due = new Date(Date.now() + 7 * 86400000); setDefaultDueAt(due.toISOString().slice(0, 10)); setModalOpen(true); }}><Icon name="plus" size={14} /> {label("Nouvelle commande", "طلب جديد")}</Button></div></header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon="flask" label={label("Commandes actives", "الطلبات النشطة")} value={orders.filter((order) => order.status !== "Terminé").length} detail={label("Travaux en cours", "أعمال قيد التنفيذ")} tone="violet" /><Metric icon="alert" label={label("En retard", "متأخرة")} value={late} detail={label("À relancer aujourd'hui", "تحتاج إلى متابعة اليوم")} tone="rose" /><Metric icon="clock" label={label("À recevoir cette semaine", "المستلمة هذا الأسبوع")} value={dueThisWeek} detail={label("Selon les délais saisis", "حسب المواعيد المسجلة")} tone="amber" /><Metric icon="truck" label={label("Laboratoires partenaires", "المخابر الشريكة")} value={laboratories} detail={label("Contacts configurables", "جهات اتصال قابلة للضبط")} tone="green" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["N° commande", "Patient", "Travail / dent", "Laboratoire", "Envoi", "Prévu", "Progression", "Action"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{label("Chargement des commandes…", "جارٍ تحميل الطلبات…")}</td></tr> : orders.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{label("Aucune commande enregistrée.", "لا توجد طلبات مسجلة.")}</td></tr> : orders.map((order) => <tr id={`laboratory-order-${order.id}`} key={order.id} className={`border-t border-line transition hover:bg-slate-50/60 ${highlightedOrderId === order.id ? "bg-violet-100 ring-2 ring-inset ring-violet-400" : ""}`}><td className="px-4 py-4 font-semibold text-accent">{order.number}</td><td className="px-4 py-4 font-semibold text-accent">{order.patient}</td><td className="px-4 py-4"><p className="font-semibold text-ink">{order.work}</p><p className="mt-1 text-[10px] text-slate-400">{order.tooth}</p></td><td className="px-4 py-4 text-slate-600">{order.laboratory}</td><td className="px-4 py-4 text-slate-500">{formatDate(order.sentAt, undefined, locale)}</td><td className="px-4 py-4 text-slate-500">{formatDate(order.dueAt, undefined, locale)}</td><td className="px-4 py-4"><div className="flex items-center gap-1">{Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < order.progress ? "bg-emerald-500" : "bg-slate-200"}`} />)}{order.status === "Essaye" && <span className="ml-1 text-[10px] text-amber-600">{label("Essayage", "تجربة")}</span>}</div></td><td className="px-4 py-4">{order.status === "Terminé" ? <span className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] text-slate-500">{label("Terminé", "مكتمل")}</span> : <button type="button" onClick={() => nextStep(order)} className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-semibold text-accent hover:bg-violet-50">{label("Étape suivante", "المرحلة التالية")}</button>}</td></tr>)}</tbody></table></div><div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-500"><span>{label("Progression indicative basée sur les statuts de votre cabinet", "التقدم تقريبي حسب حالات العيادة")}</span><button type="button" onClick={() => setMessage(label("La gestion des documents sera disponible depuis chaque commande.", "ستتوفر إدارة الوثائق من كل طلب."))} className="font-semibold text-accent">{label("Documents & photos →", "الوثائق والصور ←")}</button></div></section>
    {modalOpen && <NewOrderModal locale={locale} initialDueAt={defaultDueAt} onClose={() => setModalOpen(false)} onSave={async (form) => { const response = await fetch("/api/laboratory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? label("Création de la commande impossible.", "تعذر إنشاء الطلب.")); setOrders((current) => [body.data as LabOrder, ...current]); setModalOpen(false); setError(""); setMessage(label("La commande laboratoire a été créée.", "تم إنشاء طلب المختبر.")); }} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number; detail: string; tone: "violet" | "rose" | "amber" | "green" }) { const colors = { violet: "bg-violet-50 text-violet-600", rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }

function NewOrderModal({ locale, initialDueAt, onClose, onSave }: { locale: "fr" | "ar"; initialDueAt: string; onClose: () => void; onSave: (order: { patient: string; work: string; tooth: string; laboratory: string; dueAt: string }) => Promise<void> }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [form, setForm] = useState({ patient: "", work: "", tooth: "", laboratory: "", dueAt: initialDueAt }); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ ...form, tooth: form.tooth || "—" }); } catch (reason) { setError(reason instanceof Error ? reason.message : label("Création de la commande impossible.", "تعذر إنشاء الطلب.")); } finally { setSaving(false); } } return <Modal title={label("Nouvelle commande laboratoire", "طلب مختبر جديد")} onClose={onClose}><form onSubmit={submit} className="space-y-4"><label className="block text-xs font-semibold text-slate-500">{label("Patient", "المريض")}<input required className="input mt-1" value={form.patient} onChange={(event) => setForm({ ...form, patient: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Travail demandé", "العمل المطلوب")}<input required className="input mt-1" value={form.work} onChange={(event) => setForm({ ...form, work: event.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-500">{label("Dent / teinte", "السن / اللون")}<input className="input mt-1" value={form.tooth} onChange={(event) => setForm({ ...form, tooth: event.target.value })} /></label><label className="block text-xs font-semibold text-slate-500">{label("Laboratoire", "المخبر")}<input required className="input mt-1" value={form.laboratory} onChange={(event) => setForm({ ...form, laboratory: event.target.value })} /></label></div><label className="block text-xs font-semibold text-slate-500">{label("Date prévue", "التاريخ المتوقع")}<input required type="date" className="input mt-1" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Créer la commande", "إنشاء الطلب")}</Button></div></form></Modal>; }
