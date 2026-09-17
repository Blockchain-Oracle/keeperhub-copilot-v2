"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useAccount } from "@/components/shell/account-context";
import { announceReceipt } from "@/components/shell/funding/receipt-announce";
import { canonicalJSON } from "@/lib/canonical-json";
import type { Translate } from "@/lib/i18n/translate";
import { useTranslate } from "@/lib/i18n/use-translate";
import { getOperationEntry, type EffectClass } from "@/lib/registry";
import { checkEditedWrite } from "@/lib/registry/edited-write";
import { cn } from "@/lib/utils";

import { isSimulatable, isWriteUnavailable, resolveProposedState } from "./card-state.ts";
import type { FieldError, FormValues } from "./editable.ts";
import { shortMiddle } from "./format.ts";
import { buildMoneyMoverView, effectClassLabel } from "./money-mover.ts";
import { Inset } from "./parts";
import { useSound } from "@/components/shell/sound-context";

import { ReceiptCard, ReceiptStamp } from "./receipt-card";
import { ShareReceipt } from "./share-receipt";
import {
  authorizeLabel,
  docNumber,
  receiptVerified,
  requestRows,
  toPreviewState,
  writeView,
  type PreviewState,
  type RequestRow,
  type WriteCeremony,
  type WritePhase,
} from "./write-card.ts";
import {
  DryRun,
  EditPanel,
  GHOST_BUTTON,
  InstructionRows,
  PRIMARY_BUTTON,
  TransferBody,
  TxInset,
  useChainLabel,
  WriteHeader,
} from "./write-card-parts";
import { buildEditedWrite, fieldErrorsFrom, writeFormFor } from "./write-form.ts";

/*
 * The write card: one component for a write's whole life, so what was
 * authorized stays on screen while it sends and after it lands.
 *
 * Portaldot components/tools.tsx TransferCard is the frame and the transfer's
 * body (from → to, QR, amount in the display face, Authorize and Cancel pills,
 * the tx inset under a stamp). DeepBookie components/widgets/SignReceipt.tsx is
 * the anatomy (kicker, status line, document number, the dimmed body and
 * spinner while it sends, the cancelled state) and ReceiptController's ref guard
 * against a double click; SwapCard's CTA ladder and its snapshot of the terms at
 * the click. v1 components/cards/WriteCard.tsx is the behaviour: the dry run
 * before Authorize, the acknowledgement for a predicted failure, "not sent" with
 * Try again when the answer did not reach the server, and the rows.
 *
 * Changes: Portaldot's PAID stamp at FINALIZED is replaced by EXECUTED once
 * KeeperHub has verified the receipt, and a cancel shows DeepBookie's cancelled
 * state (DECISIONS, consequences). Everything but the action is editable
 * (decision 11): Edit opens the fields, applying them prints a new document
 * number and runs the dry run again, and the route re-checks and re-signs what
 * is authorized. A card in a read-only chat has no buttons: "never authorized",
 * or "no receipt stored" if it was authorized but its receipt never reached the
 * chat. The first receipt for an org fires the welcome.
 */

export type WriteCardProps = {
  phase: WritePhase;
  toolName: string;
  opId?: string;
  toolCallId?: string;
  input: unknown;
  approvalId?: string;
  approved?: boolean;
  txHash?: string | null;
  receipt?: unknown;
  /** Absent in a read-only chat: no buttons, no dry run. */
  ceremony?: WriteCeremony;
  /** The chat's last post failed; a card that is sending was not sent. */
  resumeErrored?: boolean;
};

