"use client";

import { useMemo, useState } from "react";

export const FDI_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
].map(String);

type Props = { value: string; onChange: (value: string) => void };

export function ToothPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => value.split(",").map((tooth) => tooth.trim()).filter(Boolean), [value]);
  const available = FDI_TEETH.filter((tooth) =>
    !selected.includes(tooth) && tooth.includes(search.trim()),
  );

  function toggle(tooth: string) {
    const next = selected.includes(tooth)
      ? selected.filter((item) => item !== tooth)
      : [...selected, tooth];
    onChange(next.join(", "));
    setSearch("");
  }

  return (
    <div className="relative mt-1">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 focus-within:border-accent">
        {selected.map((tooth) => (
          <button
            key={tooth}
            type="button"
            onClick={() => toggle(tooth)}
            aria-label={`Retirer la dent ${tooth}`}
            className="rounded-md bg-accent/10 px-2 py-1 text-xs font-semibold text-accent"
          >
            {tooth} ×
          </button>
        ))}
        <input
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && available.length === 1) {
              event.preventDefault();
              toggle(available[0]);
            }
          }}
          placeholder={selected.length ? "Rechercher une autre dent…" : "Rechercher une dent (ex. 16)…"}
          className="tooth-picker-input min-w-36 flex-1 border-0 bg-transparent py-0.5 text-sm outline-none"
          autoComplete="off"
        />
      </div>
      {open && (
        <div
          className="absolute z-20 mt-1 grid max-h-40 w-full grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {available.length ? available.map((tooth) => (
            <button
              key={tooth}
              type="button"
              onClick={() => toggle(tooth)}
              className="rounded-md border border-line px-1 py-1.5 text-xs text-slate-600 hover:border-accent hover:bg-accent/5 hover:text-accent"
            >
              {tooth}
            </button>
          )) : <span className="col-span-8 py-2 text-center text-xs text-slate-400">Aucune dent correspondante</span>}
          <button type="button" onClick={() => setOpen(false)} className="col-span-8 py-1 text-xs text-slate-400 hover:text-ink">Fermer</button>
        </div>
      )}
    </div>
  );
}
