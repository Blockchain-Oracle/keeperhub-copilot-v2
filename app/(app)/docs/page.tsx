import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity as ActivityIcon,
  AudioLines,
  Blocks,
  MessageSquareText,
  ScrollText,
  Workflow,
} from "lucide-react";

import { DocPage, H2, Next, P, UI } from "@/components/docs/prose";
import { integrations, registryMeta } from "@/lib/registry";

export const metadata: Metadata = { title: "What this is" };

const INTEGRATIONS = Object.keys(integrations).length;

const MAP = [
  {
    icon: MessageSquareText,
    href: "/app",
    title: "Chat",
    body: "Where you ask for things. Answers come back as cards you can read at a glance.",
  },
  {
    icon: AudioLines,
    href: "/docs/use/voice",
    title: "Voice",
    body: "The same copilot, out loud. It can look things up and propose, but it never authorizes.",
  },
  {
    icon: Workflow,
    href: "/app/automations",
    title: "Automations",
    body: "Things it keeps doing for you after you describe them once.",
  },
  {
    icon: ScrollText,
    href: "/app/history",
    title: "History",
    body: "Every conversation you have had, and the cards that were in it.",
  },
  {
    icon: ActivityIcon,
    href: "/app/activity",
    title: "Activity",
    body: "The record of what actually ran — kept separately, so deleting a chat never deletes it.",
  },
  {
    icon: Blocks,
    href: "/docs/actions",
    title: "Actions",
    body: `All ${registryMeta.actionCount} things KeeperHub can do, and what each one touches.`,
  },
];

export default function DocsHome() {
  return (
    <DocPage
      eyebrow="Guide"
      title="What this is"
      lede="KeeperHub Copilot is a way of using KeeperHub by describing what you want instead of building it. These pages walk through it one part at a time."
    >
      <H2>KeeperHub, and this</H2>
      <P>
        <UI>KeeperHub</UI> is the platform underneath. It automates things onchain: it can read
        prices and balances, move tokens, work with lending and staking protocols, and keep workflows
        running on a schedule, on a contract event, or when a payment arrives. It signs with your
        organisation&apos;s own wallet, and it handles gas, ordering and retries so you do not have to.
      </P>
      <P>
        <UI>This app</UI> is a copilot for that. It does not replace KeeperHub or do anything
        KeeperHub cannot — it is a way in. You say what you want in your own words; it works out which
        of KeeperHub&apos;s {registryMeta.actionCount} actions across {INTEGRATIONS} integrations you
        meant, fills the action in, shows you, and asks KeeperHub to run it.
      </P>
      <P>
        You never install a browser wallet. You sign in with your KeeperHub account, and your
        organisation&apos;s wallet is what signs.
      </P>

      <H2>One app, a few places to be</H2>
      <div className="grid gap-3 sm:grid-cols-2">
        {MAP.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="group rounded-xl border border-card-bezel bg-card p-4 shadow-[var(--lift-card)] transition-shadow hover:shadow-[var(--lift-card-hover)]"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <entry.icon className="size-4" />
            </span>
            <span className="mt-3 block font-medium text-[15px] text-foreground">{entry.title}</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-fg-muted">{entry.body}</span>
          </Link>
        ))}
      </div>

      <H2>Where to start</H2>
      <P>
        If you have never opened it, go in order: connect, ask something, then do something. The first
        two cost nothing and move nothing.
      </P>

      <Next
        links={[
          {
            href: "/docs/start/connect",
            title: "Connect KeeperHub",
            body: "Signing in, and what the organisation wallet is.",
          },
          {
            href: "/docs/start/first-answer",
            title: "Ask your first question",
            body: "A question answers straight away and moves nothing.",
          },
          {
            href: "/docs/how/architecture",
            title: "How it connects",
            body: "What happens between your sentence and the chain.",
          },
          {
            href: "/docs/help/glossary",
            title: "Glossary",
            body: "Plain meanings for the words these pages use.",
          },
        ]}
      />
    </DocPage>
  );
}
