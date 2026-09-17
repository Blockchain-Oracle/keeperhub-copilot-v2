"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { formatAddress } from "@/lib/format";

/* Portaldot components/tools.tsx — useCopy + CopyChip, verbatim. */

function useCopy() {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  }, []);
  return { copied, copy };
}

export function CopyChip({ value, label }: { value: string; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[12px] text-fg-secondary transition-colors hover:bg-surface-2 hover:text-foreground"
      title={value}
    >
      <span className="tabular-nums">{label ?? formatAddress(value, 6, 6)}</span>
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  );
}
