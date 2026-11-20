"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";

type Role = "DENTIST" | "SECRETARY";
type Member = { id: number; name: string; email: string; role: Role; isActive: boolean | number; lastLoginAt: string | null };
type AccessModule = "dashboard" | "agenda" | "patients" | "consultations" | "odontogram" | "treatments" | "quotes" | "invoices" | "treasury" | "laboratory" | "stock" | "suppliers" | "reports" | "team" | "settings";
type AccessAction = "view" | "create" | "edit" | "delete";
type AccessGroup = { id: number; name: string; description: string };
type GroupMember = { groupId: number; userId: number };
type GroupPermission = { groupId: number; module: AccessModule; action: AccessAction };
type UserPermission = { userId: number; module: AccessModule; action: AccessAction; allowed: number | boolean };
type AccessData = {
  groups: AccessGroup[];
  members: GroupMember[];
  groupPermissions: GroupPermission[];
  userPermissions: UserPermission[];
  modules: AccessModule[];
  actions: AccessAction[];
};

const roleLabels: Record<Role, [string, string]> = {
  DENTIST: ["Dentiste", "طبيب أسنان"],
  SECRETARY: ["Secrétaire", "سكرتير(ة)"],
};
const moduleLabels: Record<AccessModule, [string, string]> = {
  dashboard: ["Tableau de bord", "لوحة القيادة"],
  agenda: ["Agenda", "المواعيد"],
  patients: ["Patients", "المرضى"],
  consultations: ["Consultations", "الاستشارات"],
  odontogram: ["Odontogramme", "مخطط الأسنان"],
  treatments: ["Traitements", "العلاجات"],
  quotes: ["Devis", "عروض الأسعار"],
  invoices: ["Factures", "الفواتير"],
  treasury: ["Trésorerie", "الخزينة"],
  laboratory: ["Laboratoire", "المخبر"],
  stock: ["Stock", "المخزون"],
  suppliers: ["Fournisseurs", "الموردون"],
  reports: ["Rapports", "التقارير"],
  team: ["Équipe", "الفريق"],
  settings: ["Paramètres", "الإعدادات"],
};
const actionLabels: Record<AccessAction, [string, string]> = {
  view: ["Voir", "عرض"],
  create: ["Créer", "إنشاء"],
  edit: ["Modifier", "تعديل"],
  delete: ["Supprimer", "حذف"],
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "La requête a échoué.");
  return body as T;
}

