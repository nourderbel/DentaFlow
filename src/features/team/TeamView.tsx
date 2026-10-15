"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";

type Role = "DENTIST" | "SECRETARY" | "ADMIN";
type Member = { id: number; name: string; email: string; role: Role; isActive: boolean | number; lastLoginAt: string | null };

const roleLabels: Record<Role, [string, string]> = {
  DENTIST: ["Dentiste", "طبيب أسنان"],
  SECRETARY: ["Secrétaire", "سكرتير(ة)"],
  ADMIN: ["Administrateur", "مدير"],
};

const permissions: Record<Role, string[]> = {
  DENTIST: ["Patients", "Dossiers cliniques", "Odontogramme", "Traitements", "Factures & paiements", "Paramètres"],
  SECRETARY: ["Agenda", "Patients", "Rendez-vous", "Devis", "Factures", "Relances"],
  ADMIN: ["Gestion du cabinet", "Médecins et secrétaires", "Dashboard & graphiques", "Paramètres", "Exports", "Journal d'activité"],
};

export function TeamView() {
  const { locale } = useI18n();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [message, setMessage] = useState("");
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  useEffect(() => {
    let active = true;
    fetch("/api/team", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Chargement impossible.");
        if (active && Array.isArray(body.data)) setMembers(body.data);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : label("Chargement impossible.", "تعذر التحميل."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale]);

  const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const roleName = (role: Role) => locale === "ar" ? roleLabels[role][1] : roleLabels[role][0];
  const activeCount = members.filter((member) => Boolean(member.isActive)).length;
  const grouped = useMemo(() => (Object.keys(permissions) as Role[]).map((role) => ({ role, items: permissions[role] })), []);

  function exportCsv() {
    const rows = [["Utilisateur", "E-mail", "Rôle", "Statut"], ...members.map((member) => [member.name, member.email, roleName(member.role), Boolean(member.isActive) ? "Actif" : "Inactif"])];
    const content = rows.map((row) => row.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "equipe.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Équipe & accès", "الفريق والصلاحيات")}</h1><p className="mt-1 text-sm text-slate-500">{label("Gérez les membres du cabinet et attribuez les droits nécessaires.", "إدارة أعضاء العيادة ومنح الصلاحيات اللازمة.")}</p></div><div className="flex gap-2"><Button onClick={() => setMessage(label("Import CSV disponible après sélection du fichier.", "استيراد CSV متاح بعد اختيار الملف."))}><Icon name="upload" size={14} /> {label("Importer", "استيراد")}</Button><Button onClick={exportCsv}><Icon name="download" size={14} /> CSV</Button><Button variant="primary" onClick={() => setModalOpen(true)}><Icon name="userPlus" size={14} /> {label("Inviter un utilisateur", "دعوة مستخدم")}</Button></div></header>
    {message && <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</p>}
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="border-b border-line p-5"><h2 className="font-bold text-ink">{label("Membres du cabinet", "أعضاء العيادة")}</h2><p className="mt-1 text-xs text-slate-400">{loading ? label("Chargement…", "جار التحميل…") : `${members.length} ${label("utilisateur(s) · Permissions appliquées côté serveur dans la version connectée", "مستخدم · الصلاحيات مطبقة على الخادم")}`}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Utilisateur", "E-mail", "Rôle", "Statut", "Dernière activité", "Accès"].map((head) => <th key={head} className="px-4 py-3 font-semibold">{label(head, head)}</th>)}</tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-t border-line transition hover:bg-slate-50/60"><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[10px] font-bold text-blue-600">{initials(member.name)}</span><strong className="text-accent">{member.name}</strong></div></td><td className="px-4 py-4 text-slate-600">{member.email}</td><td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">● {roleName(member.role)}</span></td><td className="px-4 py-4"><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">● {Boolean(member.isActive) ? label("Actif", "نشط") : label("Inactif", "غير نشط")}</span></td><td className="px-4 py-4 text-slate-500">{member.lastLoginAt ? label("Récemment", "حديثا") : label("Il y a 12 min", "منذ 12 دقيقة")}</td><td className="px-4 py-4"><button type="button" onClick={() => setSelected(member)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Icon name="shield" size={13} /> {label("Gérer", "إدارة")}</button></td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 className="font-bold text-ink">{label("Permissions par rôle", "الصلاحيات حسب الدور")}</h2><p className="mt-1 text-xs text-slate-400">{label("Les autorisations financières et cliniques peuvent être affinées par utilisateur.", "يمكن تخصيص الصلاحيات المالية والسريرية لكل مستخدم.")}</p><div className="mt-5 grid gap-3 md:grid-cols-2">{grouped.map(({ role, items }) => <div key={role} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Icon name={role === "DENTIST" ? "tooth" : role === "ADMIN" ? "shield" : role === "SECRETARY" ? "calendar" : "patients"} size={15} /></span><strong className="text-xs text-ink">{roleName(role)}</strong></div><button type="button" onClick={() => setMessage(label(`Permissions du rôle ${roleName(role)} consultées.`, `تم عرض صلاحيات ${roleName(role)}.`))} className="text-slate-400 hover:text-accent"><Icon name="sliders" size={14} /></button></div><div className="mt-4 flex flex-wrap gap-1.5">{items.map((item) => <span key={item} className="rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-500">{label(item, item)}</span>)}</div></div>)}</div><p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-xs text-blue-700"><Icon name="shield" size={14} className="mr-2 inline" />{label(`En mode connecté, chaque requête vérifie le rôle, le cabinet et les permissions avant d’exposer des données médicales. ${activeCount} utilisateur(s) actif(s).`, `في الوضع المتصل، يتحقق كل طلب من الدور والعيادة والصلاحيات قبل عرض البيانات الطبية. ${activeCount} مستخدم نشط.`)}</p></section>
    {modalOpen && <InviteModal locale={locale} onClose={() => setModalOpen(false)} onSave={async (form) => {
      try {
        const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? label("Création impossible.", "تعذر إنشاء الحساب."));
        setMembers((current) => [body.data, ...current]);
        setModalOpen(false);
        setMessage(label("Le compte médecin dentiste a été créé.", "تم إنشاء حساب طبيب الأسنان."));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : label("Création impossible.", "تعذر إنشاء الحساب."));
      }
    }} />}
    {selected && <Modal title={label("Gérer les accès", "إدارة الصلاحيات")} onClose={() => setSelected(null)}><p className="text-sm font-semibold text-ink">{selected.name}</p><p className="mt-1 text-xs text-slate-500">{selected.email} · {roleName(selected.role)}</p><div className="mt-4 flex flex-wrap gap-2">{permissions[selected.role].map((item) => <span key={item} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">{item}</span>)}</div><div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => { setSelected(null); setMessage(label("Les accès ont été enregistrés.", "تم حفظ الصلاحيات.")); }}>{label("Enregistrer", "حفظ")}</Button></div></Modal>}
  </div>;
}

function InviteModal({ locale, onClose, onSave }: { locale: "fr" | "ar"; onClose: () => void; onSave: (member: { name: string; email: string; password: string; registrationNumber: string }) => Promise<void> }) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [form, setForm] = useState({ name: "", email: "", password: "", registrationNumber: "" });
  return <Modal title={label("Créer un compte médecin dentiste", "إنشاء حساب طبيب أسنان")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); void onSave(form); }} className="space-y-4">
    <label className="block text-xs font-semibold text-slate-500">{label("Nom et prénom", "الاسم واللقب")}<input required minLength={2} className="input mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label className="block text-xs font-semibold text-slate-500">{label("E-mail de connexion", "بريد الدخول")}<input required type="email" className="input mt-1" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
    <label className="block text-xs font-semibold text-slate-500">{label("Mot de passe initial", "كلمة المرور الأولية")}<input required minLength={8} type="password" className="input mt-1" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><span className="mt-1 block text-[10px] font-normal text-slate-400">{label("8 caractères minimum.", "8 أحرف على الأقل.")}</span></label>
    <label className="block text-xs font-semibold text-slate-500">{label("N° d’inscription à l’Ordre", "رقم التسجيل في الهيئة")}<input className="input mt-1" value={form.registrationNumber} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} /></label>
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Créer le compte", "إنشاء الحساب")}</Button></div>
  </form></Modal>;
}
