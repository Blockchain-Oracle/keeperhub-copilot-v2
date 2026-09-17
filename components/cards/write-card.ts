/*
 * The generic write card's PURE logic (Story 2.3), kept JSX-free so it is unit
 * tested directly in node (tests/cards/write-card.test.ts) — the same split as
 * editable.ts ↔ GenericReadCard.tsx. WriteCard.tsx is the thin React shell over
 * these: it maps the simulate result to a preview state, derives the state chip,
 * extracts the human-facing request rows, and reads the verified flag.
 */

import type { AutomationPreview } from "@/lib/automations/shape";
import { canonicalJSON } from "@/lib/canonical-json";
import type { InputAnswer } from "@/lib/chat/input-request";
import { englishTranslate, type Translate } from "@/lib/i18n/translate";

/** The write card's four ceremony phases, derived from the persisted part state. */
export type WritePhase = "proposed" | "executing" | "receipt" | "declined";

/** The JSON the simulate endpoint returns (AC 1/2). */
export type SimulateResult =
  | { ok: true; kind: "simulated"; preview: unknown }
  | { ok: true; kind: "no-preview" }
  | { ok: true; kind: "needs-credential"; integration: string; message: string }
  | { ok: false; error: { code?: string; message: string; decoded?: unknown } };

/** The ceremony callbacks the conversation threads down (approval + dry-run). */
export type WriteCeremony = {
  /** Confirm the write. Story 2.5 (Task 4): an in-card amount edit passes the
   *  EDITED input, which the server validates + re-signs so the confirmed quote is
   *  what executes; a plain confirm omits it (the stored proposal stands). */
  confirm: (approvalId: string, editedInput?: unknown) => void | Promise<void>;
  decline: (approvalId: string) => void | Promise<void>;
  simulate: (req: {
    tool: string;
    args: unknown;
    toolCallId?: string;
  }) => Promise<SimulateResult>;
  /** Re-affirm a decision whose resume POST failed (review P6): clears the chat
   *  error and re-sends the same approval so the ceremony resumes rather than
   *  leaving the card stuck. Absent → the errored executing card is read-only. */
  retry?: (approvalId: string, approved: boolean) => void | Promise<void>;
  /** A saved automation's follow-ups on its card (decision 19). Absent in a read-only chat. */
  automation?: AutomationCeremony;
  /** Answer a form card, or send its answer again after a failed post (decision 32). */
  answer?: (toolCallId: string, answer: InputAnswer) => void;
};

export type AutomationCheckResult =
  | { ok: true; enabled: boolean; preview: AutomationPreview }
  | { ok: false; message: string };

export type AutomationSwitchResult = { ok: true; enabled: boolean } | { ok: false; message: string };

/** Where a run started from the chat stands, from its ledger row; null when it could not be read this time. */
export type AutomationRunStatus = { state: "pending" | "receipt" | "failure"; txHash: string | null };

export type AutomationCeremony = {
  /** KeeperHub's check and dry run for turning a saved automation on, and whether it already is. */
  check: (workflowId: string) => Promise<AutomationCheckResult>;
  setEnabled: (workflowId: string, enabled: boolean) => Promise<AutomationSwitchResult>;
  runStatus: (ledgerId: string) => Promise<AutomationRunStatus | null>;
};

/** The card-local preview state, resolved from the simulate result. */
export type PreviewState =
  | { status: "loading" }
  | { status: "simulated"; preview: unknown; wouldRevert: boolean; revertReason?: string }
  | { status: "no-preview" }
  | { status: "needs-credential"; message: string }
  | { status: "error"; message: string; code?: string };

/** Bespoke money-mover presentation for a row (Story 2.5, D27): render it as a
 *  decimals-aware amount (mono + tabular, unit in ink-2) or a named/truncated
 *  address, instead of the generic scalar. Absent → the generic DataValue. */
export type RowDisplay =
  | { kind: "amount"; human: string; unit?: string }
  | { kind: "address"; name?: string }
  | { kind: "text" };

export type RequestRow = { key: string; label: string; value: unknown; display?: RowDisplay };

