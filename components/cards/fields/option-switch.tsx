"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import type { SelectOption } from "@/lib/registry";
import { cn } from "@/lib/utils";

/*
 * v1 components/cards/OptionSwitch.tsx: a real radiogroup with one Tab stop,
 * roving focus and arrow keys. `commitOnFocus={false}` lets arrows browse
 * without committing, for a switch whose commit re-runs the card.
 *
 * Paint: Portaldot components/docs/tool-grid.tsx category pills (active
 * primary/12 with a primary/40 border, idle border with muted ink).
 */
export function OptionSwitch({
  label,
  options,
  value,
  onChange,
  disabled = false,
  commitOnFocus = true,
}: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  commitOnFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const tabbableIndex =
    focusedIndex >= 0 && focusedIndex < options.length ? focusedIndex : selectedIndex >= 0 ? selectedIndex : 0;

  function moveFocus(index: number) {
    const option = options[index];
    if (option === undefined) return;
    setFocusedIndex(index);
    refs.current[index]?.focus();
    if (commitOnFocus) onChange(option.value);
  }

  function commit(index: number) {
    const option = options[index];
    if (option === undefined) return;
    setFocusedIndex(index);
    onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || options.length === 0) return;
    const current = tabbableIndex;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus((current + 1) % options.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus((current - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(options.length - 1);
        break;
    }
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabbableIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => commit(index)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-40",
              selected
                ? "border-primary/40 bg-primary/12 text-primary"
                : "border-border text-fg-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
