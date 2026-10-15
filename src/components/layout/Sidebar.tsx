"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./nav";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

export function Sidebar({ open, onClose, roleCode }: { open: boolean; onClose: () => void; roleCode: string }) {
  const pathname = usePathname();
  const { t } = useI18n();

  // "/" ne doit être actif que sur la page exacte ; "/patients" aussi pour "/patients/12"
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
          aria-label="DentaFlow - Dashboard"
          className="mb-6 flex items-center gap-2 rounded-lg px-3 text-xl font-bold text-ink transition hover:opacity-80"
        >
          <Image src="/dentalflow-icon.svg" alt="" aria-hidden="true" width={36} height={36} className="h-9 w-9 rounded-xl" priority />
          Denta<span className="text-accent">Flow</span>
        </Link>

        <nav className="flex-1 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t(`nav.${group.title}`)}</p>
              {group.items.map((item) => (
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