"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  id: string;
  value: string;
  options: readonly SearchableSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  placeholder?: string;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

export function filterSearchableSelectOptions(
  options: readonly SearchableSelectOption[],
  query: string,
): SearchableSelectOption[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "") return [...options];

  return options.filter((option) =>
    normalizeSearchText(option.label).includes(normalizedQuery),
  );
}

export function findNextEnabledOption(
  options: readonly SearchableSelectOption[],
  activeIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;

  const startingIndex = activeIndex >= 0
    ? activeIndex
    : direction === 1
      ? -1
      : 0;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidateIndex = (
      startingIndex + direction * offset + options.length
    ) % options.length;
    if (!options[candidateIndex].disabled) return candidateIndex;
  }

  return -1;
}

export default function SearchableSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  searchPlaceholder,
  emptyMessage,
  placeholder = "เลือกรายการ",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(
    () => filterSearchableSelectOptions(options, searchQuery),
    [options, searchQuery],
  );
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? (value || placeholder);
  const listboxId = `${id}-listbox`;
  const activeIndex = filteredOptions.findIndex(
    (option) => option.value === activeValue && !option.disabled,
  );
  const activeOptionId = activeIndex >= 0
    ? `${id}-option-${activeIndex}`
    : undefined;

  const closeDropdown = useCallback((restoreTriggerFocus: boolean) => {
    setIsOpen(false);
    setSearchQuery("");
    setActiveValue(null);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  }, []);

  const openDropdown = () => {
    if (disabled) return;

    const selectedOptionIsEnabled = selectedOption && !selectedOption.disabled;
    const firstEnabledIndex = findNextEnabledOption(options, -1, 1);
    setSearchQuery("");
    setActiveValue(
      selectedOptionIsEnabled
        ? selectedOption.value
        : options[firstEnabledIndex]?.value ?? null,
    );
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    searchInputRef.current?.focus();

    const searchInput = searchInputRef.current;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      event.stopPropagation();
      closeDropdown(true);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeDropdown(false);
      }
    };

    searchInput?.addEventListener("keydown", handleEscape);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      searchInput?.removeEventListener("keydown", handleEscape);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeDropdown, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId, isOpen]);

  const selectOption = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    if (option.value !== value) onChange(option.value);
    closeDropdown(true);
  };

  return (
    <div
      ref={rootRef}
      className="min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeDropdown(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={disabled}
        tabIndex={isOpen ? -1 : 0}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[#D9E1E2] bg-white px-3 py-2 text-left text-[13px] text-[#101820] transition-colors hover:border-[#B8C4C8] focus:border-[#0057B8] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/15 disabled:cursor-not-allowed disabled:bg-[#F0F3F4] disabled:text-[#8A9498]"
        onClick={() => {
          if (isOpen) closeDropdown(false);
          else openDropdown();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openDropdown();
          }
        }}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-[#5F6B70] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="mt-1 min-w-0 rounded-lg border border-[#B8C4C8] bg-white p-1.5 shadow-lg">
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-[#D9E1E2] bg-white px-2.5 focus-within:border-[#0057B8] focus-within:ring-2 focus-within:ring-[#0057B8]/15">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8A9498]" />
            <input
              ref={searchInputRef}
              type="search"
              role="combobox"
              aria-label={searchPlaceholder}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              autoComplete="off"
              value={searchQuery}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-[#101820] placeholder:text-[#8A9498] focus:outline-none"
              onChange={(event) => {
                const nextQuery = event.target.value;
                const nextOptions = filterSearchableSelectOptions(options, nextQuery);
                const firstEnabledIndex = findNextEnabledOption(nextOptions, -1, 1);
                setSearchQuery(nextQuery);
                setActiveValue(nextOptions[firstEnabledIndex]?.value ?? null);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const nextIndex = findNextEnabledOption(
                    filteredOptions,
                    activeIndex,
                    event.key === "ArrowDown" ? 1 : -1,
                  );
                  setActiveValue(filteredOptions[nextIndex]?.value ?? null);
                  return;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  const activeOption = filteredOptions[activeIndex];
                  if (activeOption) selectOption(activeOption);
                  return;
                }

              }}
            />
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="mt-1 max-h-56 min-w-0 overflow-y-auto overscroll-contain"
          >
            {filteredOptions.length === 0 ? (
              <p
                role="option"
                aria-disabled="true"
                aria-selected="false"
                aria-live="polite"
                className="px-3 py-4 text-center text-[12px] text-[#5F6B70]"
              >
                {emptyMessage}
              </p>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = option.value === activeValue;

                return (
                  <button
                    key={option.value}
                    id={`${id}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    tabIndex={-1}
                    disabled={option.disabled}
                    className={`flex w-full min-w-0 items-start gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
                      isActive
                        ? "bg-[#EAF3FC] text-[#00263A]"
                        : "text-[#101820] hover:bg-[#F0F3F4]"
                    } ${option.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    onMouseMove={() => {
                      if (!option.disabled) setActiveValue(option.value);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOption(option)}
                  >
                    <Check
                      aria-hidden="true"
                      className={`mt-0.5 h-4 w-4 shrink-0 text-[#0057B8] ${isSelected ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="min-w-0 break-words">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
