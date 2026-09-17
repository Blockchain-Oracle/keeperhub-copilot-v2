"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type KeyboardEvent } from "react";

import type { FieldSpec } from "@/lib/registry";
import { cn } from "@/lib/utils";

import type { FieldError } from "../editable.ts";
import { OptionSwitch } from "./option-switch";
import { widgetForField } from "./field-widget.ts";

/*
 * v1 components/cards/fields/FieldEditor.tsx: one controlled row per field
 * spec. The widget kind and value codecs come from field-widget.ts; amounts
 * stay strings. A field error anchors beside the row with its concrete fix.
 *
 * Paint: Portaldot's small mono label, its hero-pill input surface (card with a
 * border that turns primary on focus), destructive ink for an error.
 */

const INPUT_BASE =
  "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-fg-muted focus:border-primary disabled:opacity-40";

export function FieldEditor({
  spec,
  value,
  onChange,
  error,
  disabled = false,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: FieldError;
  disabled?: boolean;
}) {
  const t = useTranslations("cards");
  const widget = widgetForField(spec);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const describedBy = error !== undefined ? errorId : undefined;
  const invalid = error !== undefined ? true : undefined;
  const mono = widget.mono ? "font-mono tabular-nums" : "";

  // A model-proposed value outside the option set still shows, selected, so it is never submitted unseen.
  const currentOptionValue = typeof value === "string" ? value : "";
  const renderedOptions =
    widget.kind === "options" && widget.options !== undefined
      ? currentOptionValue !== "" && !widget.options.some((option) => option.value === currentOptionValue)
        ? [...widget.options, { value: currentOptionValue, label: currentOptionValue }]
        : widget.options
      : undefined;

  return (
    <div className={cn("py-2", error !== undefined && "border-l-2 border-destructive pl-3")}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={widget.kind === "options" || widget.kind === "boolean" ? undefined : inputId}
          className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase"
        >
          {spec.label}
          {spec.required ? (
            <>
              <span aria-hidden="true"> *</span>
              <span className="sr-only"> {t("fields.required")}</span>
            </>
          ) : null}
        </label>
        {spec.helpTip !== undefined ? <HelpTip label={spec.label} text={spec.helpTip} /> : null}
      </div>

      <div className="mt-1.5">
        {widget.kind === "boolean" ? (
          <button
            type="button"
            role="switch"
            aria-checked={value === true}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={disabled}
            onClick={() => onChange(value !== true)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-40",
              value === true ? "border-primary/40 bg-primary/12 text-primary" : "border-border text-fg-muted",
            )}
          >
            {value === true ? t("fields.yes") : t("fields.no")}
          </button>
        ) : widget.kind === "options" && widget.options !== undefined ? (
          <OptionSwitch
            label={spec.label}
            options={renderedOptions ?? widget.options}
            value={currentOptionValue}
            onChange={onChange}
            disabled={disabled}
          />
        ) : widget.kind === "fallback" ? (
          <div>
            <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface-2/40 p-2 font-mono text-[12px] text-fg-secondary">
              {stringifyFallback(value, t("fields.none"))}
            </pre>
            <p className="mt-1 text-[12px] text-fg-muted">{t("fields.fallbackNote")}</p>
          </div>
        ) : widget.multiline ? (
          <textarea
            id={inputId}
            rows={spec.rows ?? 3}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={spec.placeholder}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(INPUT_BASE, "resize-y", mono)}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            inputMode={widget.kind === "number" ? "decimal" : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={spec.placeholder}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(INPUT_BASE, mono)}
          />
        )}
      </div>

      {error !== undefined ? (
        <p id={errorId} className="mt-1 text-[12px]">
          <span className="font-medium text-destructive">{error.message}</span>
          {error.fix !== undefined ? <span className="text-fg-muted"> {error.fix}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/* v1's help tip: focus or hover shows it, Escape dismisses. */
function HelpTip({ label, text }: { label: string; text: string }) {
  const t = useTranslations("cards");
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tipId = useId();
  const visible = focused || hovered;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") setFocused(false);
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={t("fields.help", { label })}
        aria-describedby={visible ? tipId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={onKeyDown}
        className="flex size-5 items-center justify-center rounded-full border border-border font-mono text-[10px] text-fg-muted hover:text-foreground"
      >
        ?
      </button>
      {visible ? (
        <span
          id={tipId}
          role="tooltip"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="absolute top-6 right-0 z-10 w-56 rounded-xl border border-border-strong bg-popover p-2.5 text-[12px] text-fg-secondary shadow-[var(--lift-card-hover)]"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

function stringifyFallback(value: unknown, none: string): string {
  if (value === undefined || value === null) return none;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
