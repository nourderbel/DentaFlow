"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n";
import { NotificationCategory, notificationTitle, useNotifications } from "./useNotifications";

const categoryCopy: Record<NotificationCategory, { fr: string; ar: string; icon: string }> = {
  agenda: { fr: "Agenda", ar: "المواعيد", icon: "calendar" },
  stock: { fr: "Stock", ar: "المخزون", icon: "package" },
  laboratory: { fr: "Laboratoire", ar: "المخبر", icon: "flask" },
};

export function NotificationsView() {
  const { locale } = useI18n();
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;
  const { notifications, loading, error, refresh, markRead, unreadCount } = useNotifications();
  const [filter, setFilter] = useState<"all" | "active" | "history">("all");
  const visibleNotifications = notifications.filter((item) =>
    filter === "all" || (filter === "active" ? item.active : !item.active),
  );

  return <main className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{label("Centre de notifications", "مركز الإشعارات")}</h1>
        <p className="mt-1 text-sm text-slate-500">{label(`${unreadCount} notification(s) non lue(s)`, `${unreadCount} إشعار غير مقروء`)}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name="refresh" size={14} className="mr-1 inline" />{label("Actualiser", "تحديث")}
        </button>
        {unreadCount > 0 && <button type="button" onClick={() => void markRead(notifications.filter((item) => !item.read).map((item) => item.key))} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
          {label("Tout marquer comme lu", "تحديد الكل كمقروء")}
        </button>}
      </div>
    </header>

    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
        {([
          ["all", label("Toutes", "الكل")],
          ["active", label("Actives", "النشطة")],
          ["history", label("Historique", "السجل")],
        ] as const).map(([value, text]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-50"}`}>{text}</button>)}
      </div>
      {loading ? <p className="px-5 py-12 text-center text-sm text-slate-500">{label("Chargement des notifications…", "جارٍ تحميل الإشعارات…")}</p>
        : visibleNotifications.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">{filter === "history"
          ? label("Aucune notification dans l’historique.", "لا توجد إشعارات في السجل.")
          : filter === "active"
            ? label("Aucune notification active.", "لا توجد إشعارات نشطة.")
            : label("Aucune notification.", "لا توجد إشعارات.")}</p>
          : <ul className="divide-y divide-line">
            {visibleNotifications.map((item) => {
              const category = categoryCopy[item.category];
              return <li key={item.key}>
                <Link href={item.href} onClick={async (event) => { if (!await markRead([item.key])) event.preventDefault(); }} className={`flex items-start gap-4 px-5 py-4 transition hover:bg-slate-50 ${item.read ? "" : "bg-violet-50/40"}`}>
                  <span className={`mt-0.5 rounded-xl p-2 ${item.category === "agenda" ? "bg-blue-50 text-blue-600" : item.category === "stock" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}><Icon name={category.icon} size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">{notificationTitle(item, locale)}{!item.read && <span className="h-2 w-2 rounded-full bg-rose-500" />}<span className={`rounded-full px-2 py-0.5 text-[10px] ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.active ? label("Active", "نشطة") : label("Terminée", "منتهية")}</span></span>
                    <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
                    <span className="mt-1 block text-xs text-slate-500">{category[locale]}{item.context ? ` · ${item.context}` : ""}</span>
                  </span>
                  <Icon name="chevronRight" size={16} className="mt-1 shrink-0 text-slate-400" />
                </Link>
              </li>;
            })}
          </ul>}
    </section>
  </main>;
}
