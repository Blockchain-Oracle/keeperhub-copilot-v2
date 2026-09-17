"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/* Portaldot components/docs/skill-content.tsx CopyRow, verbatim. */

export function CopyRow({ label, value, note }: { label: string; value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1700);
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-medium text-foreground">{label}</h3>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-background/50 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
        {value}
      </pre>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