// The verbatim no-preview statement (EXPERIENCE.md:75). Copy law: sentence case,
// periods, no em-dash, no exclamation.
export function noPreviewStatement(t: Translate = englishTranslate): string {
  return t("cards.write.noPreview");
}

export const NO_PREVIEW_STATEMENT = noPreviewStatement();

// The verbatim write-unavailable statement (mirrors lib/execution's Solana refusal,
// EXPERIENCE.md copy law: sentence case, periods, no em-dash, no exclamation). Shown
// on a card the server refuses this release, with Confirm disabled — never a
// confirmable dead-end.
export function writeUnavailableStatement(t: Translate = englishTranslate): string {
  return t("cards.write.unavailable");
}

export const WRITE_UNAVAILABLE_STATEMENT = writeUnavailableStatement();

/** Map a simulate endpoint result onto the card's preview state. */
export function toPreviewState(result: SimulateResult): PreviewState {
  if (result.ok === false) {
    // A dry-run that DECODES a would-fail reason (an unaffordable transfer's
    // nativeShortfallFailure carries `revertReason`) is a PREDICTED revert, not a
    // preview-infrastructure failure: surface it as `wouldRevert` so the person sees
    // "This would not succeed. <reason>" + the revert-ack, and may confirm through
    // (D1 / D29 / AC3). A transport/throttle error (no decoded reason) stays a plain
    // error with Confirm disabled — never confirm the un-previewable.
    const revertReason = predictedRevertReason(result.error);
    if (revertReason !== undefined) {
      return {
        status: "simulated",
        preview: result.error.decoded ?? {},
        wouldRevert: true,
        revertReason,
      };
    }
    const code = result.error.code;
    return { status: "error", message: result.error.message, ...(code !== undefined ? { code } : {}) };
  }
  if (result.kind === "simulated") {
    const record =
      result.preview !== null && typeof result.preview === "object"
        ? (result.preview as Record<string, unknown>)
        : {};
    const wouldRevert = record.wouldRevert === true;
    const revertReason =
      typeof record.revertReason === "string" ? record.revertReason : undefined;
    return { status: "simulated", preview: result.preview, wouldRevert, revertReason };
  }
  if (result.kind === "needs-credential") {
    return { status: "needs-credential", message: result.message };
  }
  return { status: "no-preview" };
}

/** The decoded revert reason of a simulate ERROR that is really a predicted tx
 *  failure (a `revertReason` on the decoded payload — e.g. the transfer route's
 *  nativeShortfallFailure), or undefined for a preview-infrastructure error. */
function predictedRevertReason(error: {
  code?: string;
  message: string;
  decoded?: unknown;
}): string | undefined {
  const decoded = error.decoded;
  if (decoded !== null && typeof decoded === "object") {
    const reason = (decoded as { revertReason?: unknown }).revertReason;
    if (typeof reason === "string" && reason.trim() !== "") {
      return reason;
    }
  }
  return undefined;
}

/**
 * Whether Confirm is possible in this preview state (AC 1 "before confirm is
 * possible"): a simulated or no-preview verdict enables it; loading /
 * needs-credential / error keep it disabled so nobody confirms what could not be
 * previewed or set up.
 */
export function confirmAllowed(preview: PreviewState): boolean {
  return preview.status === "simulated" || preview.status === "no-preview";
}

/**
 * A predicted revert requires an explicit acknowledgement before Confirm arms
 * (D1 review resolution): the user opts into broadcasting a transaction the
 * platform expects to fail, spending gas on it. A clean simulation or a
 * no-preview write needs no acknowledgement.
 */
export function requiresRevertAck(preview: PreviewState): boolean {
  return preview.status === "simulated" && preview.wouldRevert;
}

/** The proposed card's state chip label, derived from the preview verdict. */
export function proposedChip(preview: PreviewState, t: Translate = englishTranslate): string {
  switch (preview.status) {
    case "simulated":
      return t("cards.write.chip.simulated");
    case "no-preview":
      return t("cards.write.chip.noPreview");
    case "needs-credential":
      return t("cards.write.chip.needsCredential");
    default:
      return t("cards.write.chip.proposed");
  }
}

