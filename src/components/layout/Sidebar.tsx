"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_GROUPS } from "./nav";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

export function Sidebar({ open, onClose, roleCode }: { open: boolean; onClose: () => void; roleCode: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [viewableModules, setViewableModules] = useState<string[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((body: { viewableModules?: string[] }) => {
        if (Array.isArray(body.viewableModules)) setViewableModules(body.viewableModules);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") console.error("Chargement des accès de navigation impossible.", error);
      });
    return () => controller.abort();
  }, []);

  // L'accueil ne correspond qu'à la racine ; les autres routes activent aussi leurs sous-pages.
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const accessModule = (href: string) => href === "/" || href === "/dashboard" ? "dashboard" : href.slice(1);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={onClose} />}
      <aside
        data-role={roleCode}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-white px-3 py-5 transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link
          href="/"
          onClick={onClose}
          aria-label="DentaClinic - Accueil"
          className="mb-6 flex items-center gap-2 rounded-lg px-3 text-xl font-bold text-ink transition hover:opacity-80"
        >
          <Image src="/dentaclinic-icon.svg" alt="" aria-hidden="true" width={36} height={36} className="h-9 w-9 rounded-xl" priority />
          <span className="text-accent">DentaClinic</span>
        </Link>

        <nav className="flex-1 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t(`nav.${group.title}`)}</p>
              {group.items.filter((item) => {
                return viewableModules === null || viewableModules.includes(accessModule(item.href));
              }).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive(item.href) ? "bg-accent/10 text-accent" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
                  }`}
                >
                  <Icon name={item.icon} size={17} className="shrink-0" />
                  {t(`nav.${item.label}`)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}