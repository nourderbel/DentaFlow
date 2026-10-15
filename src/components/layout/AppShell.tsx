"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";

type Props = { userName: string; role: string; roleCode: string; children: ReactNode };

export function AppShell({ userName, role, roleCode, children }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useI18n();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} roleCode={roleCode} />
      <div className="md:pl-64">
        <Topbar userName={userName} role={role} onMenuClick={() => setMenuOpen(true)} />
        <main className="mx-auto max-w-[1600px] p-4 md:p-8">
          <button
            type="button"
            onClick={goBack}
            aria-label={t("common.backLabel")}
            title={t("common.backLabel")}
            className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <Icon name="arrowLeft" size={16} />
            {t("common.back")}
          </button>
          {children}
        </main>
      </div>
    </div>
  );
}