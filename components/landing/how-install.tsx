"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "./section-heading";
import { copilotEnvFile, vercelEnvCommands } from "@/components/docs/copilot-env";
import { InstallCommand, type InstallClient } from "@/components/docs/install-command";
import { cn } from "@/lib/utils";

/*
 * HowItWorks + Install.
 *
 * Structure ported verbatim from
 *   references/portaldot-mcp/packages/web/components/landing/how-install.tsx
 * and, for the terminal block, from
 *   references/portaldot-mcp/packages/web/components/install-command.tsx
 * (now components/docs/install-command.tsx, shared with the docs; this file
 * passes the landing's own clients).
 *
 * Kept: the boarding-pass receipt — stub numeral, perforation, watermark, meta
 * strip — the grid, the motion variants and the 0.08s stagger, the terminal
 * chrome with its three dots, the tab strip, the character-by-character type
 * on tab change, the copy button, the blinking caret.
 *
 * Substituted: the words, and one token — --surface-2 → --secondary
 * (identical value, oklch(0.198 0.012 282)).
 *
 * The four steps describe this app's flow: you say it, it finds the action, it
 * shows you before it runs, you get proof it happened.
 *
 * Text: messages/en/landing.json (decision 41).
 */

// Each step's title and body live under landing.howItWorks.steps.<id>.
const steps = [
  { num: "01", id: "ask", tone: "default" },
  { num: "02", id: "resolve", tone: "default" },
  { num: "03", id: "confirm", tone: "default" },
  { num: "04", id: "receipt", tone: "success" },
] as const;

export function HowItWorks() {
  const t = useTranslations("landing");
  return (
    <section id="how" className="relative border-t border-border px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          eyebrow={t("howItWorks.heading.eyebrow")}
          title={t.rich("howItWorks.heading.title", {
            accent: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
          subtitle={t("howItWorks.heading.subtitle")}
        />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <BoardingPass
                num={s.num}
                title={t(`howItWorks.steps.${s.id}.title`)}
                body={t(`howItWorks.steps.${s.id}.body`)}
                tone={s.tone}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BoardingPass({
  num,
  title,
  body,
  tone,
}: {
  num: string;
  title: string;
  body: string;
  tone: "default" | "success";
}) {
  const t = useTranslations("landing");
  const dotBg =
    tone === "success"
      ? "bg-success shadow-[0_0_8px_var(--success)]"
      : "bg-telemetry shadow-[0_0_8px_var(--telemetry)]";

  return (
    <article
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl bg-card p-1 ring-[1.5px] transition-shadow",
        tone === "success" ? "ring-success/45" : "ring-card-bezel",
        "shadow-[var(--lift-card)] hover:shadow-[var(--lift-card-hover)]",
      )}
    >
      <div className="relative h-full overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-border bg-card receipt-watermark">
        {/* meta strip */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-fg-muted">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className={cn("size-1.5 rounded-full", dotBg)} />
            {t("howItWorks.meta", { num })}
          </span>
          <span>{tone === "success" ? t("howItWorks.issued") : t("howItWorks.pending")}</span>
        </div>
        <div className="perforation" />

        {/* number stub */}
        <div className="grid grid-cols-[auto_1fr] gap-4 px-4 py-4">
          <div className="flex flex-col items-center justify-center border-r border-dashed border-border-strong/60 pr-4">
            <div
              className="text-[58px] leading-none tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
            >
              {num}
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-fg-muted">
              {t("howItWorks.step")}
            </div>
          </div>
          <div className="min-w-0">
            <h3
              className="text-[16px] leading-tight tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
            >
              {title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-secondary">{body}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function Install() {
  const t = useTranslations("landing");
  // "Shell" is the one tab named by a word rather than a product.
  const clients = CLIENTS.map((client) =>
    client.id === "shell" ? { ...client, label: t("install.shellTab") } : client,
  );
  return (
    <section id="install" className="relative border-t border-border px-4 py-20 sm:py-28">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <SectionHeading
          eyebrow={t("install.heading.eyebrow")}
          title={t.rich("install.heading.title", {
            accent: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
          subtitle={t("install.heading.subtitle")}
        />
        <div className="space-y-4">
          <InstallCommand clients={clients} />
          <Link
            href="https://app.keeperhub.com"
            className="group inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-telemetry transition-colors hover:text-foreground"
          >
            {t("install.createKey")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const CLIENTS: InstallClient[] = [
  {
    id: "shell",
    label: "Shell",
    lang: "bash",
    command: "export KEEPERHUB_API_KEY=kh_YOUR_KEY",
    prompt: "$",
  },
  // Decision 22: the settings the copilot really reads, shared with the docs.
  {
    id: "copilot",
    label: "Copilot",
    lang: "env",
    command: copilotEnvFile({ comments: false }),
    prompt: ".env.local",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    lang: "bash",
    command:
      'claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp --header "Authorization: Bearer kh_YOUR_KEY"',
    prompt: "$",
  },
  {
    id: "cursor",
    label: "Cursor",
    lang: "json",
    command: `{
  "mcpServers": {
    "keeperhub": {
      "url": "https://app.keeperhub.com/mcp",
      "headers": { "Authorization": "Bearer kh_YOUR_KEY" }
    }
  }
}`,
    prompt: "~/.cursor/mcp.json",
  },
  {
    id: "vercel",
    label: "Vercel",
    lang: "bash",
    command: vercelEnvCommands(),
    prompt: "$",
  },
];
