"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { useSound } from "@/components/shell/sound-context";
import { cn } from "@/lib/utils";

import { Inset, Row } from "./parts";
import { ReceiptCard, ReceiptStamp } from "./receipt-card";
import type { RenderableError } from "./select-renderer.ts";

/*
 * Portaldot components/tools.tsx ErrorCard (destructive tone, VOID stamp, mono
 * message) carrying v1 components/cards/ErrorCard.tsx's content: the decoded
 * reason, field issues, and the reconnect door for an ended session or a
 * missing scope.
 *
 * v1 tells a boundary from a failure. A boundary (not available, paused, needs
 * access, check inputs) takes the pending tone and no stamp; only a failure is
 * VOID.
 */

type CardsTranslator = ReturnType<typeof useTranslations<"cards">>;

const BOUNDARY: Record<string, "notAvailable" | "paused" | "needsAccess" | "reconnect" | "checkInputs"> = {
  write_not_available: "notAvailable",
  quarantined: "notAvailable",
  rate_limited: "paused",
  insufficient_scope: "needsAccess",
  unauthorized: "reconnect",
  validation_failed: "checkInputs",
};

export function ErrorCard({ toolName, error }: { toolName: string; error: RenderableError }) {
  const t = useTranslations("cards");
  const { cue } = useSound();
  const boundaryKey = error.code !== undefined ? BOUNDARY[error.code] : undefined;
  const boundary = boundaryKey !== undefined ? t(`error.boundary.${boundaryKey}`) : undefined;

  // A boundary is a "not here, not now" and gets no sound. Only a real failure
  // is VOID, and only that has a voice.
  useEffect(() => {
    if (boundary === undefined) cue("void");
  }, [boundary, cue]);

  const reason = decodedReason(error);
  const reauth = reauthHref(error);
  return (
    <ReceiptCard
      toolName={toolName}
      metaRight={boundary ?? t("error.void")}
      tone={boundary ? "pending" : "destructive"}
      stamp={boundary ? undefined : <ReceiptStamp label={t("error.void")} tone="destructive" rotate={-8} />}
    >
      <p className="pr-20 text-[15px] font-medium text-foreground">{titleFor(toolName, t)}</p>
      <p
        className={cn(
          "mt-1 font-mono text-[13px] leading-relaxed [overflow-wrap:anywhere]",
          boundary ? "text-fg-secondary" : "text-destructive",
        )}
      >
        {error.message}
      </p>

      {reason !== undefined && (
        <Inset className="mt-3">
          <span className="font-mono text-[12px] text-fg-secondary [overflow-wrap:anywhere]">{reason}</span>
        </Inset>
      )}

      {error.issues !== undefined && error.issues.length > 0 && (
        <div className="mt-3 divide-y divide-border/60">
          {error.issues.map((issue, index) => (
            <Row
              key={`${issue.path}-${index}`}
              k={issue.path || t("error.field")}
              v={<span className="text-[13px] text-fg-secondary">{issue.message}</span>}
            />
          ))}
        </div>
      )}

      {reauth !== undefined && (
        <a
          href={reauth}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-[var(--lift-action)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {error.code === "unauthorized" ? t("error.connect") : t("error.reauthorize")}
        </a>
      )}

      {error.code === "rate_limited" && (
        <p className="mt-3 border-t border-border/60 pt-3 text-[12px] text-fg-muted">{t("error.rateLimited")}</p>
      )}
    </ReceiptCard>
  );
}

function titleFor(toolName: string, t: CardsTranslator): string {
  switch (toolName) {
    case "execute_protocol_action":
      return t("error.title.action");
    case "execute_contract_call":
      return t("error.title.contractCall");
    case "execute_transfer":
      return t("error.title.transfer");
    case "get_wallet_integration":
      return t("error.title.walletRead");
    case "search_actions":
      return t("error.title.search");
    default:
      return t("error.title.other");
  }
}

/* No scope-elevation endpoint exists: a fresh consent asks for the scope, so link to reauth, never plain login. */
function reauthHref(error: RenderableError): string | undefined {
  if (error.code === "unauthorized") return "/api/auth/reauth";
  if (error.scope !== undefined) {
    const scope = error.scope.requiredScope;
    return scope !== "" ? `/api/auth/reauth?scope=${encodeURIComponent(scope)}` : "/api/auth/reauth";
  }
  return undefined;
}

/** A decoded revert reason distinct from the top-line message. */
function decodedReason(error: RenderableError): string | undefined {
  if (error.code === "insufficient_scope") return undefined;
  const decoded = error.decoded;
  if (decoded === undefined || decoded === null) return undefined;
  if (typeof decoded === "string") {
    const trimmed = decoded.trim();
    return trimmed !== "" && trimmed !== error.message ? trimmed : undefined;
  }
  if (typeof decoded === "object") {
    const record = decoded as Record<string, unknown>;
    const candidate = record.reason ?? record.message;
    if (typeof candidate === "string" && candidate !== "" && candidate !== error.message) return candidate;
    let compact = "";
    try {
      compact = JSON.stringify(decoded) ?? "";
    } catch {
      compact = "";
    }
    return compact !== "" && compact !== "{}" && compact !== "[]" ? compact : undefined;
  }
  return String(decoded);
}
