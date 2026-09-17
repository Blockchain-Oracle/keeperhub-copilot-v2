"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/*
 * Portaldot components/install-command.tsx, as slice 1 ported it into the
 * landing (components/landing/how-install.tsx): terminal chrome with three
 * dots, a tab strip, the command typed character by character on every tab
 * change, the copy button, the blinking caret.
 *
 * Changes: moved into its own file so the docs can use it, and the clients
 * are a prop, so the landing and the MCP setup page each pass their own. The
 * landing's look is unchanged; the token swap --surface-2 → --secondary and
 * the dropped synchronous reset stay as slice 1 made them.
 */

export interface InstallClient {
  id: string;
  label: string;
  lang: "bash" | "env" | "json";
  command: string;
  prompt?: string;
}

const TYPE_SPEED_MS = 28;

export function InstallCommand({ clients, className }: { clients: readonly InstallClient[]; className?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState("");
  const client = clients[active] ?? clients[0];
  const command = client?.command ?? "";

  // Typewriter — restart on every tab change. Bail clean if unmounted.
  useEffect(() => {
    let cancelled = false;
    let i = 0;
    // The first tick replaces the previous command; no synchronous reset in the
    // effect body (react-hooks/set-state-in-effect).
    const id = setInterval(() => {
      if (cancelled) return;
      i++;
      setTyped(command.slice(0, i));
      if (i >= command.length) clearInterval(id);
    }, TYPE_SPEED_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [command]);

  if (client === undefined) return null;

  function copy() {
    void navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl bg-card p-1 ring-1 ring-border-strong/60",
        "shadow-[var(--lift-card-hover)]",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-border bg-secondary/40">
        {/* Chrome row: three dots + filename + copy */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-destructive/70" />
            <span aria-hidden className="size-2.5 rounded-full bg-pending/70" />
            <span aria-hidden className="size-2.5 rounded-full bg-success/70" />
          </div>
          <span className="ml-2 truncate font-mono text-[11px] text-fg-muted">
            {client.prompt && client.prompt !== "$" ? client.prompt : "terminal"}
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy connection command"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            {copied ? "copied" : "copy"}
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {clients.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                i === active ? "bg-primary/15 text-primary" : "text-fg-muted hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Terminal body */}
        <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed text-foreground">
          {client.lang === "bash" ? (
            <>
              <span className="text-telemetry">{client.prompt ?? "$"}</span> <span>{typed}</span>
              <Caret />
            </>
          ) : (
            <>
              <span>{typed}</span>
              <Caret />
            </>
          )}
        </pre>
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1.05em] w-[7px] -translate-y-[2px] bg-foreground"
      style={{ animation: "pulse-soft 1.1s ease-in-out infinite" }}
    />
  );
}
