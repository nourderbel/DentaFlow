"use client";

import type { ReactNode } from "react";

type Props = { title: string; onClose: () => void; children: ReactNode; wide?: boolean };

export function Modal({ title, onClose, children, wide = false }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" className={`max-h-[90vh] w-full ${wide ? "max-w-6xl" : "max-w-xl"} overflow-y-auto rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}