"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

type Supplier = { id: number; code: string; name: string; contact: string; phone: string; email: string; specialty: string; address: string };
const storageKey = "dentaflow-suppliers";

export function SuppliersView() {
  const { locale } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "null") ?? []; } catch { return []; }
  });
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(suppliers)); }, [suppliers]);
  const filtered = useMemo(() => suppliers.filter((supplier) => [supplier.name, supplier.contact, supplier.specialty, supplier.address].some((value) => value.toLowerCase().includes(search.toLowerCase()))), [search, suppliers]);

  function exportCsv() {
    const rows = [["Fournisseur", "Code", "Contact", "Téléphone", "E-mail", "Spécialité", "Adresse"], ...suppliers.map((s) => [s.name, s.code, s.contact, s.phone, s.email, s.specialty, s.address])];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "fournisseurs.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Fournisseurs", "الموردون")}</h1><p className="mt-1 text-sm text-slate-500">{label("Contacts, familles de produits et historique des achats du cabinet.", "جهات الاتصال وفئات المنتجات وتاريخ مشتريات العيادة.")}</p></div><div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Le fichier a été importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={14} /> {label("Ajouter un fournisseur", "إضافة مورد")}</Button></div></header>
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    <div className="grid gap-4 lg:grid-cols-3"><Metric icon="truck" label={label("Fournisseurs actifs", "الموردون النشطون")} value={suppliers.length} detail={label("Carnet du cabinet", "دليل العيادة")} tone="green" /><Metric icon="wallet" label={label("Dépenses ce mois", "مصاريف هذا الشهر")} value={formatMoney(0)} detail={label("Transactions enregistrées", "المعاملات المسجلة")} tone="orange" /><Metric icon="flask" label={label("Commandes laboratoire", "طلبات المختبر")} value={0} detail={label("Réseau de partenaires", "شبكة الشركاء")} tone="violet" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="border-b border-line p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-sm rounded-lg border border-line px-3 py-2 text-xs outline-none focus:border-accent" placeholder={label("Rechercher un fournisseur…", "البحث عن مورد…")} /></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Fournisseur", "Contact", "Téléphone", "E-mail", "Spécialité", "Adresse", "Actions"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{filtered.map((supplier) => <tr key={supplier.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4"><p className="font-semibold text-accent">{supplier.name}</p><p className="mt-1 text-[10px] text-slate-400">{supplier.code}</p></td><td className="px-4 py-4 text-slate-600">{supplier.contact}</td><td className="px-4 py-4 text-slate-600">{supplier.phone}</td><td className="px-4 py-4 text-slate-600">{supplier.email}</td><td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">● {supplier.specialty}</span></td><td className="px-4 py-4 text-slate-600">{supplier.address}</td><td className="px-4 py-4"><div className="flex gap-3"><a href={`tel:${supplier.phone.replaceAll(" ", "")}`} title={label("Appeler", "اتصال")} className="text-slate-400 hover:text-accent"><Icon name="phone" size={14} /></a><a href={`mailto:${supplier.email}`} title={label("Envoyer un e-mail", "إرسال بريد")} className="text-slate-400 hover:text-accent"><Icon name="mail" size={14} /></a></div></td></tr>)}</tbody></table></div></section>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Achats récents", "المشتريات الأخيرة")}</h2><p className="mt-1 text-xs text-slate-400">{label("Opérations fournisseurs saisies en trésorerie", "عمليات الموردين المسجلة في الخزينة")}</p><p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">{label("Aucun achat enregistré.", "لا توجد مشتريات مسجلة.")}</p></section><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Commandes ouvertes", "الطلبات المفتوحة")}</h2><p className="mt-1 text-xs text-slate-400">{label("Suivi des travaux de laboratoire", "متابعة أعمال المختبر")}</p><p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">{label("Aucune commande enregistrée.", "لا توجد طلبات مسجلة.")}</p></section></div>
    {modalOpen && <SupplierModal locale={locale} onClose={() => setModalOpen(false)} onSave={(supplier) => { setSuppliers((current) => [{ ...supplier, id: Date.now(), code: `FOU-${String(current.length + 1).padStart(3, "0")}` }, ...current]); setModalOpen(false); setMessage(label("Le fournisseur a été ajouté.", "تمت إضافة المورد.")); }} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number | string; detail: string; tone: "green" | "orange" | "violet" }) { const colors = { green: "bg-emerald-50 text-emerald-600", orange: "bg-orange-50 text-orange-600", violet: "bg-violet-50 text-violet-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }
function SupplierModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (supplier: Omit<Supplier, "id" | "code">) => void }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [form, setForm] = useState({ name: "", contact: "", phone: "", email: "", specialty: "", address: "" }); return <Modal title={label("Ajouter un fournisseur", "إضافة مورد")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.name || !form.phone || !form.email) return; onSave(form); }} className="space-y-4">{(["name", "contact", "phone", "email", "specialty", "address"] as const).map((key) => <label key={key} className="block text-xs font-semibold capitalize text-slate-500">{key}<input required={["name", "phone", "email"].includes(key)} className="input mt-1" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Ajouter", "إضافة")}</Button></div></form></Modal>; }
