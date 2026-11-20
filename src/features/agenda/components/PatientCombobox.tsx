"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Patient } from "../types";

type Props = {
  patients: Patient[];
  selectedPatientId: string;
  onSelectPatient: (patientId: string) => void;
  onNewPatientClick: () => void;
  required?: boolean;
};

const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function PatientCombobox({
  patients,
  selectedPatientId,
  onSelectPatient,
  onNewPatientClick,
  required = true,
}: Props) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.id) === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  // Synchronise le libellé affiché lorsqu'un patient est sélectionné
  useEffect(() => {
    if (selectedPatient) {
      setQuery(`${selectedPatient.firstName} ${selectedPatient.lastName} — ${selectedPatient.patientNumber}`);
    } else if (!isOpen) {
      setQuery("");
    }
  }, [selectedPatient, isOpen]);

  // Fermer la liste déroulante lors d'un clic en dehors
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
        if (selectedPatient) {
          setQuery(`${selectedPatient.firstName} ${selectedPatient.lastName} — ${selectedPatient.patientNumber}`);
        } else {
          setQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedPatient]);

  // Filtrage intelligent (nom, prénom, numéro de dossier, téléphone)
  const filteredPatients = useMemo(() => {
    const rawSearch = normalize(query);
    if (!rawSearch) return patients;

    // Si le query est exactement le nom du patient sélectionné et que la liste vient de s'ouvrir, afficher tous les patients
    if (
      selectedPatient &&
      rawSearch === normalize(`${selectedPatient.firstName} ${selectedPatient.lastName} — ${selectedPatient.patientNumber}`)
    ) {
      return patients;
    }

    return patients.filter((patient) => {
      const fullName1 = normalize(`${patient.firstName} ${patient.lastName}`);
      const fullName2 = normalize(`${patient.lastName} ${patient.firstName}`);
      const patientNum = normalize(patient.patientNumber ?? "");
      const phone = normalize(patient.phone ?? "");
      return (
        fullName1.includes(rawSearch) ||
        fullName2.includes(rawSearch) ||
        patientNum.includes(rawSearch) ||
        phone.includes(rawSearch)
      );
    });
  }, [patients, query, selectedPatient]);

  function handleSelect(patient: Patient) {
    onSelectPatient(String(patient.id));
    setQuery(`${patient.firstName} ${patient.lastName} — ${patient.patientNumber}`);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleClear() {
    onSelectPatient("");
    setQuery("");
    setIsOpen(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev < filteredPatients.length - 1 ? prev + 1 : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredPatients.length - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && filteredPatients[activeIndex]) {
      event.preventDefault();
      handleSelect(filteredPatients[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        {/* Champ de recherche + sélection unifié */}
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listId}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
              // Si l'utilisateur modifie le texte, on désélectionne le patient actuel pour forcer un choix explicite
              if (selectedPatientId) {
                onSelectPatient("");
              }
            }}
            onFocus={() => {
              setIsOpen(true);
              // Si un patient est déjà choisi, sélectionner tout le texte pour faciliter la recherche d'un autre
              if (selectedPatient) {
                inputRef.current?.select();
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher ou sélectionner un patient..."
            className={`search-with-icon w-full rounded-xl border bg-white py-2.5 pe-16 ps-11 text-sm text-slate-700 outline-none transition ${
              selectedPatient
                ? "border-emerald-300 bg-emerald-50/20 font-medium text-emerald-950 focus:border-emerald-400"
                : "border-[#dfe7f2] focus:border-[#6b5ce7] focus:ring-2 focus:ring-[#6b5ce7]/10"
            }`}
          />

          {/* Boutons d'action dans le champ (Effacer / Flèche) */}
          <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {selectedPatientId || query ? (
              <button
                type="button"
                onClick={handleClear}
                title="Effacer la sélection"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="x" size={14} />
              </button>
            ) : null}

            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                setIsOpen((prev) => !prev);
                inputRef.current?.focus();
              }}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <Icon
                name="chevronDown"
                size={15}
                className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Bouton création rapide de nouveau patient */}
        <button
          type="button"
          onClick={onNewPatientClick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#6b5ce7] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
        >
          <Icon name="plus" size={14} />
          <span>Nouveau patient</span>
        </button>
      </div>

      {/* Input natif masqué pour validation HTML5 'required' du formulaire */}
      {required && (
        <input
          tabIndex={-1}
          required
          aria-hidden="true"
          value={selectedPatientId}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
        />
      )}

      {/* Liste déroulante des patients */}
      {isOpen && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-400">
            <span>{filteredPatients.length} patient(s) disponible(s)</span>
            {selectedPatient && <span className="text-emerald-600 font-medium">1 sélectionné</span>}
          </div>

          {filteredPatients.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {filteredPatients.map((patient, index) => {
                const isSelected = String(patient.id) === selectedPatientId;
                const isHighlighted = activeIndex === index;

                return (
                  <button
                    key={patient.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      // Empêche le blur de l'input avant le clic
                      e.preventDefault();
                    }}
                    onClick={() => handleSelect(patient)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition ${
                      isSelected
                        ? "bg-violet-50 text-violet-950 font-medium"
                        : isHighlighted
                          ? "bg-slate-50 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                          isSelected
                            ? "bg-violet-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {patient.firstName.charAt(0).toUpperCase()}
                        {patient.lastName.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {patient.firstName} {patient.lastName}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          Dossier : <span className="font-medium text-slate-600">{patient.patientNumber}</span>
                          {patient.phone ? ` · Tél : ${patient.phone}` : ""}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="flex shrink-0 items-center text-violet-600">
                        <Icon name="check" size={16} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-5 text-center">
              <p className="text-sm font-medium text-slate-600">Aucun patient trouvé</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Aucun dossier ne correspond à votre recherche.
              </p>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsOpen(false);
                  onNewPatientClick();
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
              >
                <Icon name="plus" size={13} />
                <span>Créer une fiche pour ce patient</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
