import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * DeepBookie components/shell/Page.tsx and the page states it repeats: the
 * page column, its header with an action slot, the centred empty or error
 * block (history/page.tsx:196-206) and the filter pills (markets/page.tsx).
 *
 * Changes: Portaldot tokens; the shell's main scrolls, so Page sets only the
 * width and gutter; the header wraps on phones so its pills drop below the
 * title; the pills take Portaldot tool-grid's pill grammar.
 */

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-5xl px-5 py-6 md:px-6 md:py-7 lg:px-8", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold tracking-[-0.03em] text-foreground">{title}</h1>
        {subtitle !== undefined && <p className="mt-0.5 text-[13px] text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Centered({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md text-center">
        <p className="text-[15px] font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-2 text-sm text-fg-muted">{body}</p>
        {action !== undefined && <div className="mt-5 inline-flex">{action}</div>}
      </div>
    </div>
  );
}

export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-end gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            option.value === value
              ? "border-primary/40 bg-primary/12 text-primary"
              : "border-border bg-card text-muted-foreground hover:border-border-hover hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** DeepBookie's table header cell. */
export const TH = "text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-muted";
