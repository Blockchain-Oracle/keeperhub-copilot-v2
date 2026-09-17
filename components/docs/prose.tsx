import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The furniture every docs page is built from.
 *
 * The docs are a guide to using the copilot, not a README. That shapes these:
 * there is a numbered walkthrough, a callout for the thing that catches people
 * out, and a table for "what this word means" — and there is no component for
 * a configuration block, because configuration belongs on one page under
 * Builders rather than in front of someone trying to send their first token.
 *
 * Docs stay English in every language (decision 41), so nothing here is keyed.
 */

export function DocPage({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="max-w-2xl pb-10">
      <span className="font-mono text-xs text-primary uppercase tracking-widest">{eyebrow}</span>
      <h1
        className="mt-3 text-[34px] leading-tight tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
      >
        {title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-fg-secondary">{lede}</p>
      <div className="mt-9 space-y-5">{children}</div>
    </article>
  );
}

/** A section heading inside a page. */
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="scroll-mt-32 pt-6 text-[22px] leading-snug tracking-[-0.01em] text-foreground"
      style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-fg-secondary">{children}</p>;
}

/** Emphasis for a thing on screen — a button, a label, a menu item. */
export function UI({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px] text-foreground">
      {children}
    </code>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="space-y-2 text-[15px] leading-relaxed text-fg-secondary marker:text-fg-muted">
      {children}
    </ul>
  );
}

export function Item({ children }: { children: ReactNode }) {
  return <li className="ml-5 list-disc pl-1">{children}</li>;
}

/*
 * A numbered walkthrough. The rail on the left is what makes it read as one
 * sequence rather than four headings that happen to be near each other.
 */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-0 border-border border-l pl-0">{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative pb-7 pl-7 last:pb-0">
      <span className="-left-[13px] absolute top-0 flex size-[26px] items-center justify-center rounded-full border border-card-bezel bg-surface-2 font-mono text-[11px] text-primary">
        {n}
      </span>
      <h3 className="pt-[3px] font-medium text-[15px] text-foreground">{title}</h3>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-fg-secondary">{children}</div>
    </li>
  );
}

/** The thing that catches people out, or the thing that is genuinely a warning. */
export function Note({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-[14px] leading-relaxed",
        tone === "warn"
          ? "border-pending/30 bg-pending/8 text-fg-secondary"
          : "border-card-bezel bg-surface-2/40 text-fg-secondary",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-pending" : "text-telemetry")} />
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function DocTable({ head, rows }: { head: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-card-bezel">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="border-border border-b bg-surface-2/40">
            <th className="px-4 py-2.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
              {head[0]}
            </th>
            <th className="px-4 py-2.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.18em]">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-border/60 border-b last:border-0">
              <td className="px-4 py-2.5 align-top font-medium text-foreground">{row[0]}</td>
              <td className="px-4 py-2.5 align-top text-fg-secondary">{row[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where to go next. Every page ends with one, so nothing is a dead end. */
export function Next({ links }: { links: { href: string; title: string; body: string }[] }) {
  return (
    <div className="grid gap-3 pt-6 sm:grid-cols-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="group rounded-xl border border-card-bezel bg-card p-4 shadow-[var(--lift-card)] transition-shadow hover:shadow-[var(--lift-card-hover)]"
        >
          <span className="flex items-center gap-1.5 font-medium text-[14px] text-foreground">
            {link.title}
            <ArrowRight className="size-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-fg-muted">{link.body}</span>
        </Link>
      ))}
    </div>
  );
}