export function WriteCard({
  phase,
  toolName,
  opId,
  toolCallId,
  input,
  approvalId,
  approved,
  txHash,
  receipt,
  ceremony,
  resumeErrored = false,
}: WriteCardProps) {
  const { identity, refresh } = useAccount();
  const { cue } = useSound();
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const translate = useTranslate();
  const live = ceremony !== undefined;

  const [applied, setApplied] = useState<unknown>(input);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, FieldError>>({});
  const [formNote, setFormNote] = useState("");
  const [preview, setPreview] = useState<PreviewState>(() =>
    live && phase === "proposed" ? { status: "loading" } : { status: "no-preview" },
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [authorizedPreview, setAuthorizedPreview] = useState<PreviewState | null>(null);
  // Flips in the same tick as the click, so a double click cannot answer twice.
  const inFlight = useRef(false);
  const ackId = useId();

  // The instruction on the card: while proposed, whatever was last applied; after that, what the chat holds.
  const shown = phase === "proposed" ? applied : input;
  const argsKey = canonicalJSON(applied ?? null);
  const edited = argsKey !== canonicalJSON(input ?? null);
  const simulatable = isSimulatable(toolName, shown);
  const unavailable = isWriteUnavailable(toolName, shown);
  const resolved = resolveProposedState({ simulatable, unavailable, preview, edited });
  const awaiting = phase === "proposed" && live;
  const form = writeFormFor(toolName, applied, translate);

  // The dry run, once per applied instruction — and again when Try again asks
  // for it (`attempt`). A late answer for an older one is dropped.
  const simulate = phase === "proposed" ? ceremony?.simulate : undefined;
  const [attempt, setAttempt] = useState(0);
  const retryDryRun = useCallback(() => {
    setPreview({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);
  useEffect(() => {
    if (simulate === undefined) return;
    let active = true;
    simulate({ tool: toolName, args: JSON.parse(argsKey) as unknown, toolCallId })
      .then((result) => {
        if (active) setPreview(toPreviewState(result));
      })
      .catch(() => {
        if (active) setPreview({ status: "error", message: t("write.dryRunUnprepared") });
      });
    return () => {
      active = false;
    };
  }, [simulate, toolName, argsKey, toolCallId, attempt, t]);

  // A receipt that lands while this card watches: announce it (the first per org gets the welcome) and re-read the balance.
  const watchedOpen = useRef(phase !== "receipt");

  /*
   * Sound (slice 14). Two moments, both of them things that happened to you
   * rather than things you asked for:
   *
   *   - a write card arriving and waiting, which is a "stop and look";
   *   - that card settling into a receipt.
   *
   * Both fire once. A card that was already a receipt when this session found
   * it — an old conversation reopened — announces nothing, because nothing
   * happened. A write that failed is rendered by error-card rather than this
   * component, so reaching "receipt" here always means it landed; the VOID cue
   * lives over there.
   *
   * Declared here, above the early return further down, because hooks must be.
   */
  const announcedProposal = useRef(false);
  useEffect(() => {
    if (!awaiting || announcedProposal.current) return;
    announcedProposal.current = true;
    cue("card");
  }, [awaiting, cue]);

  const settled = useRef(phase === "receipt");
  useEffect(() => {
    if (phase !== "receipt" || settled.current) return;
    settled.current = true;
    cue("executed");
  }, [phase, cue]);

  const announced = useRef(false);
  const orgId = identity.status === "signed-in" ? identity.orgId : undefined;
  useEffect(() => {
    if (phase !== "receipt" || !watchedOpen.current || announced.current || orgId === undefined) return;
    announced.current = true;
    announceReceipt(orgId, opId ?? toolName, txHash ?? null);
    refresh();
  }, [phase, orgId, opId, toolName, txHash, refresh]);

  const entry = opId !== undefined ? getOperationEntry(opId) : undefined;
  const record = asRecord(shown);
  const chainId = chainOf(toolName, record);
  const chain = useChainLabel(chainId);
  const transfer = toolName === "execute_transfer" ? transferParts(record, chain.symbol, translate) : undefined;
  const moneyMover = buildMoneyMoverView(toolName, shown, translate);
  const rows: RequestRow[] =
    transfer !== undefined
      ? transferRows(record, translate)
      : moneyMover !== undefined
        ? [...networkRow(record, translate), ...moneyMover.rows]
        : requestRows(toolName, shown, new Set(entry?.fields.map((field) => field.key)), translate);
  const labelFor = (row: RequestRow) =>
    row.key === "chain_id" || row.key === "network"
      ? t("labels.network")
      : (entry?.fields.find((field) => field.key === row.key)?.label ?? row.label);
  const title = transfer?.title ?? titleFor(toolName, record, entry?.label, translate);
  const kicker = kickerFor(toolName, record, entry?.effectClass, translate);
  const doc = docNumber(toolName, shown);
  const view = writeView(
    {
      phase,
      approved,
      live,
      resumeErrored,
      unavailable,
      needsCredential: resolved.key === "needs-credential",
      submitted,
      edited,
    },
    translate,
  );

  const canAuthorize =
    awaiting &&
    approvalId !== undefined &&
    !submitted &&
    !editing &&
    resolved.canConfirm &&
    (!resolved.needsRevertAck || acknowledged);

  function startEditing() {
    if (form === null) return;
    setValues(form.seed);
    setErrors({});
    setFormNote("");
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setErrors({});
    setFormNote("");
  }

  function changeField(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!Object.hasOwn(current, key)) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
    setFormNote("");
  }

  function applyEdits() {
    if (form === null) return;
    const next = buildEditedWrite(toolName, input, form, values);
    const check = checkEditedWrite(toolName, input, next, translate);
    if (!check.ok) {
      const mapped = fieldErrorsFrom(check.issues, form);
      setErrors(mapped.byField);
      setFormNote(mapped.other.join(" "));
      return;
    }
    stopEditing();
    if (canonicalJSON(next) === argsKey) return;
    setApplied(next);
    setAcknowledged(false);
    setPreview({ status: "loading" });
  }

  async function authorize() {
    if (!canAuthorize || inFlight.current || ceremony === undefined || approvalId === undefined) return;
    cue("authorize");
    inFlight.current = true;
    setSubmitted(true);
    setAuthorizedPreview(preview);
    try {
      await ceremony.confirm(approvalId, edited ? applied : undefined);
    } catch {
      inFlight.current = false;
      setSubmitted(false);
      setAuthorizedPreview(null);
    }
  }

  async function cancel() {
    if (!awaiting || inFlight.current || ceremony === undefined || approvalId === undefined) return;
    cue("cancel");
    inFlight.current = true;
    setSubmitted(true);
    try {
      await ceremony.decline(approvalId);
    } catch {
      inFlight.current = false;
      setSubmitted(false);
    }
  }

  function retry() {
    if (approvalId === undefined || approved === undefined) return;
    void ceremony?.retry?.(approvalId, approved);
  }

  if (phase === "declined") {
    return (
      <ReceiptCard toolName={opId ?? toolName} metaRight={view.meta} className="opacity-90">
        <WriteHeader kicker={kicker} status={view.status} doc={doc} ink="muted" />
        <p className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-fg-muted line-through [overflow-wrap:anywhere]">
          {title}
        </p>
        <p className="mt-2 text-xs text-fg-muted">{t("write.declined")}</p>
      </ReceiptCard>
    );
  }

  const sending = phase === "executing" && live && !resumeErrored && approved !== false;
  const stamped = phase === "receipt";

  return (
    <ReceiptCard
      toolName={opId ?? toolName}
      metaRight={view.meta}
      tone={view.tone}
      stamp={stamped ? <ReceiptStamp label={t("write.meta.executed")} tone="success" /> : undefined}
    >
      <WriteHeader
        kicker={kicker}
        status={view.status}
        doc={doc}
        ink={stamped ? "success" : live ? "default" : "muted"}
        stamped={stamped}
      />
      <p className="mt-3 text-[17px] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">{title}</p>

      {editing && form !== null ? (
        <EditPanel
          fields={form.fields}
          values={values}
          errors={errors}
          note={formNote}
          applyLabel={simulatable ? t("write.applyDryRun") : t("write.applyValues")}
          onChange={changeField}
          onApply={applyEdits}
          onDiscard={stopEditing}
        />
      ) : (
        <div className={cn("mt-3 transition-opacity", sending && "opacity-60")}>
          {transfer !== undefined && (
            <TransferBody
              from={identity.status === "signed-in" ? identity.walletAddress : null}
              to={transfer.to}
              amount={transfer.amount}
              unit={transfer.unit}
              showQr={phase !== "receipt"}
            />
          )}
          <div className={cn(transfer !== undefined && "mt-3")}>
            <InstructionRows rows={rows} labelFor={labelFor} />
          </div>
        </div>
      )}

      {moneyMover?.warning !== undefined && (
        <Inset className="mt-3 border-pending/40">
          <p className="text-[13px] font-medium text-pending">{moneyMover.warning}</p>
        </Inset>
      )}

      {awaiting && !editing && (
        <DryRun
          simulatable={simulatable}
          unavailable={unavailable}
          preview={preview}
          onRetry={simulate !== undefined ? retryDryRun : undefined}
          acknowledgement={
            resolved.needsRevertAck ? (
              <label htmlFor={ackId} className="mt-2 flex items-start gap-2 text-[12.5px] text-foreground">
                <input
                  id={ackId}
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={submitted}
                  className="mt-0.5 size-4 accent-[var(--destructive)]"
                />
                <span>{t("write.acknowledge")}</span>
              </label>
            ) : undefined
          }
        />
      )}
      {phase !== "proposed" && authorizedPreview?.status === "simulated" && (
        <DryRun simulatable unavailable={false} preview={authorizedPreview} />
      )}

      {sending && (
        <div role="status" className="mt-4 flex items-center justify-center gap-3 py-2">
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-muted" />
          <span className="text-[13px] font-medium text-fg-secondary">{t("write.status.sending")}</span>
        </div>
      )}
      {phase === "executing" && live && resumeErrored && (
        <div className="mt-4">
          <p role="status" className="text-[13px] text-foreground">
            {t("write.notReached")}
          </p>
          {ceremony?.retry !== undefined && approvalId !== undefined && approved !== undefined && (
            <button type="button" onClick={retry} className={cn(PRIMARY_BUTTON, "mt-3")}>
              {tc("tryAgain")}
            </button>
          )}
        </div>
      )}
      {phase === "executing" && !live && approved !== false && (
        <p className="mt-3 text-[12.5px] text-fg-muted">{t("write.receiptMissing")}</p>
      )}
      {phase === "proposed" && !live && (
        <p className="mt-3 text-[12.5px] text-fg-muted">{t("write.archived")}</p>
      )}

      {phase === "receipt" && <TxInset txHash={txHash ?? null} chainId={chainId} verified={receiptVerified(receipt)} />}
      {phase === "receipt" && toolCallId !== undefined && typeof txHash === "string" && txHash !== "" && (
        <div className="mt-3 flex justify-end">
          <ShareReceipt toolCallId={toolCallId} />
        </div>
      )}

      {awaiting && !editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void authorize()} disabled={!canAuthorize} className={PRIMARY_BUTTON}>
            {submitted ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            {authorizeLabel(
              {
                submitted,
                unavailable,
                needsCredential: resolved.key === "needs-credential",
                simulatable,
                preview: preview.status,
                needsAck: resolved.needsRevertAck,
                acknowledged,
              },
              translate,
            )}
          </button>
          {form !== null && !unavailable && (
            <button type="button" onClick={startEditing} disabled={submitted} className={GHOST_BUTTON}>
              {t("write.edit")}
            </button>
          )}
          <button type="button" onClick={() => void cancel()} disabled={submitted} className={GHOST_BUTTON}>
            {tc("cancel")}
          </button>
        </div>
      )}
    </ReceiptCard>
  );
}

function transferParts(record: Record<string, unknown>, nativeSymbol: string, t: Translate) {
  const amount = str(record.amount) ?? "";
  const token = str(record.token_address);
  const unit = token !== undefined ? shortMiddle(token) : nativeSymbol;
  return { title: t("cards.write.title.send", { amount, unit }).trim(), amount, unit, to: str(record.to_address) ?? "" };
}

function transferRows(record: Record<string, unknown>, t: Translate): RequestRow[] {
  const token = str(record.token_address);
  return [
    ...networkRow(record, t),
    ...(token !== undefined
      ? [{ key: "token_address", label: t("cards.labels.token"), value: token, display: { kind: "address" as const } }]
      : []),
  ];
}

function networkRow(record: Record<string, unknown>, t: Translate): RequestRow[] {
  const chainId = str(record.chain_id);
  return chainId !== undefined ? [{ key: "chain_id", label: t("cards.labels.network"), value: chainId }] : [];
}

function chainOf(toolName: string, record: Record<string, unknown>): string | undefined {
  if (toolName === "execute_protocol_action") return str(asRecord(record.params).network);
  return str(record.chain_id);
}

function titleFor(toolName: string, record: Record<string, unknown>, label: string | undefined, t: Translate): string {
  if (toolName === "execute_contract_call") {
    if (record.function_name === "approve") return t("cards.write.title.approve");
    const fn = str(record.function_name);
    return fn !== undefined ? t("cards.write.title.call", { name: fn }) : t("cards.write.verb.contractWrite");
  }
  return label ?? t("cards.write.verb.write");
}

function kickerFor(
  toolName: string,
  record: Record<string, unknown>,
  effectClass: EffectClass | undefined,
  t: Translate,
): string {
  if (toolName === "execute_transfer") return t("cards.write.kicker.valueMoving");
  if (toolName === "execute_contract_call") {
    return record.function_name === "approve" ? t("cards.write.kicker.authorizationGrant") : t("cards.write.verb.contractWrite");
  }
  return effectClass !== undefined ? effectClassLabel(effectClass, t) : t("cards.write.verb.write");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
