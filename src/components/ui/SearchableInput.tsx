"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

type OptionGroup = { label: string; options: string[] };
const normalize = (text: string) => text.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  groups?: OptionGroup[];
  placeholder?: string;
  required?: boolean;
  className?: string;
};

export function SearchableInput({ value, onChange, options, groups, placeholder, required, className = "" }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const filteredGroups = useMemo(() => (groups ?? [])
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => normalize(option).includes(normalize(value))),
    }))
    .filter((group) => group.options.length > 0), [groups, value]);
  const groupedOptions = new Set((groups ?? []).flatMap((group) => group.options.map(normalize)));
  const filteredOptions = options
    .filter((option) => !groupedOptions.has(normalize(option)) && normalize(option).includes(normalize(value)));
  const visibleOptions = [...filteredGroups.flatMap((group) => group.options), ...filteredOptions];

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, visibleOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const renderOption = (option: string, index: number, key: string) => (
    <button
      key={key}
      id={`${listId}-option-${index}`}
      type="button"
      role="option"
      aria-selected={activeIndex === index}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => choose(option)}
      className={`flex w-full items-center rounded-lg px-3 py-2 text-start text-sm transition ${
        activeIndex === index ? "bg-violet-50 text-violet-800" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {option}
    </button>
  );

  let optionIndex = 0;
  return (
    <div className="relative">
      <input
        ref={inputRef}
        required={required}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          {filteredGroups.map((group) => (
            <div key={group.label} className="pb-1">
              <p className="sticky top-0 z-10 rounded-md bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                {group.label}
              </p>
              {group.options.map((option) => {
                const index = optionIndex++;
                return renderOption(option, index, `${group.label}-${option}`);
              })}
            </div>
          ))}
          {filteredOptions.map((option) => {
            const index = optionIndex++;
            return renderOption(option, index, option);
          })}
          {visibleOptions.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400">Aucun résultat. Vous pouvez conserver votre saisie comme acte personnalisé.</p>
          )}
        </div>
      )}
    </div>
  );
}
