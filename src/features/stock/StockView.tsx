"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  supplierId: number | null;
  supplier: string;
  quantity: number;
  minimum: number;
  price: number;
  lot: string;
  expiry: string | null;
};
type SupplierOption = { id: number; name: string };

function stateOf(product: Product): StockState {
  const today = new Date();
  const expiry = product.expiry ? new Date(`${product.expiry}T12:00:00`) : null;
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);
  if (expiry && expiry < today) return "Expiré";
  if (expiry && expiry <= soon) return "Expire bientôt";
  if (product.minimum > 0 && product.quantity <= product.minimum) return "Stock faible";
  return "Disponible";
}

export function StockView() {
  const { locale } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [restock, setRestock] = useState<Product | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);
  const handledProductLink = useRef(false);
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/stock", { cache: "no-store", signal: controller.signal }),
      fetch("/api/suppliers", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([stockResponse, suppliersResponse]) => {
        const [stockBody, suppliersBody] = await Promise.all([
          stockResponse.json().catch(() => ({})),
          suppliersResponse.json().catch(() => ({})),
        ]);
        if (!stockResponse.ok) throw new Error(stockBody.error ?? label("Chargement du stock impossible.", "تعذر تحميل المخزون."));
        if (!suppliersResponse.ok) throw new Error(suppliersBody.error ?? label("Chargement des fournisseurs impossible.", "تعذر تحميل الموردين."));
        return { products: stockBody.data as Product[], suppliers: suppliersBody.data as SupplierOption[] };
      })
      .then(({ products: loadedProducts, suppliers: loadedSuppliers }) => {
        if (!controller.signal.aborted) {
          setProducts(loadedProducts);
          setSuppliers(loadedSuppliers);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : label("Chargement du stock impossible.", "تعذر تحميل المخزون."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (loading || handledProductLink.current) return;
    const productId = Number(new URLSearchParams(window.location.search).get("productId"));
    if (!Number.isSafeInteger(productId) || productId <= 0) return;
    handledProductLink.current = true;
    if (!products.some((product) => product.id === productId)) {
      window.setTimeout(() => setError(label("Le produit demandé est introuvable ou n’est plus accessible.", "المنتج المطلوب غير موجود أو لم يعد متاحا.")), 0);
      return;
    }
    window.setTimeout(() => {
      setHighlightedProductId(productId);
      const url = new URL(window.location.href);
      url.searchParams.delete("productId");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.requestAnimationFrame(() => document.getElementById(`stock-product-${productId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }, 0);
  }, [loading, products]);

  async function createProduct(product: Omit<Product, "id" | "supplier">) {
    const response = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Ajout du produit impossible.", "تعذرت إضافة المنتج."));
    setProducts((current) => [body.data as Product, ...current]);
    setModalOpen(false);
    setError("");
    setMessage(label("L’article a été ajouté au stock.", "تمت إضافة المنتج إلى المخزون."));
  }

  async function restockProduct(product: Product, amount: number) {
    const response = await fetch(`/api/stock/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: amount }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? label("Réapprovisionnement impossible.", "تعذرت إعادة التزويد."));
    const result = body.data as { quantity: number };
    setProducts((current) => current.map((item) => item.id === product.id ? { ...item, quantity: result.quantity } : item));
    setRestock(null);
    setError("");
    setMessage(label("Le stock a été réapprovisionné.", "تمت إعادة تزويد المخزون."));
  }

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
  const supplierCount = new Set(products.map((product) => product.supplier)).size;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Stock", "المخزون")}</h1><p className="mt-1 text-sm text-slate-500">{label("Lots, seuils d’alerte, expiration et réapprovisionnement.", "الدفعات وحدود التنبيه وانتهاء الصلاحية وإعادة التزويد.")}</p></div>
      <div className="flex gap-2"><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={14} /> {label("Ajouter un article", "إضافة منتج")}</Button></div>
    </header>
    {(lowStock + expiring > 0) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><span><Icon name="alert" size={14} className="mr-2 inline" />{label(`${lowStock + expiring} alertes stock à traiter · ${lowStock} sous le seuil · ${expiring} proche(s) de la date limite.`, `${lowStock + expiring} تنبيهات للمخزون · ${lowStock} تحت الحد · ${expiring} قريبة من انتهاء الصلاحية.`)}</span><button type="button" onClick={() => setSearch("")} className="font-semibold text-accent">{label("Voir les alertes", "رؤية التنبيهات")}</button></div>}
    {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon="package" label={label("Références actives", "المنتجات النشطة")} value={products.length} detail={label("Produits et consommables", "المنتجات والمستهلكات")} tone="violet" /><Metric icon="alert" label={label("Stock faible", "مخزون منخفض")} value={lowStock} detail={label("Réapprovisionnement requis", "إعادة التزويد مطلوبة")} tone="amber" /><Metric icon="clock" label={label("Expiration proche", "انتهاء قريب")} value={expiring} detail={label("Dans les 30 prochains jours", "خلال الثلاثين يوما القادمة")} tone="rose" /><Metric icon="truck" label={label("Fournisseurs", "الموردون")} value={supplierCount} detail={label("Sources du cabinet", "مصادر العيادة")} tone="green" /></div>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-line p-4"><label className="relative block"><Icon name="search" size={15} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="search-with-icon w-64 rounded-xl border border-line py-2 ps-11 pe-3 text-xs outline-none transition focus:border-accent" placeholder={label("Rechercher une référence ou un produit", "البحث عن منتج أو مرجع")} /></label><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-line px-3 py-2 text-xs text-slate-600"><option value="">{label("Toutes catégories", "كل الفئات")}</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><Button className="ml-auto" onClick={() => window.print()}><Icon name="print" size={14} /> {label("Inventaire", "جرد")}</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Produit / référence", "Catégorie", "Fournisseur", "Quantité", "Prix achat", "Lot", "Expiration", "État", "Action"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">{label("Chargement du stock…", "جارٍ تحميل المخزون…")}</td></tr> : filtered.length === 0 ? <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">{label("Aucun produit enregistré.", "لا توجد منتجات مسجلة.")}</td></tr> : filtered.map((product) => { const state = stateOf(product); const ratio = Math.min(100, Math.round((product.quantity / Math.max(product.minimum, 1)) * 100)); return <tr id={`stock-product-${product.id}`} key={product.id} className={`border-t border-line transition hover:bg-slate-50/60 ${highlightedProductId === product.id ? "bg-amber-100 ring-2 ring-inset ring-amber-400" : ""}`}><td className="px-4 py-4"><p className="font-semibold text-ink">{product.name}</p><p className="mt-1 text-[10px] text-slate-400">{product.reference}</p></td><td className="px-4 py-4 text-accent">{product.category}</td><td className="px-4 py-4 text-slate-600">{product.supplier}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><strong>{product.quantity}</strong><span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full ${ratio < 100 ? "bg-rose-400" : "bg-emerald-500"}`} style={{ width: `${ratio}%` }} /></span><small className="text-[10px] text-slate-400">min. {product.minimum}</small></div></td><td className="px-4 py-4 text-slate-600">{formatMoney(product.price)}</td><td className="px-4 py-4 text-slate-500">{product.lot}</td><td className="px-4 py-4 text-slate-500">{product.expiry ? formatDate(product.expiry, undefined, locale) : "—"}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${state === "Disponible" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>● {label(state, state)}</span></td><td className="px-4 py-4"><button type="button" onClick={() => setRestock(product)} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700">{label("Réapprovisionner", "إعادة التزويد")}</button></td></tr>; })}</tbody></table></div>
      <div className="flex justify-between border-t border-line px-4 py-3 text-[10px] text-slate-500"><span>{filtered.length} {label("produits · Données synchronisées avec le cabinet", "منتجات · بيانات متزامنة مع العيادة")}</span><Link href="/suppliers" className="font-semibold text-accent">{label("Gérer les fournisseurs →", "إدارة الموردين ←")}</Link></div>
    </section>
    {modalOpen && <ProductModal locale={locale} suppliers={suppliers} onClose={() => setModalOpen(false)} onSave={createProduct} />}
    {restock && <RestockModal product={restock} locale={locale} onClose={() => setRestock(null)} onSave={(amount) => restockProduct(restock, amount)} />}
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: number; detail: string; tone: "violet" | "amber" | "rose" | "green" }) { const colors = { violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-600", green: "bg-emerald-50 text-emerald-600" }; return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="flex justify-between"><span className="text-xs text-slate-500">{label}</span><span className={`rounded-lg p-2 ${colors[tone]}`}><Icon name={icon} size={16} /></span></div><p className="mt-4 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>; }
const PREDEFINED_PRODUCTS = [
  { name: "Gants d'examen nitrile", category: "Protection" },
  { name: "Masques chirurgicaux", category: "Protection" },
  { name: "Blouses jetables", category: "Protection" },
  { name: "Charlotte jetable", category: "Protection" },
  { name: "Gobelets dentaires", category: "Consommables" },
  { name: "Bavoirs dentaires", category: "Consommables" },
  { name: "Canules d'aspiration", category: "Consommables" },
  { name: "Compresses stériles", category: "Consommables" },
  { name: "Anesthésique dentaire", category: "Anesthésie" },
  { name: "Aiguilles dentaires", category: "Anesthésie" },
  { name: "Composite dentaire", category: "Soins conservateurs" },
  { name: "Adhésif dentaire", category: "Soins conservateurs" },
  { name: "Ciment verre ionomère", category: "Soins conservateurs" },
  { name: "Fraises dentaires", category: "Instrumentation" },
  { name: "Limes endodontiques", category: "Endodontie" },
  { name: "Pointes de gutta-percha", category: "Endodontie" },
  { name: "Hypochlorite de sodium", category: "Endodontie" },
  { name: "Alginate dentaire", category: "Empreintes" },
  { name: "Silicone d'empreinte", category: "Empreintes" },
  { name: "Ciment de scellement", category: "Prothèse" },
  { name: "Résine provisoire", category: "Prothèse" },
  { name: "Sachets de stérilisation", category: "Stérilisation" },
  { name: "Désinfectant de surface", category: "Stérilisation" },
  { name: "Désinfectant instruments", category: "Stérilisation" },
  { name: "Papier d'articulation", category: "Consommables" },
  { name: "Micro-applicateurs", category: "Consommables" },
  { name: "Rouleaux salivaires", category: "Consommables" },
] as const;

function ProductModal({ locale, suppliers, onClose, onSave }: { locale: "fr" | "ar"; suppliers: SupplierOption[]; onClose: () => void; onSave: (product: Omit<Product, "id" | "supplier">) => Promise<void> }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [form, setForm] = useState({ name: "", reference: "", category: "", supplierId: "", quantity: "", minimum: "", price: "", lot: "", expiry: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const matchingProducts = PREDEFINED_PRODUCTS.filter((product) =>
    `${product.name} ${product.category}`.toLocaleLowerCase(locale)
      .includes(form.name.trim().toLocaleLowerCase(locale)),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: form.name,
        reference: form.reference,
        category: form.category || "Consommables",
        supplierId: form.supplierId ? Number(form.supplierId) : null,
        quantity: Number(form.quantity),
        minimum: Number(form.minimum),
        price: Number(form.price) || 0,
        lot: form.lot || "—",
        expiry: form.expiry || null,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Ajout du produit impossible.", "تعذرت إضافة المنتج."));
    } finally {
      setSaving(false);
    }
  }

  function updateName(name: string) {
    const preset = PREDEFINED_PRODUCTS.find((product) => product.name === name);
    setForm((current) => ({ ...current, name, ...(preset ? { category: preset.category } : {}) }));
    setActiveSuggestion(0);
  }

  function selectSuggestion(product: (typeof PREDEFINED_PRODUCTS)[number]) {
    setForm((current) => ({ ...current, name: product.name, category: product.category }));
    setSuggestionsOpen(false);
  }

  function handleProductKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
    } else if (event.key === "ArrowDown" && matchingProducts.length > 0) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestion((current) => (current + 1) % matchingProducts.length);
    } else if (event.key === "ArrowUp" && matchingProducts.length > 0) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestion((current) => (current - 1 + matchingProducts.length) % matchingProducts.length);
    } else if (event.key === "Enter" && suggestionsOpen && matchingProducts[activeSuggestion]) {
      event.preventDefault();
      selectSuggestion(matchingProducts[activeSuggestion]);
    }
  }

  return <Modal title={label("Ajouter un article", "إضافة منتج")} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-xs font-semibold text-slate-500">
        {label("Produit", "المنتج")}
        <span className="relative mt-1 block">
          <input
            required
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls="stock-predefined-products"
            aria-activedescendant={suggestionsOpen && matchingProducts[activeSuggestion] ? `stock-product-option-${activeSuggestion}` : undefined}
            className="input pr-10"
            placeholder={label("Choisir ou saisir un produit", "اختر منتجا أو أدخل اسمه")}
            value={form.name}
            onFocus={() => setSuggestionsOpen(true)}
            onChange={(event) => { updateName(event.target.value); setSuggestionsOpen(true); }}
            onKeyDown={handleProductKeyDown}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
          />
          <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          {suggestionsOpen && <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label("Produits prédéfinis", "منتجات محددة مسبقا")}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">{matchingProducts.length}</span>
            </div>
            <ul id="stock-predefined-products" role="listbox" className="max-h-56 overflow-y-auto p-1.5">
              {matchingProducts.length === 0
                ? <li className="px-3 py-4 text-center text-xs font-normal text-slate-500">{label("Aucune suggestion. Votre saisie sera conservée.", "لا توجد اقتراحات. سيتم الاحتفاظ بالنص الذي أدخلته.")}</li>
                : matchingProducts.map((product, index) => <li key={product.name} role="option" aria-selected={activeSuggestion === index}>
                  <button
                    id={`stock-product-option-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(product)}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition ${activeSuggestion === index ? "bg-violet-50 text-violet-900" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${activeSuggestion === index ? "bg-white text-violet-600" : "bg-slate-100 text-slate-500"}`}><Icon name="package" size={15} /></span>
                      <span className="truncate text-xs font-semibold">{product.name}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${activeSuggestion === index ? "bg-white text-violet-700" : "bg-slate-100 text-slate-500"}`}>{product.category}</span>
                  </button>
                </li>)}
            </ul>
            <div className="border-t border-slate-100 px-3 py-2 text-[10px] font-normal text-slate-400">{label("↑ ↓ pour naviguer · Entrée pour sélectionner · saisie libre autorisée", "↑ ↓ للتنقل · Enter للاختيار · يمكن إدخال منتج آخر")}</div>
          </div>}
        </span>
        <span className="mt-1 block font-normal text-slate-400">{label("Suggestions de produits dentaires prédéfinis, ou saisissez un autre produit.", "اقتراحات لمنتجات أسنان محددة مسبقا، أو أدخل منتجا آخر.")}</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["reference", "category", "quantity", "minimum", "price", "lot", "expiry"] as const).map((key) => (
          <label key={key} className="block text-xs font-semibold capitalize text-slate-500">
            {key}
            <input
              required={["reference", "quantity", "minimum"].includes(key)}
              type={["quantity", "minimum", "price"].includes(key) ? "number" : key === "expiry" ? "date" : "text"}
              min={["quantity", "minimum", "price"].includes(key) ? "0" : undefined}
              step={["quantity", "minimum"].includes(key) ? "1" : key === "price" ? "0.001" : undefined}
              className="input mt-1"
              value={form[key]}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <label className="block text-xs font-semibold text-slate-500">
          {label("Fournisseur", "المورد")}
          <select
            className="input mt-1"
            value={form.supplierId}
            onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}
          >
            <option value="">{label("Sans fournisseur", "بدون مورد")}</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
          {suppliers.length === 0 && <span className="mt-1 block font-normal text-slate-400">{label("Ajoutez d’abord un fournisseur dans la section Fournisseurs.", "أضف موردا أولا في قسم الموردين.")}</span>}
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Ajouter", "إضافة")}</Button>
      </div>
    </form>
  </Modal>;
}
function RestockModal({ product, locale, onClose, onSave }: { product: Product; locale: "fr" | "ar"; onClose: () => void; onSave: (amount: number) => Promise<void> }) { const label = (fr: string, ar: string) => locale === "ar" ? ar : fr; const [amount, setAmount] = useState("10"); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { await onSave(Number(amount)); } catch (reason) { setError(reason instanceof Error ? reason.message : label("Réapprovisionnement impossible.", "تعذرت إعادة التزويد.")); } finally { setSaving(false); } } return <Modal title={label("Réapprovisionner", "إعادة التزويد")} onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-500">{product.name}<br />{label("Quantité actuelle", "الكمية الحالية")}: <strong>{product.quantity}</strong></p><label className="block text-xs font-semibold text-slate-500">{label("Quantité à ajouter", "الكمية المضافة")}<input required min="1" step="1" type="number" className="input mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Mise à jour…", "جارٍ التحديث…") : label("Réapprovisionner", "إعادة التزويد")}</Button></div></form></Modal>; }
