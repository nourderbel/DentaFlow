"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";

type Tab = "cabinet" | "appearance" | "numbering" | "security" | "exports";
type Settings = {
  commercialName: string; country: string; address: string; phone: string; email: string;
  governorate: string; currency: string; dateFormat: string; phoneMask: string;
  cinLength: string; taxProfile: string; compactMode: boolean; notifications: boolean;
  accentColor: string; backgroundColor: string; surfaceColor: string; textColor: string;
  successColor: string; warningColor: string; errorColor: string; animations: boolean; autoSave: boolean;
  patientPrefix: string; quotePrefix: string; invoicePrefix: string; receiptPrefix: string; laboratoryPrefix: string;
  twoFactorAuth: boolean; inactivityLogout: boolean; activityLog: boolean; encryptedBackup: boolean;
};

type SettingsData = {
  user: { id: number; name: string; email: string; role: string } | null;
  team: Array<{ id: number; name: string; email: string; role: string; isActive: boolean; lastLoginAt: string | null }>;
  counts: Record<string, number>;
  records: Record<string, unknown[]>;
  database: { status: "connected" | "not-configured" | "unavailable" | "loading"; version?: string };
  error: string;
};

const initialSettings: Settings = {
  commercialName: "", country: "", address: "", phone: "",
  email: "", governorate: "", currency: "",
  dateFormat: "", phoneMask: "", cinLength: "",
  taxProfile: "", compactMode: false, notifications: true,
  accentColor: "#6c5ce7", backgroundColor: "#f5f7fb", surfaceColor: "#ffffff", textColor: "#172b4d",
  successColor: "#2fa77e", warningColor: "#e89a2d", errorColor: "#df6674", animations: true, autoSave: true,
  patientPrefix: "PAT", quotePrefix: "DEV", invoicePrefix: "FAC", receiptPrefix: "REC", laboratoryPrefix: "LAB",
  twoFactorAuth: true, inactivityLogout: true, activityLog: true, encryptedBackup: false,
};

const storageKey = "dentaflow-settings";

