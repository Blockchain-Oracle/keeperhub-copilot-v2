"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeeperHubMark } from "@/components/ui/keeperhub-mark";
import { cn } from "@/lib/utils";

import { usePlatformChains } from "../use-platform-chains";
import { draftFromSearch, stashDraft } from "./pending-draft";

/*
 * The sign-in modal. Shell and rows are Portaldot's components/wallet-picker.tsx
 * inside the Masayume modal grammar already in ui/dialog: meta eyebrow, display
 * title, perforation, one row per way in, an error box, a perforated footer
 * strip. One provider owns it so every Connect in the app opens the same modal.
 *
 * Changes: there is one way in, "Continue with KeeperHub" (an outside app signs
 * in with KeeperHub OAuth; no browser wallet exists here), so no detection loop
 * and no install rows. The row's status line is KeeperHub's reachability from
 * its live network list, where Portaldot shows a detected extension. Continuing
 * carries any unsent question through the redirect, and a return from KeeperHub
 * with an error reopens the modal saying what happened.
 */

const LOGIN_PATH = "/api/auth/login";
const CONNECT_PARAM = "connect";

type ReturnError = "denied" | "failed";

type SignInContextValue = {
  /** Opens the modal. `draft` is a question to carry through sign-in (the chat composer passes its text). */
  openSignIn: (draft?: string) => void;
  /** True from "Continue" until the browser leaves for KeeperHub. */
  connecting: boolean;
};

const SignInContext = createContext<SignInContextValue | null>(null);

export function SignInProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<ReturnError | null>(null);
  const t = useTranslations("shell");
  const [connecting, setConnecting] = useState(false);

  const openSignIn = useCallback((nextDraft?: string) => {
    setDraft(nextDraft?.trim() ? nextDraft : null);
    setError(null);
    setOpen(true);
  }, []);

  const continueWithKeeperHub = useCallback(() => {
    const text = draft ?? draftFromSearch(window.location.search);
    if (text) {
      try {
        stashDraft(window.sessionStorage, text);
      } catch {
        // sessionStorage itself refused: sign in anyway, without the question
      }
    }
    setConnecting(true);
    // A full page load on purpose: the login route is an API redirect to KeeperHub, not a page.
    window.location.assign(new URL(LOGIN_PATH, window.location.origin).href);
  }, [draft]);

  // Back from KeeperHub via the back button restores this page from cache mid-"Connecting…".
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setConnecting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // The OAuth callback lands on /app?connect=denied|failed when sign-in did not finish.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get(CONNECT_PARAM);
    if (reason !== "denied" && reason !== "failed") return;
    const show = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete(CONNECT_PARAM);
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
      setError(reason);
      setOpen(true);
    }, 0);
    return () => clearTimeout(show);
  }, []);

  const value = useMemo(() => ({ openSignIn, connecting }), [openSignIn, connecting]);

  return (
    <SignInContext value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogEyebrow>{t("signIn.eyebrow")}</DialogEyebrow>
            <DialogTitle className="mt-3">{t("connect.connect")}</DialogTitle>
            <DialogDescription>{t("signIn.description")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="gap-0 pb-7">
            <div className="perforation mb-4" />

            <button
              type="button"
              disabled={connecting}
              onClick={continueWithKeeperHub}
              className={cn(
                "group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-2/60 p-3 text-left transition-all",
                "hover:-translate-y-px hover:border-border-strong hover:bg-surface-2 hover:shadow-[var(--lift-action)]",
                "focus-visible:outline-2 focus-visible:outline-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <KeeperHubMark className="h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-foreground">{t("signIn.continueWithKeeperHub")}</span>
                  <span className="rounded-full border border-telemetry/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.16em] text-telemetry">
                    OAuth
                  </span>
                </div>
                <PlatformStatus />
              </div>
              {connecting ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  {t("signIn.continueHint")}
                </span>
              )}
            </button>

            {error && (
              <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {t(`signIn.errors.${error}`)}
              </p>
            )}

            <div className="perforation my-4" />

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3 text-primary" />
                {t("signIn.footer")}
              </span>
              <span>mcp:read · mcp:write</span>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </SignInContext>
  );
}

/** Portaldot's "detected" line, reporting whether KeeperHub answered just now. */
function PlatformStatus() {
  const chains = usePlatformChains();
  const t = useTranslations("shell.signIn.status");
  const [label, dot, ink] =
    chains.status === "ready"
      ? [t("online"), "bg-success", "text-success"]
      : chains.status === "error"
        ? [t("unreachable"), "bg-pending", "text-pending"]
        : [t("checking"), "bg-fg-muted/60", "text-fg-muted"];
  return (
    <div className={cn("mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]", ink)}>
      <span aria-hidden className={cn("size-1 rounded-full", dot)} />
      {label}
    </div>
  );
}

export function useSignIn(): SignInContextValue {
  const value = useContext(SignInContext);
  if (!value) throw new Error("useSignIn must be used inside SignInProvider");
  return value;
}
