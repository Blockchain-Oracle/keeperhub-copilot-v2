"use client";

import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { AddressQR } from "@/components/data/address-qr";
import { CopyChip } from "@/components/data/copy-chip";
import { ExplorerLink } from "@/components/data/explorer-link";
import { Identicon } from "@/components/data/identicon";
import { ChainMark } from "@/components/data/marks";
import { usePlatformChains } from "@/components/shell/use-platform-chains";
import { explorerTxUrl, getChain } from "@/lib/chains";
import { useErrorMessage, useTranslate } from "@/lib/i18n/use-translate";
import type { FieldSpec } from "@/lib/registry";
import { cn } from "@/lib/utils";

import { isFieldVisible, type FieldError, type FormValues } from "./editable.ts";
import { FieldEditor } from "./fields/field-editor";
import { NetworkField } from "./fields/network-field";
import { Display, Inset, Label, Mono, ResultValue, Row } from "./parts";
import { dryRunFacts, writeUnavailableStatement, type PreviewState, type RequestRow } from "./write-card.ts";

/*
 * The write card's drawn pieces. The header is DeepBookie SignReceipt's
 * (kicker, status line, document number); the transfer body, the amount inset,
 * the tx inset and the buttons are Portaldot TransferCard's; the dry run is
 * v1 WriteCard's PreviewInset in Portaldot's success and destructive insets.
 */

export const PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-[0_10px_30px_-12px_oklch(0.66_0.22_288_/_70%)] transition-[transform,filter] hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

export const GHOST_BUTTON =
  "rounded-full border border-border px-4 py-1.5 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-40";

// The dry run route's own refusals, shown in the person's language; KeeperHub's reasons stay as written.
const ROUTE_CODES: ReadonlySet<string> = new Set(["unauthorized", "server_error", "bad_request"]);

/** A network's name and native symbol, from KeeperHub's live list when it has answered. */
export function useChainLabel(chainId: string | undefined): { name: string; symbol: string; explorerUrl: string | null } {
  const chains = usePlatformChains();
  const liveChain =
    chains.status === "ready" && chainId !== undefined ? chains.chains.find((chain) => chain.chainId === chainId) : undefined;
  const known = getChain(chainId);
  return {
    name: liveChain?.name ?? known.name,
    symbol: liveChain?.symbol ?? known.nativeSymbol,
    explorerUrl: liveChain?.explorerUrl ?? null,
  };
}

export function WriteHeader({
  kicker,
  status,
  doc,
  ink,
  stamped = false,
}: {
  kicker: string;
  status: string;
  doc: string;
  ink: "default" | "success" | "muted";
  stamped?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", stamped && "pr-28")}>
      <div className="min-w-0">
        <div
          className={cn(
            "font-mono text-[10px] tracking-[0.18em] uppercase",
            ink === "success" ? "text-success" : ink === "muted" ? "text-fg-muted" : "text-foreground",
          )}
        >
          {kicker}
        </div>
        <div className="mt-0.5 text-[11.5px] text-fg-muted">{status}</div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-fg-muted tabular-nums">{doc}</span>
    </div>
  );
}

/* Portaldot TransferCard: from → to with the recipient's QR, then the amount in the display face. */
export function TransferBody({
  from,
  to,
  amount,
  unit,
  showQr,
}: {
  from: string | null;
  to: string;
  amount: string;
  unit: string;
  showQr: boolean;
}) {
  const t = useTranslations("cards");
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("write.transfer.from")}</span>
            {from !== null ? (
              <span className="inline-flex items-center gap-1.5">
                <Identicon address={from} size={16} />
                <CopyChip value={from} />
              </span>
            ) : (
              <span className="font-mono text-[12px] text-fg-muted">{t("write.transfer.orgWallet")}</span>
            )}
          </div>
          <div className="pl-1 text-fg-muted">
            <ArrowDown className="size-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("write.transfer.to")}</span>
            {to !== "" && (
              <span className="inline-flex items-center gap-1.5">
                <Identicon address={to} size={16} />
                <CopyChip value={to} />
              </span>
            )}
          </div>
        </div>
        {showQr && to !== "" && (
          <div className="self-start sm:self-center">
            <AddressQR value={to} size={56} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
        <div className="font-mono text-[10px] tracking-[0.18em] text-fg-muted uppercase">{t("write.transfer.amount")}</div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
          <Display className="text-[36px] leading-none [overflow-wrap:anywhere]">{amount}</Display>
          <Mono className="text-sm text-fg-muted">{unit}</Mono>
        </div>
      </div>
    </div>
  );
}

export function InstructionRows({ rows, labelFor }: { rows: RequestRow[]; labelFor: (row: RequestRow) => string }) {
  if (rows.length === 0) return null;
  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => (
        <Row key={row.key} k={labelFor(row)} v={<RequestValue row={row} />} />
      ))}
    </div>
  );
}

function RequestValue({ row }: { row: RequestRow }) {
  if ((row.key === "chain_id" || row.key === "network") && typeof row.value === "string") {
    return <NetworkName chainId={row.value} />;
  }
  const display = row.display;
  if (display?.kind === "amount") {
    return (
      <span>
        <Mono>{display.human}</Mono>
        {display.unit !== undefined && <span className="ml-1 font-mono text-xs text-fg-muted">{display.unit}</span>}
      </span>
    );
  }
  if (display?.kind === "address" && typeof row.value === "string") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Identicon address={row.value} size={14} />
        <CopyChip value={row.value} />
      </span>
    );
  }
  return <ResultValue value={row.value} />;
}