export function SettingsView() {
  const { locale, setLocale } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("cabinet");
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") return initialSettings;
    try { return { ...initialSettings, ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") }; } catch { return initialSettings; }
  });
  const [saved, setSaved] = useState(false);
  const [data, setData] = useState<SettingsData>({ user: null, team: [], counts: {}, records: {}, database: { status: "loading" }, error: "" });
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    document.documentElement.style.setProperty("--color-accent", settings.accentColor);
    document.documentElement.style.setProperty("--color-accent-soft", `${settings.accentColor}20`);
    document.documentElement.style.setProperty("--color-surface", settings.surfaceColor);
    document.documentElement.style.setProperty("--color-ink", settings.textColor);
    document.documentElement.style.setProperty("--color-success", settings.successColor);
    document.documentElement.style.setProperty("--color-warning", settings.warningColor);
    document.documentElement.style.setProperty("--color-error", settings.errorColor);
    document.documentElement.style.setProperty("--color-background", settings.backgroundColor);
    document.documentElement.classList.toggle("motion-reduce", !settings.animations);
    if (settings.autoSave) window.localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const responses = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/team"),
          fetch("/api/patients?q="),
          fetch("/api/appointments?from=2020-01-01&to=2100-12-31"),
          fetch("/api/consultations"),
          fetch("/api/treatments"),
          fetch("/api/health"),
        ]);
        const payloads = await Promise.all(responses.map(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error ?? `Erreur HTTP ${response.status}`);
          return payload;
        }));
        if (cancelled) return;
        const [me, team, patients, appointments, consultations, treatments, health] = payloads;
        const localCounts: Record<string, number> = {};
        for (const dataset of exportDatasets) {
          const stored = window.localStorage.getItem(dataset.storageKey);
          if (!stored) continue;
          try {
            const parsed = JSON.parse(stored);
            localCounts[dataset.id] = Array.isArray(parsed) ? parsed.length : 1;
          } catch {
            localCounts[dataset.id] = 1;
          }
        }
        setData({
          user: me.user,
          team: team.data ?? [],
          counts: {
            ...localCounts,
            patients: patients.data?.length ?? 0,
            appointments: appointments.data?.length ?? 0,
            consultations: consultations.data?.length ?? 0,
            treatments: treatments.data?.length ?? 0,
            users: team.data?.length ?? 0,
          },
          records: {
            patients: patients.data ?? [],
            appointments: appointments.data ?? [],
            consultations: consultations.data ?? [],
            treatments: treatments.data ?? [],
            users: team.data ?? [],
          },
          database: { status: health.database, version: health.version },
          error: "",
        });
        setSettings((current) => ({
          ...current,
          email: current.email || me.user?.email || "",
        }));
      } catch (error) {
        if (!cancelled) setData((current) => ({ ...current, database: { status: "unavailable" }, error: error instanceof Error ? error.message : "Impossible de charger les données." }));
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, []);

  function save() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  const tabs: { id: Tab; icon: string; fr: string; ar: string }[] = [
    { id: "cabinet", icon: "patients", fr: "Cabinet", ar: "العيادة" },
    { id: "appearance", icon: "sparkles", fr: "Apparence & langue", ar: "المظهر واللغة" },
    { id: "numbering", icon: "file", fr: "Numérotation", ar: "الترقيم" },
    { id: "security", icon: "shield", fr: "Sécurité & rôles", ar: "الأمان والأدوار" },
    { id: "exports", icon: "download", fr: "Données & exports", ar: "البيانات والتصدير" },
  ];

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Paramètres", "الإعدادات")}</h1><p className="mt-1 text-sm text-slate-500">{label("Personnalisez le fonctionnement, l’identité et les préférences du cabinet.", "خصص طريقة العمل وهوية وتفضيلات العيادة.")}</p>{data.user && <p className="mt-1 text-[10px] text-slate-400">{data.user.name} · {data.user.role}</p>}</div>
      <Button variant="primary" onClick={save}><Icon name="check" size={14} /> {label("Enregistrer les paramètres", "حفظ الإعدادات")}</Button>
    </header>
    {saved && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{label("Les paramètres ont été enregistrés.", "تم حفظ الإعدادات.")}</p>}
    {data.error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{label(`Impossible de charger les données existantes : ${data.error}`, `تعذر تحميل البيانات الموجودة: ${data.error}`)}</p>}
    <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
      <nav className="h-fit rounded-2xl border border-line bg-white p-2 shadow-sm">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${activeTab === tab.id ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-50"}`}><Icon name={tab.icon} size={14} />{label(tab.fr, tab.ar)}</button>)}</nav>
      <main className="space-y-4">
        {activeTab === "cabinet" && <CabinetSection settings={settings} update={update} label={label} user={data.user} />}
        {activeTab === "appearance" && <AppearanceSection settings={settings} update={update} locale={locale} setLocale={setLocale} label={label} />}
        {activeTab === "numbering" && <NumberingSection settings={settings} update={update} label={label} />}
        {activeTab === "security" && <SecuritySection settings={settings} update={update} label={label} team={data.team} />}
        {activeTab === "exports" && <ExportsSection label={label} counts={data.counts} records={data.records} database={data.database} />}
      </main>
    </div>
  </div>;
}

