"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PRIMARY_BUTTON } from "@/components/cards/write-card-parts";
import { NEW_CONVERSATION_TITLE } from "@/components/chat/chat-rules";
import { UtcTime } from "@/components/data/utc-time";
import { useAccount } from "@/components/shell/account-context";
import { SignInGate } from "@/components/shell/sign-in/sign-in-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { historySubtitle, type ConversationSummary } from "@/lib/activity";
import { useTranslate } from "@/lib/i18n/use-translate";

import { Centered, Page, PageHeader } from "./page";

/*
 * DeepBookie app/(app)/history/page.tsx: the journal gallery. A grid of
 * session cards with a perforated top edge, a wax seal when anything executed,
 * the time and an executed count, and its loading, error and empty states.
 *
 * Changes (decision 16): a card opens the conversation itself, where the
 * 30-minute rule decides live or read-only, so there is no in-page replay.
 * Portaldot's 1px perforation for DeepBookie's 3px dashes; times in UTC
 * (Masayume) for DeepBookie's local time; "reads only" for DeepBookie's
 * "read-only" pill, because read-only already means archived here. Fetched
 * when the page opens instead of every 4 s.
 */

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; items: ConversationSummary[] };

export function History() {
  const { identity } = useAccount();
  const signedIn = identity.status === "signed-in";
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const t = useTranslations("pages.history");
  const translate = useTranslate();

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch("/api/conversations?summary=1", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`history ${res.status}`);
        const body = (await res.json()) as { conversations: ConversationSummary[] };
        setLoad({ status: "ready", items: body.conversations });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
  }, [signedIn, attempt]);

  if (identity.status === "loading") return <div aria-hidden className="min-h-[50vh]" />;
  if (!signedIn) return <SignInGate />;

  const items = load.status === "ready" ? load.items : [];

  return (
    <Page>
      <PageHeader title={t("title")} subtitle={historySubtitle(items, translate)} />
      {load.status === "loading" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-[124px] w-full rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : load.status === "error" ? (
        <Centered
          title={t("error.title")}
          body={t("error.body")}
          action={
            <button
              type="button"
              onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
              className={PRIMARY_BUTTON}
            >
              {t("error.retry")}
            </button>
          }
        />
      ) : items.length === 0 ? (
        <Centered
          title={t("empty.title")}
          body={t("empty.body")}
          action={
            <Link href="/app" className={PRIMARY_BUTTON}>
              {t("empty.openChat")} →
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ConversationCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </Page>
  );
}

function ConversationCard({ item }: { item: ConversationSummary }) {
  const t = useTranslations("pages.history.card");
  const chat = useTranslations("chat");
  return (
    <Link
      href={`/app/c/${item.id}`}
      className="group relative flex min-h-[124px] flex-col overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_24px_60px_-30px_oklch(0_0_0_/_70%)] focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span aria-hidden className="perforation pointer-events-none absolute inset-x-0 top-0" />
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[14px] leading-snug font-bold text-foreground">{item.title === NEW_CONVERSATION_TITLE ? chat("newConversation") : item.title}</span>
        {item.executed > 0 && <WaxSeal />}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <UtcTime ms={Date.parse(item.updatedAt)} withDate withSeconds={false} className="text-[10.5px] text-fg-muted" />
        {item.executed > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10.5px] font-semibold text-success">
            ✓ {t("executed", { count: item.executed })}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-fg-muted">
            {t("readsOnly")}
          </span>
        )}
      </div>
      <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-fg-muted transition group-hover:text-foreground">
        {t("open")} <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}

function WaxSeal() {
  const t = useTranslations("pages.history.card");
  return (
    <span
      aria-label={t("seal")}
      className="grid size-7 shrink-0 place-items-center rounded-full bg-success/12 text-success ring-1 ring-success/25"
    >
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
        <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