export function NetworkName({ chainId }: { chainId: string }) {
  const { name } = useChainLabel(chainId);
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChainMark chainId={chainId} name={name} size={14} />
      {name}
    </span>
  );
}

export function DryRun({
  simulatable,
  unavailable,
  preview,
  acknowledgement,
}: {
  simulatable: boolean;
  unavailable: boolean;
  preview: PreviewState;
  acknowledgement?: ReactNode;
}) {
  const t = useTranslations("cards");
  const translate = useTranslate();
  const errorMessage = useErrorMessage();
  if (unavailable) return <p className="mt-3 text-[12.5px] text-fg-secondary">{writeUnavailableStatement(translate)}</p>;
  if (preview.status === "needs-credential") {
    return (
      <Inset className="mt-3">
        <p className="text-[13px] text-fg-secondary">{preview.message}</p>
      </Inset>
    );
  }
  if (!simulatable) {
    return <p className="mt-3 text-[12.5px] text-fg-muted">{t("write.dryRun.cannot")}</p>;
  }
  if (preview.status === "loading") {
    return (
      <p role="status" className="mt-3 font-mono text-[11px] tracking-[0.18em] text-fg-muted uppercase">
        —— {t("write.dryRun.running")} ——
      </p>
    );
  }
  if (preview.status === "error") {
    return (
      <Inset className="mt-3">
        <Label>{t("write.dryRun.label")}</Label>
        <p className="mt-1 font-mono text-[12px] text-fg-secondary [overflow-wrap:anywhere]">
          {preview.code !== undefined && ROUTE_CODES.has(preview.code)
            ? errorMessage(preview.code, preview.message)
            : preview.message}
        </p>
      </Inset>
    );
  }
  if (preview.status !== "simulated") return null;
  if (preview.wouldRevert) {
    return (
      <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
        <Label>{t("write.dryRun.label")}</Label>
        <p className="mt-1 text-[13px] font-medium text-destructive">{t("write.dryRun.wouldNotSucceed")}</p>
        <p className="mt-0.5 font-mono text-[12px] text-fg-secondary [overflow-wrap:anywhere]">
          {preview.revertReason ?? t("write.dryRun.wouldRevert")}
        </p>
        {acknowledgement}
      </div>
    );
  }
  const facts = dryRunFacts(preview.preview, translate);
  return (
    <div className="mt-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{t("write.dryRun.label")}</Label>
        <span className="font-mono text-[10px] tracking-[0.18em] text-success uppercase">{t("write.dryRun.wouldSucceed")}</span>
      </div>
      {facts.length > 0 && (
        <div className="mt-1 divide-y divide-border/60">
          {facts.map((fact) => (
            <Row key={fact.label} k={fact.label} v={<Mono className="text-[13px]">{fact.value}</Mono>} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EditPanel({
  fields,
  values,
  errors,
  note,
  applyLabel,
  onChange,
  onApply,
  onDiscard,
}: {
  fields: FieldSpec[];
  values: FormValues;
  errors: Record<string, FieldError>;
  note: string;
  applyLabel: string;
  onChange: (key: string, value: unknown) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("cards");
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2/40 px-3">
      <div className="divide-y divide-border/60">
        {fields
          .filter((field) => isFieldVisible(field, values))
          .map((field) =>
            field.type === "chain-select" && (field.options?.length ?? 0) === 0 ? (
              <NetworkField
                key={field.key}
                spec={field}
                value={values[field.key]}
                onChange={(value) => onChange(field.key, value)}
                error={errors[field.key]}
              />
            ) : (
              <FieldEditor
                key={field.key}
                spec={field}
                value={values[field.key]}
                onChange={(value) => onChange(field.key, value)}
                error={errors[field.key]}
              />
            ),
          )}
      </div>
      {note !== "" && (
        <p role="status" className="pb-1 text-[12px] font-medium text-destructive">
          {note}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border/60 py-2.5">
        <button type="button" onClick={onApply} className={PRIMARY_BUTTON}>
          {applyLabel}
        </button>
        <button type="button" onClick={onDiscard} className={GHOST_BUTTON}>
          {t("write.discard")}
        </button>
      </div>
    </div>
  );
}

/* Portaldot TransferCard's confirmed inset: the hash to copy and the explorer. */
export function TxInset({
  txHash,
  chainId,
  verified,
}: {
  txHash: string | null;
  chainId: string | undefined;
  verified: boolean | undefined;
}) {
  const t = useTranslations("cards");
  const { explorerUrl } = useChainLabel(chainId);
  const link =
    txHash === null || chainId === undefined
      ? null
      : (explorerTxUrl(chainId, txHash) ?? (explorerUrl !== null ? `${explorerUrl.replace(/\/$/, "")}/tx/${txHash}` : null));
  return (
    <div className="mt-4 space-y-1 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
      <Row
        k={t("write.tx.label")}
        v={
          txHash !== null ? (
            <span className="inline-flex items-center gap-2">
              <CopyChip value={txHash} />
              {link !== null && <ExplorerLink href={link} label={t("write.tx.explorer")} />}
            </span>
          ) : (
            <span className="text-fg-muted">—</span>
          )
        }
      />
      {verified !== undefined && (
        <Row k={t("write.tx.verified")} v={<Mono>{verified ? t("write.tx.yes") : t("write.tx.no")}</Mono>} />
      )}
    </div>
  );
}