function CabinetSection({ settings, update, label, user }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; label: (fr: string, ar: string) => string; user: SettingsData["user"] }) {
  return <><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><SectionTitle title={label("Informations du cabinet", "معلومات العيادة")} subtitle={label("Ces coordonnées seront utilisées dans les impressions et les documents PDF.", "ستستخدم هذه البيانات في المطبوعات وملفات PDF.")} /><div className="grid gap-4 md:grid-cols-2"><Field label={label("Nom commercial", "الاسم التجاري")} value={settings.commercialName} onChange={(value) => update("commercialName", value)} /><Field label={label("Pays", "البلد")} value={settings.country} onChange={(value) => update("country", value)} /><Field className="md:col-span-2" label={label("Adresse", "العنوان")} value={settings.address} onChange={(value) => update("address", value)} /><Field label={label("Téléphone du cabinet", "هاتف العيادة")} value={settings.phone} onChange={(value) => update("phone", value)} /><Field label="E-mail" value={settings.email} onChange={(value) => update("email", value)} type="email" /><SelectField label={label("Gouvernorat", "الولاية")} value={settings.governorate} options={["Tunis", "Ariana", "Sousse", "Sfax", "Nabeul"]} onChange={(value) => update("governorate", value)} /><SelectField label={label("Devise", "العملة")} value={settings.currency} options={["TND — Dinar tunisien", "EUR — Euro", "USD — Dollar américain"]} onChange={(value) => update("currency", value)} /></div></section><section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><SectionTitle title={label("Configuration locale tunisienne", "الإعدادات المحلية التونسية")} subtitle={label("Les champs sont adaptés à l’usage en Tunisie. Les règles fiscales restent configurables.", "الحقول مهيأة للاستخدام في تونس. القواعد الجبائية قابلة للتخصيص.")} /><div className="grid gap-4 md:grid-cols-2"><SelectField label={label("Format de date", "تنسيق التاريخ")} value={settings.dateFormat} options={["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]} onChange={(value) => update("dateFormat", value)} /><Field label={label("Masque téléphone", "قناع الهاتف")} value={settings.phoneMask} onChange={(value) => update("phoneMask", value)} /><Field label={label("Longueur CIN tunisienne", "طول بطاقة التعريف")} value={settings.cinLength} onChange={(value) => update("cinLength", value)} type="number" /><SelectField label={label("Profil fiscal", "الملف الجبائي")} value={settings.taxProfile} options={["Non configuré — définir avec votre comptable", "Assujetti TVA", "Non assujetti TVA"]} onChange={(value) => update("taxProfile", value)} /></div><p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-xs text-blue-700"><Icon name="info" size={14} className="mr-2 inline" />{label("Aucun taux fiscal ni tarif de soin n’est codé en dur. Les champs restent paramétrables afin de suivre les évolutions locales.", "لا توجد نسب جبائية أو أسعار علاج ثابتة. الحقول قابلة للتخصيص لمتابعة التطورات المحلية.")}</p></section></>;
}

function AppearanceSection({ settings, update, locale, setLocale, label }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; locale: "fr" | "ar"; setLocale: (locale: "fr" | "ar") => void; label: (fr: string, ar: string) => string }) {
  const colors = [
    ["#3979e8", "Bleu"], ["#278b91", "Turquoise"], ["#6c5ce7", "Violet"],
    ["#d76577", "Rose"], ["#278365", "Vert"], ["#243b5b", "Nuit"], ["#d68b2d", "Orange"],
  ];
  return <div className="space-y-4">
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <SectionTitle title={label("Couleurs de l’interface", "ألوان الواجهة")} subtitle={label("Personnalisez les couleurs principales et les états visuels du cabinet.", "خصص الألوان الرئيسية وحالات الواجهة.")} />
      <div className="flex flex-wrap items-center gap-3">{colors.map(([color, name]) => <button key={color} type="button" title={name} onClick={() => update("accentColor", color)} className={`h-7 w-7 rounded-lg border-2 transition hover:scale-110 ${settings.accentColor === color ? "border-white ring-2 ring-accent" : "border-white shadow-sm"}`} style={{ backgroundColor: color }} />)}<ColorInput label={label("Accent", "اللون الرئيسي")} value={settings.accentColor} onChange={(value) => update("accentColor", value)} /><ColorInput label={label("Fond", "الخلفية")} value={settings.backgroundColor} onChange={(value) => update("backgroundColor", value)} /><ColorInput label={label("Surface", "السطح")} value={settings.surfaceColor} onChange={(value) => update("surfaceColor", value)} /><ColorInput label={label("Texte", "النص")} value={settings.textColor} onChange={(value) => update("textColor", value)} /><ColorInput label={label("Succès", "نجاح")} value={settings.successColor} onChange={(value) => update("successColor", value)} /><ColorInput label={label("Alerte", "تنبيه")} value={settings.warningColor} onChange={(value) => update("warningColor", value)} /><ColorInput label={label("Erreur", "خطأ")} value={settings.errorColor} onChange={(value) => update("errorColor", value)} /></div>
      <div className="mt-5 flex flex-wrap gap-2"><Button variant="primary"><Icon name="check" size={13} /> {label("Action principale", "الإجراء الرئيسي")}</Button><Button>{label("Action secondaire", "إجراء ثانوي")}</Button><span className="rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">● {label("Valide", "صالح")}</span><span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">● {label("À vérifier", "للتحقق")}</span><span className="rounded-full bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">● {label("Alerte", "تنبيه")}</span></div>
    </section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><SectionTitle title={label("Langue et affichage", "اللغة والعرض")} subtitle={label("Français par défaut · l’arabe adapte le sens de lecture en RTL.", "الفرنسية افتراضيا · العربية تغير اتجاه القراءة إلى RTL.")} /><div className="grid gap-4 md:grid-cols-2"><SelectField label={label("Langue de l’interface", "لغة الواجهة")} value={locale === "ar" ? "العربية" : "Français"} options={["Français", "العربية"]} onChange={(value) => setLocale(value === "العربية" ? "ar" : "fr")} /><SelectField label={label("Langue future", "اللغة المستقبلية")} value="English — préparé pour une prochaine version" options={["English — préparé pour une prochaine version"]} onChange={() => undefined} /></div><div className="mt-4 border-t border-line pt-4"><Toggle label={label("Animations fluides", "رسوم متحركة سلسة")} checked={settings.animations} onChange={(value) => update("animations", value)} /><p className="mt-1 text-[10px] text-slate-400">{label("Transitions discrètes, sans ralentir les actions", "انتقالات بسيطة دون إبطاء الإجراءات")}</p></div><div className="mt-4 flex items-center justify-between border-t border-line pt-4"><div><p className="text-xs font-semibold text-ink">{label("Enregistrer automatiquement", "الحفظ التلقائي")}</p><p className="mt-1 text-[10px] text-slate-400">{label("Les modifications sont gardées sur cet appareil", "يتم حفظ التعديلات على هذا الجهاز")}</p></div><div className="flex items-center gap-3"><Toggle label="" checked={settings.autoSave} onChange={(value) => update("autoSave", value)} /><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{settings.autoSave ? label("● Actif", "● نشط") : label("Inactif", "غير نشط")}</span></div></div></section>
  </div>;
}

function NumberingSection({ settings, update, label }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; label: (fr: string, ar: string) => string }) {
  const fields: { key: keyof Settings; label: string; arabic: string; example: string }[] = [
    { key: "patientPrefix", label: "Numéro patient", arabic: "رقم المريض", example: "PAT-2026-000125" },
    { key: "quotePrefix", label: "Devis", arabic: "عرض السعر", example: "DEV-2026-000045" },
    { key: "invoicePrefix", label: "Facture", arabic: "الفاتورة", example: "FAC-2026-000152" },
    { key: "receiptPrefix", label: "Reçu de paiement", arabic: "وصل الدفع", example: "REC-2026-000312" },
    { key: "laboratoryPrefix", label: "Commande laboratoire", arabic: "طلب المختبر", example: "LAB-2026-000089" },
  ];
  return <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
    <SectionTitle title={label("Numérotation des documents", "ترقيم المستندات")} subtitle={label("Les préfixes servent de modèles pour les nouveaux enregistrements créés dans le cabinet.", "تستخدم البادئات كنماذج للسجلات الجديدة في العيادة.")} />
    <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{fields.map((field) => <label key={field.key} className="block text-xs font-semibold text-slate-500">{label(field.label, field.arabic)}<div className="mt-1 flex items-center gap-3"><input value={String(settings[field.key])} onChange={(event) => update(field.key, event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} className="input max-w-[150px]" maxLength={12} /><span className="text-[10px] font-normal text-slate-400">{label(`Ex. ${field.example}`, `مثال: ${field.example}`)}</span></div></label>)}</div>
    <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500"><Icon name="info" size={14} className="mr-2 inline" />{label("Les séquences sont attribuées côté serveur dans une base connectée pour éviter les doublons multi-utilisateurs.", "يتم إنشاء التسلسلات على الخادم في قاعدة بيانات متصلة لتجنب التكرار بين المستخدمين.")}</p>
  </section>;
}
function SecuritySection({ settings, update, label, team }: { settings: Settings; update: <K extends keyof Settings>(key: K, value: Settings[K]) => void; label: (fr: string, ar: string) => string; team: SettingsData["team"] }) {
  const [rolesOpen, setRolesOpen] = useState(false);
  const controls: { key: "twoFactorAuth" | "inactivityLogout" | "activityLog" | "encryptedBackup"; title: string; arabic: string; description: string; descriptionArabic: string }[] = [
    { key: "twoFactorAuth", title: "Authentification à deux facteurs", arabic: "المصادقة الثنائية", description: "Recommandée pour les comptes dentiste et administrateur", descriptionArabic: "موصى بها لحسابات طبيب الأسنان والمدير" },
    { key: "inactivityLogout", title: "Déconnexion après inactivité", arabic: "تسجيل الخروج بعد عدم النشاط", description: "Fermer une session après 15 minutes sans activité", descriptionArabic: "إغلاق الجلسة بعد 15 دقيقة من عدم النشاط" },
    { key: "activityLog", title: "Journal d’activité", arabic: "سجل النشاط", description: "Conserver l’historique des modifications et accès", descriptionArabic: "الاحتفاظ بسجل التعديلات وعمليات الوصول" },
    { key: "encryptedBackup", title: "Sauvegarde chiffrée", arabic: "نسخة احتياطية مشفرة", description: "Rétention et fréquence définies par l’administrateur", descriptionArabic: "يحدد المدير مدة الاحتفاظ وتكرار النسخ" },
  ];
  const permissions = team.length > 0 ? Array.from(new Set(team.map((member) => member.role))) : [];
  return <div className="space-y-4">
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <SectionTitle title={label("Accès et confidentialité", "الوصول والخصوصية")} subtitle={label("Les réglages ci-dessous sont des paramètres de référence. L’application connectée doit appliquer les contrôles au niveau de l’API.", "الإعدادات التالية مرجعية، ويجب على التطبيق المتصل تطبيق ضوابط الحماية على مستوى API.")} />
      <div className="divide-y divide-line">{controls.map((control) => <div key={control.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-xs font-semibold text-ink">{label(control.title, control.arabic)}</p><p className="mt-1 text-[10px] text-slate-400">{label(control.description, control.descriptionArabic)}</p></div><button type="button" role="switch" aria-checked={settings[control.key]} aria-label={label(control.title, control.arabic)} onClick={() => update(control.key, !settings[control.key])} className={`relative h-5 w-9 shrink-0 rounded-full transition ${settings[control.key] ? "bg-accent" : "bg-slate-200"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${settings[control.key] ? "left-[18px]" : "left-0.5"}`} /></button></div>)}</div>
    </section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <SectionTitle title={label("Permissions cliniques", "الصلاحيات السريرية")} subtitle={label("Les données de santé doivent être visibles uniquement par les utilisateurs autorisés.", "يجب أن تكون البيانات الصحية مرئية للمستخدمين المصرح لهم فقط.")} />
      <div className="flex flex-wrap gap-2">{permissions.map((permission) => <span key={permission} className="rounded bg-slate-50 px-2 py-1 text-[9px] font-medium text-slate-500">{label(permission, permission)}</span>)}</div>
      <Button className="mt-4" onClick={() => setRolesOpen(true)}><Icon name="shield" size={14} /> {label("Gérer les rôles", "إدارة الأدوار")}</Button>
    </section>
    {rolesOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRolesOpen(false); }}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="roles-title"><div className="flex items-start justify-between gap-4"><div><h2 id="roles-title" className="font-bold text-ink">{label("Rôles et accès", "الأدوار والوصول")}</h2><p className="mt-1 text-xs text-slate-400">{label("Les utilisateurs et rôles du cabinet.", "مستخدمو وأدوار العيادة.")}</p></div><button type="button" aria-label={label("Fermer", "إغلاق")} onClick={() => setRolesOpen(false)} className="text-slate-400 hover:text-ink"><Icon name="x" size={16} /></button></div><div className="mt-4 space-y-2">{team.map((member) => <div key={member.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-3 text-sm"><div><span className="font-semibold text-ink">{member.name}</span><p className="text-[10px] text-slate-400">{member.email}</p></div><span className={`text-[10px] font-semibold ${member.isActive ? "text-emerald-600" : "text-slate-400"}`}>{member.role} · {member.isActive ? label("Actif", "نشط") : label("Inactif", "غير نشط")}</span></div>)}{team.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">{label("Aucun utilisateur retourné par l’API.", "لم تُرجع API أي مستخدم.")}</p>}</div><div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => setRolesOpen(false)}>{label("Fermer", "إغلاق")}</Button></div></div></div>}
  </div>;
}
type ExportDataset = { id: string; name: string; arabic: string; storageKey: string };

const exportDatasets: ExportDataset[] = [
  { id: "patients", name: "Patients", arabic: "المرضى", storageKey: "dentaflow-patients" },
  { id: "appointments", name: "Rendez-vous", arabic: "المواعيد", storageKey: "dentaflow-appointments" },
  { id: "consultations", name: "Consultations", arabic: "الاستشارات", storageKey: "dentaflow-consultations" },
  { id: "odontogram", name: "Odontogramme", arabic: "مخطط الأسنان", storageKey: "dentaflow-odontogram" },
  { id: "treatments", name: "Traitements", arabic: "العلاجات", storageKey: "dentaflow-treatments" },
  { id: "quotes", name: "Devis", arabic: "عروض الأسعار", storageKey: "dentaflow-quotes" },
  { id: "invoices", name: "Factures", arabic: "الفواتير", storageKey: "dentaflow-invoices" },
  { id: "treasury", name: "Paiements & trésorerie", arabic: "المدفوعات والخزينة", storageKey: "dentaflow-treasury-operations" },
  { id: "stock", name: "Stock", arabic: "المخزون", storageKey: "dentaflow-stock-products" },
  { id: "laboratory", name: "Laboratoire", arabic: "المختبر", storageKey: "dentaflow-laboratory-orders" },
  { id: "suppliers", name: "Fournisseurs", arabic: "الموردون", storageKey: "dentaflow-suppliers" },
  { id: "users", name: "Utilisateurs", arabic: "المستخدمون", storageKey: "dentaflow-users" },
];

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportsSection({ label, counts, records, database }: { label: (fr: string, ar: string) => string; counts: Record<string, number>; records: Record<string, unknown[]>; database: SettingsData["database"] }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedDataset, setSelectedDataset] = useState<ExportDataset | null>(null);
  const [message, setMessage] = useState("");
  const [datasetCounts, setDatasetCounts] = useState(counts);
  const [datasetRecords, setDatasetRecords] = useState(records);

  function exportCsv(dataset: ExportDataset) {
    const stored = window.localStorage.getItem(dataset.storageKey);
    let value: unknown = [];
    try { value = datasetRecords[dataset.id] ?? (stored ? JSON.parse(stored) : []); } catch { value = [{ value: stored ?? "" }]; }
    const rows = Array.isArray(value) ? value : [value];
    const columns = Array.from(new Set(rows.flatMap((row) => row && typeof row === "object" ? Object.keys(row) : ["value"])));
    const csv = [columns.join(";"), ...rows.map((row) => columns.map((column) => csvCell(row && typeof row === "object" ? (row as Record<string, unknown>)[column] : row)).join(";"))].join("\n");
    downloadFile(`${dataset.id}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
    setMessage(label(`${dataset.name} exporté avec succès.`, `تم تصدير ${dataset.arabic} بنجاح.`));
  }

  function importCsv(dataset: ExportDataset) {
    setSelectedDataset(dataset);
    fileInput.current?.click();
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedDataset) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").replace(/^\ufeff/, "").split(/\r?\n/).filter(Boolean);
      const headers = (lines.shift() ?? "").split(";").map((header) => header.replace(/^"|"$/g, "").replace(/""/g, '"'));
      const rows = lines.map((line) => {
        const values = line.split(";").map((value) => value.replace(/^"|"$/g, "").replace(/""/g, '"'));
        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      });
      window.localStorage.setItem(selectedDataset.storageKey, JSON.stringify(rows));
      setDatasetCounts((current) => ({ ...current, [selectedDataset.id]: rows.length }));
      setDatasetRecords((current) => ({ ...current, [selectedDataset.id]: rows }));
      setMessage(label(`${selectedDataset.name} importé avec succès.`, `تم استيراد ${selectedDataset.arabic} بنجاح.`));
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function downloadBackup() {
    const backup: Record<string, string> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) backup[key] = window.localStorage.getItem(key) ?? "";
    }
    downloadFile("dentaflow-backup.json", JSON.stringify({ exportedAt: new Date().toISOString(), data: backup }, null, 2), "application/json");
    setMessage(label("La sauvegarde JSON a été téléchargée.", "تم تنزيل النسخة الاحتياطية JSON."));
  }

  return <div className="space-y-4">
    <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <SectionTitle title={label("Importation et exportation", "الاستيراد والتصدير")} subtitle={label("Les fichiers CSV sont séparés par point-virgule et encodés en UTF-8 pour Excel.", "ملفات CSV مفصولة بفاصلة منقوطة ومشفرة بصيغة UTF-8 لبرنامج Excel.")} />
      <div className="grid gap-3 md:grid-cols-2">{exportDatasets.map((dataset) => <div key={dataset.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"><div><p className="text-xs font-semibold text-ink">{label(dataset.name, dataset.arabic)}</p><p className="mt-0.5 text-[10px] text-slate-400">{datasetCounts[dataset.id] ?? 0} {label("enregistrement(s) · CSV", "سجل · CSV")}</p></div><div className="flex items-center gap-4 text-slate-400"><button type="button" title={label("Importer", "استيراد")} aria-label={`${label("Importer", "استيراد")} ${dataset.name}`} onClick={() => importCsv(dataset)} className="transition hover:text-accent"><Icon name="download" size={15} /></button><button type="button" title={label("Exporter", "تصدير")} aria-label={`${label("Exporter", "تصدير")} ${dataset.name}`} onClick={() => exportCsv(dataset)} className="transition hover:text-accent"><Icon name="upload" size={15} /></button></div></div>)}</div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
    </section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <SectionTitle title={label("Mode de stockage", "وضع التخزين")} subtitle={label("La maquette fonctionne avec une sauvegarde locale sur cet appareil. Pour une utilisation en cabinet, configurez MariaDB et l’authentification serveur.", "يعمل النموذج مع حفظ محلي على هذا الجهاز. للاستخدام في العيادة، قم بإعداد MariaDB والمصادقة على الخادم.")} />
      <div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-400">{label("Interface API", "واجهة API")}</p><strong className="text-xs text-ink">/api/* · REST</strong></div><div className="rounded-lg bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-400">{label("Base de données", "قاعدة البيانات")}</p><strong className="text-xs text-ink">{database.status === "connected" ? `MariaDB · ${database.version ?? label("connectée", "متصلة")}` : label(database.status === "loading" ? "Vérification..." : database.status === "not-configured" ? "Non configurée" : "Indisponible", database.status === "loading" ? "جار التحقق..." : database.status === "not-configured" ? "غير مهيأة" : "غير متاحة")}</strong></div><div className="rounded-lg bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-400">{label("Stockage", "التخزين")}</p><strong className="text-xs text-ink">{label("Données locales détectées", "تم اكتشاف بيانات محلية")}</strong></div><div className="rounded-lg bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-400">{label("État de la sauvegarde", "حالة الحفظ")}</p><strong className="text-xs text-ink">{label(`${Object.values(datasetCounts).reduce((total, count) => total + count, 0)} enregistrements disponibles`, `${Object.values(datasetCounts).reduce((total, count) => total + count, 0)} سجل متاح`)}</strong></div></div>
      <Button className="mt-4" onClick={downloadBackup}><Icon name="download" size={14} /> {label("Télécharger une sauvegarde JSON", "تنزيل نسخة احتياطية JSON")}</Button>
    </section>
  </div>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="mb-5"><h2 className="font-bold text-ink">{title}</h2><p className="mt-1 text-xs text-slate-400">{subtitle}</p></div>; }
function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) { return <label className={`block text-xs font-semibold text-slate-500 ${className}`}>{label}<input type={type} className="input mt-1" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="block text-xs font-semibold text-slate-500">{label}<select className="input mt-1" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold text-slate-600"><span>{label}</span><button type="button" onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-accent" : "bg-slate-200"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} /></button></label>; }
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex items-center gap-1 text-[10px] text-slate-500">{label}<input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-7 cursor-pointer rounded border border-slate-300 bg-white p-0.5" /></label>; }