export function TeamView() {
  const { locale } = useI18n();
  const isArabic = locale === "ar";
  const label = (fr: string, ar: string) => isArabic ? ar : fr;
  const [members, setMembers] = useState<Member[]>([]);
  const [access, setAccess] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"users" | "groups">("users");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccessGroup | null | undefined>(undefined);
  const [editingUser, setEditingUser] = useState<Member | null>(null);

  const reloadAccess = useCallback(async () => {
    const data = await readJson<{ data: AccessData }>(await fetch("/api/access", { cache: "no-store" }));
    setAccess({
      ...data.data,
      groups: data.data.groups.map((group) => ({ ...group, id: Number(group.id) })),
      members: data.data.members.map((entry) => ({ groupId: Number(entry.groupId), userId: Number(entry.userId) })),
      groupPermissions: data.data.groupPermissions.map((entry) => ({ ...entry, groupId: Number(entry.groupId) })),
      userPermissions: data.data.userPermissions.map((entry) => ({ ...entry, userId: Number(entry.userId) })),
    });
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/team", { cache: "no-store" }).then(readJson<{ data: Member[] }>),
      fetch("/api/access", { cache: "no-store" }).then(readJson<{ data: AccessData }>),
    ]).then(([teamResult, accessResult]) => {
      if (!active) return;
      setMembers(teamResult.data);
      setAccess({
        ...accessResult.data,
        groups: accessResult.data.groups.map((group) => ({ ...group, id: Number(group.id) })),
        members: accessResult.data.members.map((entry) => ({ groupId: Number(entry.groupId), userId: Number(entry.userId) })),
        groupPermissions: accessResult.data.groupPermissions.map((entry) => ({ ...entry, groupId: Number(entry.groupId) })),
        userPermissions: accessResult.data.userPermissions.map((entry) => ({ ...entry, userId: Number(entry.userId) })),
      });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : locale === "ar" ? "تعذر التحميل." : "Chargement impossible.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale]);

  const roleName = (role: Role) => isArabic ? roleLabels[role][1] : roleLabels[role][0];
  const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const groupedUsers = useMemo(() => {
    if (!access) return new Map<number, string[]>();
    return new Map(access.groups.map((group) => [
      group.id,
      access.members.filter((member) => member.groupId === group.id).map((member) => members.find((user) => user.id === member.userId)?.name ?? "").filter(Boolean),
    ]));
  }, [access, members]);

  function exportCsv() {
    const rows = [
      ["Utilisateur", "E-mail", "Rôle", "Statut", "Groupes"],
      ...members.map((member) => [
        member.name,
        member.email,
        roleName(member.role),
        Boolean(Number(member.isActive)) ? label("Actif", "نشط") : label("Inactif", "غير نشط"),
        access?.members.filter((item) => item.userId === member.id)
          .map((item) => access.groups.find((group) => group.id === item.groupId)?.name)
          .filter((name): name is string => Boolean(name)).join(", ") ?? "",
      ]),
    ];
    const content = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "equipe-et-acces.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function inviteUser(form: { name: string; email: string; password: string; role: Role }) {
    try {
      const result = await readJson<{ data: Member }>(await fetch("/api/team", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      }));
      setMembers((current) => [result.data, ...current]);
      setInviteOpen(false);
      setMessage(label("Le compte a été créé.", "تم إنشاء الحساب."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Création impossible.", "تعذر إنشاء الحساب."));
    }
  }

  async function saveGroup(group: Omit<AccessGroup, "id">, permissions: GroupPermission[], userIds: number[]) {
    const body = { ...group, permissions: permissions.map(({ module, action }) => ({ module, action })), userIds };
    const isEditing = editingGroup !== null;
    const url = isEditing ? `/api/access/groups/${editingGroup?.id}` : "/api/access";
    const result = await readJson<{ data: AccessGroup }>(await fetch(url, {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    if (isEditing) {
      await reloadAccess();
    } else {
      await reloadAccess();
    }
    setEditingGroup(undefined);
    setMessage(label(`Le groupe « ${result.data.name} » a été enregistré.`, `تم حفظ المجموعة « ${result.data.name} »`));
  }

  async function deleteGroup(group: AccessGroup) {
    if (!window.confirm(label(`Supprimer le groupe « ${group.name} » ?`, `هل تريد حذف المجموعة « ${group.name} »؟`))) return;
    try {
      await readJson(await fetch(`/api/access/groups/${group.id}`, { method: "DELETE" }));
      await reloadAccess();
      setMessage(label("Le groupe a été supprimé.", "تم حذف المجموعة."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Suppression impossible.", "تعذر الحذف."));
    }
  }

  async function saveUserAccess(user: Member, groupIds: number[], overrides: Omit<UserPermission, "userId">[], role: Role) {
    await readJson(await fetch(`/api/access/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupIds, overrides, role }),
    }));
    await reloadAccess();
    setMembers((current) => current.map((member) => member.id === user.id ? { ...member, role } : member));
    setEditingUser(null);
    setMessage(label(`Les accès de ${user.name} ont été enregistrés.`, `تم حفظ صلاحيات ${user.name}.`));
  }

  async function toggleUserStatus(user: Member) {
    const isActive = !Boolean(user.isActive);
    try {
      await readJson(await fetch(`/api/team/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }));
      setMembers((current) => current.map((member) => member.id === user.id ? { ...member, isActive } : member));
      setMessage(isActive ? label("Le compte a été réactivé.", "تمت إعادة تنشيط الحساب.") : label("Le compte a été désactivé.", "تم تعطيل الحساب."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Modification impossible.", "تعذر التعديل."));
    }
  }

  const assignedUserCount = (access?.members ?? []).length;
  return <div className="space-y-5" dir={isArabic ? "rtl" : "ltr"}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight text-ink">{label("Équipe & accès", "الفريق والصلاحيات")}</h1><p className="mt-1 text-sm text-slate-500">{label("Organisez les comptes en groupes et contrôlez précisément les accès à chaque espace.", "نظم الحسابات في مجموعات وتحكم بدقة في الوصول إلى كل قسم.")}</p></div>
      <div className="flex gap-2"><Button onClick={exportCsv} disabled={loading || members.length === 0}><Icon name="download" size={14} />CSV</Button><Button onClick={() => setInviteOpen(true)}><Icon name="userPlus" size={14} />{label("Inviter un utilisateur", "دعوة مستخدم")}</Button><Button variant="primary" onClick={() => { setEditingGroup(null); setTab("groups"); }}><Icon name="plus" size={14} />{label("Créer un groupe", "إنشاء مجموعة")}</Button></div>
    </header>
    {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-3">
      <Summary icon="patients" title={label("Utilisateurs", "المستخدمون")} value={members.length} detail={label("Comptes du cabinet", "حسابات العيادة")} />
      <Summary icon="shield" title={label("Groupes", "المجموعات")} value={access?.groups.length ?? 0} detail={label("Profils de droits réutilisables", "ملفات صلاحيات قابلة لإعادة الاستخدام")} />
      <Summary icon="patients" title={label("Affectations", "التعيينات")} value={assignedUserCount} detail={label("Appartenances aux groupes", "العضويات في المجموعات")} />
    </div>
    <div className="flex gap-2 border-b border-line">
      <TabButton active={tab === "users"} onClick={() => setTab("users")}>{label("Utilisateurs", "المستخدمون")}</TabButton>
      <TabButton active={tab === "groups"} onClick={() => setTab("groups")}>{label("Groupes & droits", "المجموعات والصلاحيات")}</TabButton>
    </div>
    {tab === "users" ? <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line p-5"><h2 className="font-bold text-ink">{label("Membres du cabinet", "أعضاء العيادة")}</h2><p className="mt-1 text-xs text-slate-500">{loading ? label("Chargement…", "جارٍ التحميل…") : `${members.length} ${label("utilisateur(s)", "مستخدم")}`}</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Utilisateur", "E-mail", "Rôle", "Groupes", "Statut", "Dernière activité", "Accès"].map((title) => <th key={title} className="px-4 py-3 font-semibold">{label(title, title)}</th>)}</tr></thead>
        <tbody>{members.map((member) => {
          const userGroups = access?.members.filter((item) => item.userId === member.id).map((item) => access.groups.find((group) => group.id === item.groupId)?.name).filter((name): name is string => Boolean(name)) ?? [];
          return <tr key={member.id} className="border-t border-line hover:bg-slate-50/60">
            <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[10px] font-bold text-blue-600">{initials(member.name)}</span><strong className="text-ink">{member.name}</strong></div></td>
            <td className="px-4 py-4 text-slate-600">{member.email}</td><td className="px-4 py-4">{roleName(member.role)}</td>
            <td className="px-4 py-4"><div className="flex flex-wrap gap-1">{userGroups.length ? userGroups.map((name) => <span key={name} className="rounded-full bg-violet-50 px-2 py-1 text-[10px] text-violet-700">{name}</span>) : <span className="text-slate-400">{label("Droits par défaut", "الصلاحيات الافتراضية")}</span>}</div></td>
            <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${Boolean(Number(member.isActive)) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{Boolean(Number(member.isActive)) ? label("Actif", "نشط") : label("Inactif", "غير نشط")}</span></td>
            <td className="px-4 py-4 text-slate-500">{member.lastLoginAt ? label("Actif récemment", "نشط مؤخرا") : label("Jamais connecté", "لم يسجل الدخول")}</td>
            <td className="px-4 py-4"><div className="flex items-center gap-2"><Button onClick={() => setEditingUser(member)}><Icon name="shield" size={13} />{label("Gérer", "إدارة")}</Button><button type="button" onClick={() => void toggleUserStatus(member)} className="text-[10px] font-semibold text-slate-500 hover:text-accent">{Boolean(Number(member.isActive)) ? label("Désactiver", "تعطيل") : label("Réactiver", "إعادة تنشيط")}</button></div></td>
          </tr>;
        })}{!loading && members.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">{label("Aucun utilisateur.", "لا يوجد مستخدمون.")}</td></tr>}</tbody>
      </table></div>
    </section> : <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-bold text-ink">{label("Groupes de droits", "مجموعات الصلاحيات")}</h2><p className="mt-1 text-xs text-slate-500">{label("Les droits des groupes sont cumulés. Une exception individuelle peut accorder ou retirer un droit.", "تُجمع صلاحيات المجموعات، ويمكن للاستثناء الفردي منح صلاحية أو سحبها.")}</p></div><Button variant="primary" onClick={() => setEditingGroup(null)}><Icon name="plus" size={14} />{label("Nouveau groupe", "مجموعة جديدة")}</Button></div>
      {!access?.groups.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-accent"><Icon name="patients" size={22} /></span><h3 className="mt-4 font-semibold text-ink">{label("Créez votre premier groupe", "أنشئ مجموعتك الأولى")}</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{label("Par exemple : Accueil, Praticiens ou Gestion financière. Définissez les droits une seule fois et affectez-y plusieurs utilisateurs.", "مثال: الاستقبال أو الأطباء أو الإدارة المالية. حدد الصلاحيات مرة واحدة ثم أضف إليها عدة مستخدمين.")}</p><Button className="mt-4" variant="primary" onClick={() => setEditingGroup(null)}>{label("Créer un groupe", "إنشاء مجموعة")}</Button></div>}
      <div className="grid gap-4 lg:grid-cols-2">{access?.groups.map((group) => {
        const permissions = access.groupPermissions.filter((item) => item.groupId === group.id);
        const groupNames = groupedUsers.get(group.id) ?? [];
        return <article key={group.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-accent"><Icon name="patients" size={18} /></span><div><h3 className="font-bold text-ink">{group.name}</h3><p className="mt-1 text-xs text-slate-500">{group.description || label("Aucune description", "لا يوجد وصف")}</p></div></div><div className="flex gap-1"><button type="button" aria-label={label("Modifier le groupe", "تعديل المجموعة")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEditingGroup(group)}><Icon name="edit" size={15} /></button><button type="button" aria-label={label("Supprimer le groupe", "حذف المجموعة")} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={() => void deleteGroup(group)}><Icon name="x" size={15} /></button></div></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{permissions.length ? permissions.map((item) => <span key={`${item.module}:${item.action}`} className="rounded-full bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{moduleLabels[item.module][isArabic ? 1 : 0]} · {actionLabels[item.action][isArabic ? 1 : 0]}</span>) : <span className="text-xs text-amber-700">{label("Aucun droit attribué", "لم يتم منح أي صلاحيات")}</span>}</div>
          <div className="mt-4 border-t border-line pt-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label("Membres", "الأعضاء")} · {groupNames.length}</p><p className="mt-1 text-xs text-slate-600">{groupNames.length ? groupNames.join(", ") : label("Aucun utilisateur affecté", "لم يتم تعيين مستخدمين")}</p></div>
        </article>;
      })}</div>
    </section>}
    {inviteOpen && <InviteModal locale={locale} onClose={() => setInviteOpen(false)} onSave={inviteUser} />}
    {editingGroup !== undefined && access && <GroupModal
      group={editingGroup}
      members={members}
      access={access}
      locale={locale}
      onClose={() => setEditingGroup(undefined)}
      onSave={saveGroup}
    />}
    {editingUser && access && <UserAccessModal
      user={editingUser}
      access={access}
      locale={locale}
      onClose={() => setEditingUser(null)}
      onSave={saveUserAccess}
    />}
  </div>;
}

function Summary({ icon, title, value, detail }: { icon: string; title: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{title}</span><span className="rounded-lg bg-violet-50 p-2 text-accent"><Icon name={icon} size={16} /></span></div><p className="mt-3 text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? "border-accent text-accent" : "border-transparent text-slate-500 hover:text-ink"}`}>{children}</button>;
}

function PermissionMatrix({ modules, actions, selected, onToggle, locale }: {
  modules: AccessModule[];
  actions: AccessAction[];
  selected: Set<string>;
  onToggle: (module: AccessModule, action: AccessAction) => void;
  locale: "fr" | "ar";
}) {
  const index = locale === "ar" ? 1 : 0;
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  return <div className="overflow-x-auto rounded-xl border border-line">
    <table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-[11px] text-slate-500"><tr><th className="px-3 py-3 text-start">{label("Espace", "القسم")}</th>{actions.map((action) => <th key={action} className="px-3 py-3 text-center">{actionLabels[action][index]}</th>)}</tr></thead>
      <tbody>{modules.map((module) => <tr key={module} className="border-t border-line"><th scope="row" className="px-3 py-2.5 text-start text-xs font-medium text-ink">{moduleLabels[module][index]}</th>{actions.map((action) => {
        const key = `${module}:${action}`;
        return <td key={action} className="px-3 py-2.5 text-center"><input aria-label={`${moduleLabels[module][index]} — ${actionLabels[action][index]}`} type="checkbox" checked={selected.has(key)} onChange={() => onToggle(module, action)} className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent" /></td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

function GroupModal({ group, members, access, locale, onClose, onSave }: {
  group: AccessGroup | null;
  members: Member[];
  access: AccessData;
  locale: "fr" | "ar";
  onClose: () => void;
  onSave: (group: Omit<AccessGroup, "id">, permissions: GroupPermission[], userIds: number[]) => Promise<void>;
}) {
  const index = locale === "ar" ? 1 : 0;
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [permissions, setPermissions] = useState(() => new Set(access.groupPermissions.filter((item) => item.groupId === group?.id).map((item) => `${item.module}:${item.action}`)));
  const [userIds, setUserIds] = useState(() => access.members.filter((item) => item.groupId === group?.id).map((item) => item.userId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function toggle(module: AccessModule, action: AccessAction) {
    const key = `${module}:${action}`;
    setPermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const selected = [...permissions].map((key) => {
        const [module, action] = key.split(":") as [AccessModule, AccessAction];
        return { groupId: group?.id ?? 0, module, action };
      });
      await onSave({ name, description }, selected, userIds);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Enregistrement impossible.", "تعذر الحفظ."));
    } finally { setSaving(false); }
  }
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name));
  return <Modal title={group ? label("Modifier le groupe", "تعديل المجموعة") : label("Créer un groupe", "إنشاء مجموعة")} onClose={onClose} wide>
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">{label("Nom du groupe", "اسم المجموعة")}<input required minLength={2} maxLength={120} className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block text-sm font-semibold text-slate-700">{label("Description", "الوصف")}<input maxLength={500} className="input mt-1" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </div>
      <div><h3 className="mb-2 text-sm font-semibold text-ink">{label("Droits du groupe", "صلاحيات المجموعة")}</h3><p className="mb-3 text-xs text-slate-500">{label("Les utilisateurs affectés à ce groupe reçoivent uniquement les droits cochés (les droits de plusieurs groupes se cumulent).", "يحصل المستخدمون في هذه المجموعة على الصلاحيات المحددة فقط (تُجمع صلاحيات المجموعات المتعددة).")}</p>
        <PermissionMatrix modules={access.modules.filter((module) => module !== "team")} actions={access.actions} selected={permissions} onToggle={toggle} locale={locale} />
      </div>
      <div><h3 className="mb-2 text-sm font-semibold text-ink">{label("Affecter des utilisateurs", "تعيين المستخدمين")}</h3><div className="grid max-h-40 gap-2 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2">{sortedMembers.map((member) => { const active = Boolean(Number(member.isActive)); return <label key={member.id} className={`flex items-center gap-2 text-xs ${active ? "text-slate-600" : "text-slate-400"}`}><input type="checkbox" checked={userIds.includes(member.id)} disabled={!active} onChange={() => setUserIds((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent" />{member.name}<span className="text-slate-400">· {roleLabels[member.role][index]}{!active ? ` · ${label("inactif", "غير نشط")}` : ""}</span></label>; })}</div></div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Enregistrer le groupe", "حفظ المجموعة")}</Button></div>
    </form>
  </Modal>;
}

function UserAccessModal({ user, access, locale, onClose, onSave }: {
  user: Member;
  access: AccessData;
  locale: "fr" | "ar";
  onClose: () => void;
  onSave: (user: Member, groupIds: number[], overrides: Omit<UserPermission, "userId">[], role: Role) => Promise<void>;
}) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [groupIds, setGroupIds] = useState(() => access.members.filter((item) => item.userId === user.id).map((item) => item.groupId));
  const [role, setRole] = useState<Role>(user.role);
  const [overrides, setOverrides] = useState(() => new Map(access.userPermissions.filter((item) => item.userId === user.id).map((item) => [`${item.module}:${item.action}`, Boolean(item.allowed)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function setOverride(key: string, value: string) {
    setOverrides((current) => {
      const next = new Map(current);
      if (value === "inherit") next.delete(key);
      else next.set(key, value === "allow");
      return next;
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const parsed = [...overrides].map(([key, allowed]) => {
        const [module, action] = key.split(":") as [AccessModule, AccessAction];
        return { module, action, allowed };
      });
      await onSave(user, groupIds, parsed, role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : label("Enregistrement impossible.", "تعذر الحفظ."));
    } finally { setSaving(false); }
  }
  const index = locale === "ar" ? 1 : 0;
  return <Modal title={label("Gérer les accès individuels", "إدارة الصلاحيات الفردية")} onClose={onClose} wide>
    <form onSubmit={(event) => void submit(event)} className="space-y-5">
      <div><p className="font-semibold text-ink">{user.name}</p><p className="mt-1 text-xs text-slate-500">{user.email} · {roleLabels[user.role][index]}</p></div>
      <label className="block max-w-sm text-sm font-semibold text-slate-700">{label("Type de compte", "نوع الحساب")}<select className="input mt-1" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="DENTIST">{label("Médecin", "طبيب أسنان")}</option><option value="SECRETARY">{label("Secrétaire", "سكرتير(ة)")}</option></select></label>
      <div><h3 className="mb-2 text-sm font-semibold text-ink">{label("Groupes", "المجموعات")}</h3><div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">{access.groups.length ? access.groups.map((group) => <label key={group.id} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => setGroupIds((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent" />{group.name}</label>) : <p className="text-xs text-slate-500">{label("Aucun groupe créé.", "لا توجد مجموعات.")}</p>}</div></div>
      <div><h3 className="mb-2 text-sm font-semibold text-ink">{label("Exceptions individuelles", "استثناءات فردية")}</h3><p className="mb-3 text-xs text-slate-500">{label("Une exception remplace le droit issu des groupes. « Hériter » conserve les droits des groupes.", "يستبدل الاستثناء الصلاحية الموروثة من المجموعات. «وراثة» تستخدم صلاحيات المجموعات.")}</p>
        <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[660px] text-sm"><thead className="bg-slate-50 text-[11px] text-slate-500"><tr><th className="px-3 py-3 text-start">{label("Espace", "القسم")}</th>{access.actions.map((action) => <th key={action} className="px-2 py-3 text-center">{actionLabels[action][index]}</th>)}</tr></thead><tbody>{access.modules.filter((module) => module !== "team").map((module) => <tr key={module} className="border-t border-line"><th scope="row" className="px-3 py-2 text-start text-xs font-medium text-ink">{moduleLabels[module][index]}</th>{access.actions.map((action) => { const key = `${module}:${action}`; const value = overrides.has(key) ? overrides.get(key) ? "allow" : "deny" : "inherit"; return <td key={action} className="px-1 py-1.5 text-center"><select aria-label={`${moduleLabels[module][index]} - ${actionLabels[action][index]}`} className="max-w-28 rounded-lg border border-line px-1 py-1 text-[10px]" value={value} onChange={(event) => setOverride(key, event.target.value)}><option value="inherit">{label("Hériter", "وراثة")}</option><option value="allow">{label("Autoriser", "سماح")}</option><option value="deny">{label("Refuser", "رفض")}</option></select></td>; })}</tr>)}</tbody></table></div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? label("Enregistrement…", "جارٍ الحفظ…") : label("Enregistrer les accès", "حفظ الصلاحيات")}</Button></div>
    </form>
  </Modal>;
}

function InviteModal({ locale, onClose, onSave }: {
  locale: "fr" | "ar";
  onClose: () => void;
  onSave: (member: { name: string; email: string; password: string; role: Role }) => Promise<void>;
}) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: Role }>({ name: "", email: "", password: "", role: "DENTIST" });
  return <Modal title={label("Inviter un utilisateur", "دعوة مستخدم")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); void onSave(form); }} className="space-y-4">
    <label className="block text-sm font-semibold text-slate-700">{label("Nom et prénom", "الاسم واللقب")}<input required minLength={2} className="input mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label className="block text-sm font-semibold text-slate-700">{label("Adresse e-mail", "البريد الإلكتروني")}<input required type="email" className="input mt-1" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
    <label className="block text-sm font-semibold text-slate-700">{label("Type de compte", "نوع الحساب")}<select className="input mt-1" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}><option value="DENTIST">{label("Médecin", "طبيب أسنان")}</option><option value="SECRETARY">{label("Secrétaire", "سكرتير(ة)")}</option></select><span className="mt-1 block text-xs font-normal text-slate-500">{label("Les groupes et exceptions individuelles permettent d’ajuster les droits après création.", "يمكن ضبط الصلاحيات عبر المجموعات والاستثناءات بعد الإنشاء.")}</span></label>
    <label className="block text-sm font-semibold text-slate-700">{label("Mot de passe initial", "كلمة المرور الأولية")}<input required minLength={8} type="password" className="input mt-1" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>{label("Annuler", "إلغاء")}</Button><Button type="submit" variant="primary">{label("Créer le compte", "إنشاء الحساب")}</Button></div>
  </form></Modal>;
}