/** The meaningful, human-facing fields of a write proposal — never the internal
 *  hints (stateMutability) or card-only data (alternatives). A protocol action's
 *  `_` parameters are hidden passthroughs unless named in `fieldKeys`: some real
 *  fields start with an underscore (lido/wrap's _stETHAmount). */
export function requestRows(
  toolName: string,
  input: unknown,
  fieldKeys?: ReadonlySet<string>,
  t: Translate = englishTranslate,
): RequestRow[] {
  if (input === null || typeof input !== "object") {
    return [];
  }
  const record = input as Record<string, unknown>;
  if (toolName === "execute_protocol_action") {
    const params = record.params;
    if (params === null || typeof params !== "object") {
      return [];
    }
    return Object.entries(params as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_") || fieldKeys?.has(key) === true)
      .map(([key, value]) => ({ key, label: humanizeKey(key), value }));
  }
  if (toolName === "execute_contract_call") {
    const keys = [
      "chain_id",
      "contract_address",
      "function_name",
      "function_args",
      "value",
      "gas_limit_multiplier",
      "priority_fee_gwei",
    ];
    return keys
      .filter((key) => record[key] !== undefined && record[key] !== "")
      .map((key) => ({ key, label: t(`cards.labels.${CONTRACT_CALL_LABELS[key]}`), value: record[key] }));
  }
  return [];
}

// The label keys for a contract call's tx-path fields.
const CONTRACT_CALL_LABELS: Record<string, string> = {
  chain_id: "chainId",
  contract_address: "contractAddress",
  function_name: "functionName",
  function_args: "functionArgs",
  value: "value",
  gas_limit_multiplier: "gasLimitMultiplier",
  priority_fee_gwei: "priorityFeeGwei",
};

/**
 * DeepBookie's document number (lib/format.ts docNumberFor), taken from the
 * instruction instead of the call id: FNV-1a over the tool and its canonical
 * input, so any edit prints a new number and the receipt carries the one that
 * was authorized.
 */
export function docNumber(toolName: string, input: unknown): string {
  const text = `${toolName}:${canonicalJSON(input)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const hex = hash.toString(16).toUpperCase().padStart(8, "0");
  return `KH·${hex.slice(0, 4)}·${hex.slice(4)}`;
}

/**
 * The dry run's facts worth a row, from KeeperHub's simulate result
 * (references/keeperhub-fork lib/execute/simulate.ts SimulateSuccess): the gas
 * estimate and whatever the call would return. Other shapes give no rows.
 */
export function dryRunFacts(preview: unknown, t: Translate = englishTranslate): Array<{ label: string; value: string }> {
  if (preview === null || typeof preview !== "object") return [];
  const record = preview as Record<string, unknown>;
  const facts: Array<{ label: string; value: string }> = [];
  if (typeof record.gasEstimate === "string" && /^\d+$/.test(record.gasEstimate)) {
    facts.push({
      label: t("cards.write.facts.gasEstimate"),
      value: t("cards.write.facts.gasUnits", { units: record.gasEstimate.replace(/\B(?=(\d{3})+(?!\d))/g, ",") }),
    });
  }
  if (typeof record.simulatedReturnValue === "string" && record.simulatedReturnValue !== "") {
    facts.push({ label: t("cards.write.facts.returns"), value: record.simulatedReturnValue });
  }
  return facts;
}

export type WriteView = { tone: "default" | "success" | "pending"; meta: string; status: string };

/**
 * The frame's tone, meta slot and DeepBookie status line for each stage. A
 * chat read-only before anyone answered reads "never authorized"; one
 * authorized whose receipt never landed in the chat says so rather than
 * claiming it is still sending.
 */
export function writeView(
  s: {
    phase: WritePhase;
    /** The answer on an executing card: a cancel passes through the same state on its way to cancelled. */
    approved?: boolean;
    live: boolean;
    resumeErrored: boolean;
    unavailable: boolean;
    needsCredential: boolean;
    submitted: boolean;
    edited: boolean;
  },
  t: Translate = englishTranslate,
): WriteView {
  const meta = (key: string) => t(`cards.write.meta.${key}`);
  const status = (key: string) => t(`cards.write.status.${key}`);
  switch (s.phase) {
    case "receipt":
      return { tone: "success", meta: meta("executed"), status: status("executed") };
    case "declined":
      return { tone: "default", meta: meta("cancelled"), status: status("cancelled") };
    case "executing":
      if (s.resumeErrored && s.live) return { tone: "pending", meta: meta("notSent"), status: status("notSent") };
      if (s.approved === false) return { tone: "default", meta: meta("cancelling"), status: status("cancelling") };
      if (!s.live) return { tone: "default", meta: meta("noReceipt"), status: status("noReceipt") };
      return { tone: "pending", meta: meta("sending"), status: status("sending") };
    case "proposed":
      if (!s.live) return { tone: "default", meta: meta("neverAuthorized"), status: status("neverAuthorized") };
      if (s.unavailable) return { tone: "pending", meta: meta("notAvailable"), status: status("notAvailable") };
      if (s.needsCredential) return { tone: "pending", meta: meta("needsCredential"), status: status("needsCredential") };
      if (s.submitted) return { tone: "pending", meta: meta("authorizing"), status: status("authorizing") };
      return s.edited
        ? { tone: "pending", meta: meta("edited"), status: status("edited") }
        : { tone: "pending", meta: meta("awaiting"), status: status("awaiting") };
  }
}

/** DeepBookie SwapCard's CTA ladder: the button names what it is waiting for, ending on Authorize. */
export function authorizeLabel(
  s: {
    submitted: boolean;
    unavailable: boolean;
    needsCredential: boolean;
    simulatable: boolean;
    preview: PreviewState["status"];
    needsAck: boolean;
    acknowledged: boolean;
  },
  t: Translate = englishTranslate,
): string {
  if (s.submitted) return t("cards.write.authorize.authorizing");
  if (s.unavailable) return t("cards.write.authorize.notAvailable");
  if (s.needsCredential) return t("cards.write.authorize.needsCredential");
  if (s.simulatable && s.preview === "loading") return t("cards.write.authorize.dryRunning");
  if (s.simulatable && s.preview !== "simulated") return t("cards.write.authorize.dryRunFailed");
  if (s.needsAck && !s.acknowledged) return t("cards.write.authorize.acknowledge");
  return t("cards.write.authorize.authorize");
}

/** The verified flag from a KeeperHub receipt payload, or undefined. */
export function receiptVerified(receipt: unknown): boolean | undefined {
  if (receipt === null || typeof receipt !== "object") {
    return undefined;
  }
  const receipts = (receipt as { receipts?: unknown }).receipts;
  if (Array.isArray(receipts) && receipts.length > 0) {
    const first = receipts[0];
    if (first !== null && typeof first === "object" && "verified" in first) {
      const v = (first as { verified?: unknown }).verified;
      if (typeof v === "boolean") {
        return v;
      }
    }
  }
  return undefined;
}

export function verbTitle(toolName: string, t: Translate = englishTranslate): string {
  switch (toolName) {
    case "execute_contract_call":
      return t("cards.write.verb.contractWrite");
    case "execute_protocol_action":
      return t("cards.write.verb.write");
    default:
      return t("cards.write.verb.write");
  }
}

export function verbMeta(toolName: string, input: unknown): string | undefined {
  if (input === null || typeof input !== "object") {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  if (toolName === "execute_contract_call") {
    const chain = typeof record.chain_id === "string" ? record.chain_id : "";
    const fn = typeof record.function_name === "string" ? record.function_name : "";
    return [chain, fn].filter((part) => part !== "").join(" · ") || undefined;
  }
  return typeof record.actionType === "string" ? record.actionType : undefined;
}

// Local copy of humanizeKey to keep this module JSX-free and dependency-light;
// format.ts is a "use client" module, so importing it here would pull the client
// boundary into the pure logic. Mirrors the same key humanization.
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (spaced === "") return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
