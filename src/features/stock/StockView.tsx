"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";

type StockState = "Disponible" | "Stock faible" | "Expire bientôt" | "Expiré";
type Product = {
  id: number;
  name: string;
  reference: string;
  category: string;
  supplier: string;
  quantity: number;
  minimum: number;
  price: number;
  lot: string;
  expiry: string;
};

const storageKey = "dentaflow-stock-products";

function stateOf(product: Product): StockState {
  const today = new Date();
  const expiry = new Date(`${product.expiry}T12:00:00`);
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);
  if (expiry < today) return "Expiré";
  if (expiry <= soon) return "Expire bientôt";
  if (product.quantity < product.minimum) return "Stock faible";
  return "Disponible";
}

export function StockView() {
  const { locale } = useI18n();
  const [products, setProducts] = useState<Product[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "null") ?? []; } catch { return []; }
  });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [restock, setRestock] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(products)); }, [products]);

  const categories = [...new Set(products.map((product) => product.category))];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) =>
      (!category || product.category === category) &&
      (!needle || [product.name, product.reference, product.supplier, product.lot].some((value) => value.toLowerCase().includes(needle))),
    );
  }, [category, products, search]);
  const lowStock = products.filter((product) => stateOf(product) === "Stock faible").length;
  const expiring = products.filter((product) => stateOf(product) === "Expire bientôt").length;
  const suppliers = new Set(products.map((product) => product.supplier)).size;

  function exportCsv() {
    const rows = [["Produit", "Référence", "Catégorie", "Fournisseur", "Quantité", "Minimum", "Prix", "Lot", "Expiration"], ...products.map((p) => [p.name, p.reference, p.category, p.supplier, String(p.quantity), String(p.minimum), String(p.price), p.lot, p.expiry])];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "stock.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Stock", "المخزون")}</h1><p className="mt-1 text-sm text-slate-500">{label("Lots, seuils d’alerte, expiration et réapprovisionnement.", "الدفعات وحدود التنبيه وانتهاء الصلاحية وإعادة التزويد.")}</p></div>
      <div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { if (event.target.files?.[0]) setMessage(label("Le fichier a été importé.", "تم استيراد الملف.")); event.target.value = ""; }} /><Button onClick={() => fileInput.current?.click()}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={14} /> {label("Ajouter un article", "إضافة منتج")}</Button></div>
    </header>
    {(lowStock + expiring > 0) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><span><Icon name="alert" size={14} className="mr-2 inline" />{label(`${lowStock + expiring} alertes stock à traiter · ${lowStock} sous le seuil · ${expiring} proche(s) de la date limite.`, `${lowStock + expiring} تنبيهات للمخزون · ${lowStock} تحت الحد · ${expiring} قريبة من انتهاء الصلاحية.`)}</span><button type="button" onClick={() => setSearch("")} className="font-semibold text-accent">{label("Voir les alertes", "رؤية التنبيهات")}</button></div>}
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon="package" label={label("Références actives", "المنتجات النشطة")} value={products.length} detail={label("Produits et consommables", "المنتجات والمستهلكات")} tone="violet" /><Metric icon="alert" label={label("Stock faible", "مخزون منخفض")} value={lowStock} detail={label("Réapprovisionnement requis", "إعادة التزويد مطلوبة")} tone="amber" /><Metric icon="clock" label={label("Expiration proche", "انتهاء قريب")} value={expiring} detail={label("Dans les 30 prochains jours", "خلال الثلاثين يوما القادمة")} tone="rose" /><Metric icon="truck" label={label("Fournisseurs", "الموردون")} value={suppliers} detail={label("Sources du cabinet", "مصادر العيادة")} tone="green" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-line p-4"><label className="relative"><Icon name="search" size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-64 rounded-lg border border-line py-2 pl-8 pr-3 text-xs outline-none focus:border-accent" placeholder={label("Rechercher une référence ou un produit", "البحث عن منتج أو مرجع")} /></label><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-line px-3 py-2 text-xs text-slate-600"><option value="">{label("Toutes catégories", "كل الفئات")}</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><Button className="ml-auto" onClick={() => window.print()}><Icon name="print" size={14} /> {label("Inventaire", "جرد")}</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Produit / référence", "Catégorie", "Fournisseur", "Quantité", "Prix achat", "Lot", "Expiration", "État", "Action"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{filtered.map((product) => { const state = stateOf(product); const ratio = Math.min(100, Math.round((product.quantity / Math.max(product.minimum, 1)) * 100)); return <tr key={product.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4"><p className="font-semibold text-ink">{product.name}</p><p className="mt-1 text-[10px] text-slate-400">{product.reference}</p></td><td className="px-4 py-4 text-accent">{product.category}</td><td className="px-4 py-4 text-slate-600">{product.supplier}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><strong>{product.quantity}</strong><span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full ${ratio < 100 ? "bg-rose-400" : "bg-emerald-500"}`} style={{ width: `${ratio}%` }} /></span><small className="text-[10px] text-slate-400">min. {product.minimum}</small></div></td><td className="px-4 py-4 text-slate-600">{formatMoney(product.price)}</td><td className="px-4 py-4 text-slate-500">{product.lot}</td><td className="px-4 py-4 text-slate-500">{formatDate(product.expiry, undefined, locale)}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${state === "Disponible" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>● {label(state, state)}</span></td><td className="px-4 py-4"><button type="button" onClick={() => setRestock(product)} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700">{label("Réapprovisionner", "إعادة التزويد")}</button></td></tr>; })}</tbody></table></div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-400"><span>{filtered.length} {label("produits · Mise à jour locale automatique", "منتجات · تحديث محلي تلقائي")}</span><button type="button" onClick={() => setMessage(label("La gestion des fournisseurs sera disponible dans cette section.", "ستتوفر إدارة الموردين في هذا القسم."))} className="font-semibold text-accent">{label("Gérer les fournisseurs →", "إدارة الموردين ←")}</button></div>
    </section>
    {modalOpen && <ProductModal locale={locale} onClose={() => setModalOpen(false)} onSave={(product) => { setProducts((current) => [{ ...product, id: Date.now() }, ...current]); setModalOpen(false); setMessage(label("L’article a été ajouté au stock.", "تمت إضافة المنتج إلى المخزون.")); }} />}
    {restock && <RestockModal product={restock} locale={locale} onClose={() => setRestock(null)} onSave={(amount) => { setProducts((current) => current.map((item) => item.id === restock.id ? { ...item, quantity: item.quantity + amount } : item)); setRestock(null); setMessage(label("Le stock a été réapprovisionné.", "تمت إعادة تزويد المخزون.")); }} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number; detail: string; tone: "violet" | "amber" | "rose" | "green" }) { const colors = { violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-600", green: "bg-emerald-50 text-emerald-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }
function ProductModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (product: Omit<Product, "id">) => void }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [form, setForm] = useState({ name: "", reference: "", category: "", supplier: "", quantity: "", minimum: "", price: "", lot: "", expiry: "" }); return <Modal title={label("Ajouter un article", "إضافة منتج")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.name || !form.reference || !form.quantity || !form.minimum) return; onSave({ name: form.name, reference: form.reference, category: form.category || "Consommables", supplier: form.supplier || "À définir", quantity: Number(form.quantity), minimum: Number(form.minimum), price: Number(form.price) || 0, lot: form.lot || "—", expiry: form.expiry || "2099-12-31" }); }} className="space-y-4"><label className="block text-xs font-semibold text-slate-500">{label("Produit", "المنتج")}<input required className="input mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2">{(["reference", "category", "supplier", "quantity", "minimum", "price", "lot", "expiry"] as const).map((key) => <label key={key} className="block text-xs font-semibold capitalize text-slate-500">{key}<input required={["reference", "quantity", "minimum"].includes(key)} type={["quantity", "minimum", "price"].includes(key) ? "number" : key === "expiry" ? "date" : "text"} className="input mt-1" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}</div><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Ajouter", "إضافة")}</Button></div></form></Modal>; }
function RestockModal({ product, locale, onClose, onSave }: { product: Product; locale: "fr" | "ar"; onClose: () => void; onSave: (amount: number) => void }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [amount, setAmount] = useState("10"); return <Modal title={label("Réapprovisionner", "إعادة التزويد")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (Number(amount) > 0) onSave(Number(amount)); }} className="space-y-4"><p className="text-sm text-slate-500">{product.name}<br />{label("Quantité actuelle", "الكمية الحالية")}: <strong>{product.quantity}</strong></p><label className="block text-xs font-semibold text-slate-500">{label("Quantité à ajouter", "الكمية المضافة")}<input required min="1" type="number" className="input mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Réapprovisionner", "إعادة التزويد")}</Button></div></form></Modal>; }
