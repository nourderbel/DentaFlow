"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { NAV_GROUPS } from "./nav";
import { NotificationCategory, notificationTitle, useNotifications } from "@/features/notifications/useNotifications";

type Props = { userName: string; role: string; onMenuClick: () => void };
type PatientSearchResult = {
  id: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
};
const notificationCategoryCopy: Record<NotificationCategory, { fr: string; ar: string; icon: string }> = {
  agenda: { fr: "Agenda", ar: "المواعيد", icon: "calendar" },
  stock: { fr: "Stock", ar: "المخزون", icon: "package" },
  laboratory: { fr: "Laboratoire", ar: "المخبر", icon: "flask" },
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

export function Topbar({ userName, role, onMenuClick }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { notifications, loading: notificationsLoading, error: notificationsError, markRead, unreadCount } = useNotifications();
  // Les entrées du sidebar sont la source unique des routes et de leurs traductions.
  // Le tri par longueur garantit que les sous-routes comme /patients/12 utilisent
  // le libellé « Patients » plutôt qu'une correspondance plus générale.
  const navItems = NAV_GROUPS.flatMap((group) => group.items).sort((a, b) => b.href.length - a.href.length);
  const currentNavItem = navItems.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const pageLabel = currentNavItem ? t(`nav.${currentNavItem.label}`) : t("page.overview");

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      const target = event.target as Node;
      if (!profileRef.current?.contains(target)) setProfileOpen(false);
      if (!searchRef.current?.contains(target)) setSearchOpen(false);
      if (!notificationsRef.current?.contains(target)) setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  useEffect(() => {
    const query = search.trim();
    if (!query) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(`/api/patients?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Recherche impossible.");
        setSearchResults((body.data ?? []).slice(0, 7));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Recherche impossible.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function goToSearchResults() {
    const query = search.trim();
    if (query) router.push(`/patients?q=${encodeURIComponent(query)}`);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goToSearchResults();
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur md:px-6">
      <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={onMenuClick} aria-label={t("topbar.openMenu")}>
        <Icon name="menu" size={20} />
      </button>

      <div className="hidden shrink-0 items-center gap-2 text-xs text-slate-400 md:flex">
        <Link href="/" className="hover:text-accent">DentaClinic</Link>
        <Icon name="chevronRight" size={14} />
        <span className="font-semibold text-ink">{pageLabel}</span>
      </div>

      <div ref={searchRef} className="relative hidden min-w-0 max-w-sm flex-1 lg:block">
        <form onSubmit={submitSearch} className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onFocus={() => { if (search.trim()) setSearchOpen(true); }}
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchOpen(Boolean(event.target.value.trim()));
            }}
            placeholder={t("topbar.search")}
            aria-label={t("topbar.searchLabel")}
            className="topbar-search-input search-with-icon w-full rounded-xl border border-line bg-slate-50 py-2 ps-11 pe-3 text-xs outline-none transition focus:border-accent focus:bg-white"
          />
        </form>
        {searchOpen && (
          <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            {searchLoading && <p className="px-4 py-3 text-xs text-slate-500">{t("common.loading")}</p>}
            {!searchLoading && searchError && <p className="px-4 py-3 text-xs text-rose-600">{searchError}</p>}
            {!searchLoading && !searchError && searchResults.length === 0 && (
              <p className="px-4 py-3 text-xs text-slate-500">{t("common.none")}</p>
            )}
            {!searchLoading && !searchError && searchResults.map((patient) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                onClick={() => { setSearchOpen(false); setSearch(""); }}
                className="block border-b border-line px-4 py-2.5 last:border-0 hover:bg-slate-50"
              >
                <span className="block text-xs font-semibold text-ink">{patient.firstName} {patient.lastName}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">{patient.patientNumber} · {patient.phone}</span>
              </Link>
            ))}
            {!searchLoading && !searchError && searchResults.length > 0 && (
              <button type="button" onClick={() => { setSearchOpen(false); goToSearchResults(); }} className="w-full border-t border-line px-4 py-2 text-left text-xs font-semibold text-accent hover:bg-slate-50">
                Voir tous les résultats
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative" ref={notificationsRef}>
          <button type="button" aria-label={t("topbar.notifications")} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <Icon name="bell" size={16} />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
          {notificationsOpen && <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div><p className="text-sm font-semibold text-ink">{locale === "ar" ? "الإشعارات" : "Notifications"}</p><p className="text-[11px] text-slate-500">{locale === "ar" ? `${unreadCount} غير مقروء` : `${unreadCount} non lue(s)`}</p></div>
              {unreadCount > 0 && <button type="button" onClick={() => void markRead(notifications.filter((item) => !item.read).map((item) => item.key))} className="text-[11px] font-semibold text-accent">{locale === "ar" ? "تحديد الكل كمقروء" : "Tout lire"}</button>}
            </div>
            {notificationsError && <p role="alert" className="px-4 py-3 text-xs text-rose-600">{notificationsError}</p>}
            {notificationsLoading && notifications.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-500">{t("common.loading")}</p>
              : notifications.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-500">{locale === "ar" ? "لا توجد إشعارات نشطة." : "Aucune notification active."}</p>
                : <ul className="max-h-96 overflow-y-auto">
                  {notifications.slice(0, 10).map((item) => {
                    const category = notificationCategoryCopy[item.category];
                    return <li key={item.key}>
                      <Link href={item.href} onClick={async (event) => { if (!await markRead([item.key])) event.preventDefault(); else setNotificationsOpen(false); }} className={`flex gap-3 border-b border-line px-4 py-3 hover:bg-slate-50 ${item.read ? "" : "bg-violet-50/40"}`}>
                        <Icon name={category.icon} size={16} className="mt-0.5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-xs font-semibold text-ink">{notificationTitle(item, locale)}{!item.read && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}</span><span className="mt-1 block truncate text-[11px] text-slate-600">{item.description}</span><span className="mt-1 block truncate text-[10px] text-slate-400">{category[locale]}{item.context ? ` · ${item.context}` : ""}</span></span>
                      </Link>
                    </li>;
                  })}
                </ul>}
            <Link href="/notifications" onClick={() => setNotificationsOpen(false)} className="block border-t border-line px-4 py-3 text-center text-xs font-semibold text-accent hover:bg-slate-50">{locale === "ar" ? "عرض كل الإشعارات" : "Tout voir"}</Link>
          </div>}
        </div>
        <span className="hidden h-7 w-px bg-line sm:block" />
        <button type="button" onClick={() => setLocale(locale === "fr" ? "ar" : "fr")} className="rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-accent hover:bg-slate-50" aria-label={locale === "fr" ? "العربية" : t("topbar.french")}>{locale === "fr" ? "عربي" : "FR"}</button>
       

        <div className="relative" ref={profileRef}>
          <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-500 text-xs font-bold text-white">{initials(userName)}</span>
            <span className="hidden max-w-32 text-left sm:block"><span className="block truncate text-xs font-semibold text-ink">{userName}</span><span className="block truncate text-[10px] text-slate-400">{role}</span></span>
            <Icon name="chevronDown" size={14} className="text-slate-400" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-line bg-white p-2 shadow-lg">
              <div className="border-b border-line px-3 pb-2"><p className="text-sm font-semibold text-ink">{userName}</p><p className="text-xs text-slate-400">{role}</p></div>
              <Link href="/settings" onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"><Icon name="settings" size={14} /> {t("topbar.profileSettings")}</Link>
              <Link href="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"><Icon name="shield" size={14} /> {t("topbar.permissions")}</Link>
              <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"><Icon name="logout" size={14} /> {t("topbar.logout")}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
