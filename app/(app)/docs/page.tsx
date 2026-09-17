import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound, MessageSquareText, ShieldCheck } from "lucide-react";

import { copilotEnvFile } from "@/components/docs/copilot-env";
import { CodeBlock, CodeBlockCode } from "@/components/ui/code-block";
import { integrations, registryMeta } from "@/lib/registry";

export const metadata: Metadata = { title: "Getting started" };

/*
 * Portaldot app/docs/page.tsx: eyebrow, title, lede, three numbered step
 * cards, a Configuration code block and the call to the catalog.
 *
 * Changes: the steps are this app's (Connect KeeperHub, ask, authorize);
 * Portaldot's install terminal lives on MCP setup, because this app is used in
 * the browser rather than installed; the configuration block lists the
 * variables the copilot actually reads (lib/config.ts). Copy is ours.
 */

const INTEGRATION_COUNT = Object.keys(integrations).length;

// The same settings the landing's Copilot and Vercel tabs show (decision 22).
const envCode = copilotEnvFile({ comments: true });

const steps = [
  {
    icon: KeyRound,
    title: "Connect KeeperHub",
    body: "Sign in with your KeeperHub account. Your organisation's wallet signs everything; there is no browser wallet to install.",
  },
  {
    icon: MessageSquareText,
    title: "Ask",
    body: "Ask in plain words, like “What's the latest ETH/USD price on Chainlink?” or “Send 0 ETH to myself on Base Sepolia”. Reads answer straight away.",
  },
  {
    icon: ShieldCheck,
    title: "Authorize",
    body: "Anything that moves value stops as a card. Edit it, check the dry run, then authorize. The receipt stays in Activity.",
  },
];

export default function DocsHome() {
  return (
    <div className="max-w-2xl">
      <span className="font-mono text-xs tracking-widest text-primary uppercase">Getting started</span>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground">Start with KeeperHub Copilot</h1>
      <p className="mt-3 text-base text-muted-foreground">
        Chat with KeeperHub&apos;s {registryMeta.actionCount} actions across {INTEGRATION_COUNT} integrations. Sign in, ask
        in plain words, and authorize every write on a card.
      </p>

      <div className="mt-8 space-y-4">
        {steps.map((s, i) => (
          <div key={s.title} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <s.icon className="size-[18px]" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-medium text-foreground">
                <span className="font-mono text-xs text-fg-muted">0{i + 1}</span>
                {s.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold tracking-tight text-foreground">Configuration</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        To run the copilot yourself, set these in{" "}
        <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">.env.local</code>. The two secrets need at least
        32 characters each.
      </p>
      <div className="mt-4">
        <CodeBlock>
          <div className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">.env.local</div>
          <CodeBlockCode code={envCode} language="bash" theme="github-dark" />
        </CodeBlock>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">Browse all {registryMeta.actionCount} actions</h3>
          <p className="text-sm text-muted-foreground">Prices, balances, lending, staking, transfers and more, each with an example prompt.</p>
        </div>
        <Link
          href="/docs/actions"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-[transform,filter] hover:-translate-y-px hover:brightness-110"
        >
          Actions
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
