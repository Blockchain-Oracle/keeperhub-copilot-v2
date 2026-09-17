/*
 * Deterministic, client-side renderer selection (Story 1.4, spine AD-12/NFR6).
 * A PURE function: (tool part) → a render plan. The model proposes content; the
 * SYSTEM picks the renderer — never the model. Kept free of JSX so it is unit
 * tested directly in node (tests/cards). The React layer (CardRenderer) maps a
 * plan to a component inside a per-card error boundary; any fault degrades to
 * the stub without breaking siblings (AC 3).
 */
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { getOperationEntry } from "@/lib/registry";

export type ToolPartState =
  | "input-streaming"
  | "input-available"
  // Story 2.3 — the confirm-ceremony part states (a WRITE only): the SDK holds
  // the write as approval-requested until confirmed (approval-responded), then
  // executes to output-available; a decline lands as output-denied.
  | "approval-requested"
  | "approval-responded"
  | "output-denied"
  | "output-available"
  | "output-error";

/** The normalized view of an AI SDK tool part the selector reads. */
export type ToolPartView = {
  toolName: string;
  state: ToolPartState;
  /** The part's toolCallId — needed for seeding-once, the re-run body, and
   *  supersede-derived retirement (Story 1.6). */
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** Story 2.3: the AI SDK approval object on a ceremony part (id + decision). */
  approval?: {
    id?: string;
    approved?: boolean;
    isAutomatic?: boolean;
    signature?: string;
  };
};

export type RenderableError = {
  code?: string;
  message: string;
  decoded?: unknown;
  issues?: Array<{ path: string; message: string }>;
  retryAfter?: number;
  scope?: {
    requiredScope: string;
    grantedScope: string;
    upgradeUrl: string;
    hint: string;
  };
};

export type RenderPlan =
  | { kind: "skeleton"; opLabel?: string }
  | { kind: "capabilities"; result: unknown }
  | {
      kind: "read";
      toolName: string;
      opId?: string;
      toolCallId?: string;
      fingerprint?: string;
      input: unknown;
      data: unknown;
    }
  | {
      kind: "needs-credential";
      toolName: string;
      opId?: string;
      integration: string;
      message: string;
    }
  // Story 2.3 — the confirm ceremony on the generic write card. `write-proposed`
  // is the reviewable pre-confirm card (fetches its simulate preview + offers
  // Confirm/Decline); `write-executing` is the confirmed in-flight state;
  // `receipt` is the verified terminal; `write-declined` the SDK-native decline.
  // A write FAILURE reuses the `error` kind → ErrorCard (heavy ink, no red).
  | {
      kind: "write-proposed";
      toolName: string;
      toolCallId?: string;
      opId?: string;
      approvalId?: string;
      input: unknown;
    }
  | {
      kind: "write-executing";
      toolName: string;
      toolCallId?: string;
      opId?: string;
      approvalId?: string;
      approved?: boolean;
      input: unknown;
    }
  | {
      kind: "write-declined";
      toolName: string;
      toolCallId?: string;
      opId?: string;
      input: unknown;
    }
  | {
      kind: "receipt";
      toolName: string;
      toolCallId?: string;
      opId?: string;
      input: unknown;
      txHash?: string | null;
      receipt: unknown;
    }
  // Automations from chat (decisions 19–21): the org's list and one automation described.
  | { kind: "automations"; automations: unknown }
  | { kind: "automation"; automation: unknown; runs: unknown; notEditable?: string }
  // The org wallet's holdings (decision 34).
  | { kind: "holdings"; holdings: unknown }
  // A form for details (decision 32): open while output is absent, then the record of the answer.
  | { kind: "input-request"; toolCallId?: string; input: unknown; output?: unknown }
  | { kind: "error"; toolName: string; error: RenderableError }
  | { kind: "stub"; toolName: string; payload: unknown };

const EXEC_TOOLS = new Set([
  "execute_protocol_action",
  "execute_contract_call",
  "execute_transfer",
  "get_wallet_integration",
]);

export function selectRenderer(part: ToolPartView, t: Translate = englishTranslate): RenderPlan {
  const toolName = part.toolName;

  // A form (decision 32) has no execute: it stays open at input-available until the person answers.
  if (toolName === "request_input") {
    if (part.state === "input-streaming") return { kind: "skeleton" };
    if (part.state === "output-error") {
      return { kind: "error", toolName, error: { message: nonEmpty(part.errorText) ?? t("cards.renderer.formUnanswerable") } };
    }
    return {
      kind: "input-request",
      toolCallId: part.toolCallId,
      input: part.input,
      output: part.state === "output-available" ? part.output : undefined,
    };
  }

  // Confirm-ceremony part states (Story 2.3) — a WRITE only; a read never enters
  // these. Keyed on the persisted part.state, deterministic (AD-12): the card is
  // proposed → executing → receipt | declined, never the model's choice.
  if (part.state === "approval-requested" || part.state === "approval-responded") {
    const opId = opIdFromInput(part.input);
    // AC3 / D23: a WRITE proposal keys on registry key + persisted part state, and
    // a drifted/quarantined op degrades to the safe stub — never a confirmable write
    // card. A protocol-action write names an opId (its actionType); if it no longer
    // resolves in the registry (drift / quarantine), degrade to the stub, mirroring
    // the READ drift gate below (:232). A contract call carries no opId
    // (opIdFromInput → undefined) and is unaffected — it renders its verb card.
    if (opId !== undefined && getOperationEntry(opId) === undefined) {
      return { kind: "stub", toolName, payload: part.input };
    }
    if (part.state === "approval-requested") {
      return {
        kind: "write-proposed",
        toolName,
        toolCallId: part.toolCallId,
        opId,
        approvalId: part.approval?.id,
        input: part.input,
      };
    }
    // approval-responded → approved and awaiting the broadcast → in flight (confirmed
    // folds into executing). A decline lands as output-denied below; an approved
    // call resolves to output-available.
    return {
      kind: "write-executing",
      toolName,
      toolCallId: part.toolCallId,
      opId,
      approvalId: part.approval?.id,
      approved: part.approval?.approved,
      input: part.input,
    };
  }
  if (part.state === "output-denied") {
    return {
      kind: "write-declined",
      toolName,
      toolCallId: part.toolCallId,
      opId: opIdFromInput(part.input),
      input: part.input,
    };
  }

  // Streaming / captured-but-pending: skeleton only. Fields seed from settled
  // values, never partials — so we bind nothing, but may show the op label once
  // actionType parses from the partial input (display only).
  if (part.state === "input-streaming" || part.state === "input-available") {
    return { kind: "skeleton", opLabel: opLabelFromInput(part.input) };
  }

  // The SDK itself errored the tool (a thrown execute, a transport fault).
  if (part.state === "output-error") {
    return {
      kind: "error",
      toolName,
      error: {
        message: nonEmpty(part.errorText) ?? t("cards.renderer.toolCallIncomplete"),
      },
    };
  }

  // output-available: read the structured ToolOutput from lib/execution.
  const output = part.output;
  if (!isToolOutput(output)) {
    return { kind: "stub", toolName, payload: output };
  }
  if (output.ok === false) {
    return {
      kind: "error",
      toolName: asString(output.tool) ?? toolName,
      error: toRenderableError(output.error, t),
    };
  }
  // The write receipt terminal (Story 2.3, AC 4): ok:true with state "receipt".
  // The verified result renders read-only (no buttons); a write FAILURE is an
  // ok:false above → ErrorCard, never a receipt.
  if (output.state === "receipt") {
    return {
      kind: "receipt",
      toolName: asString(output.tool) ?? toolName,
      toolCallId: part.toolCallId,
      opId: asString(output.opId) ?? opIdFromInput(part.input),
      input: part.input,
      txHash: typeof output.txHash === "string" ? output.txHash : null,
      receipt: output.receipt,
    };
  }
  // The needs-credential pre-state (D8): ok:true, distinguished by its `state`
  // discriminator. It routes to the setup card, NEVER the read card. A malformed
  // variant (no usable integration key) degrades to the stub — never confirmable.
  if (output.state === "needs-credential") {
    const integration = asString(output.integration);
    if (integration === undefined) {
      return { kind: "stub", toolName, payload: output };
    }
    return {
      kind: "needs-credential",
      toolName: asString(output.tool) ?? toolName,
      opId: asString(output.opId),
      integration,
      message:
        nonEmpty(output.message) ??
        t("cards.renderer.needsCredential"),
    };
  }
  if (output.tool === "search_actions") {
    return { kind: "capabilities", result: output.result };
  }
  if (output.tool === "list_automations") {
    return { kind: "automations", automations: output.automations };
  }
  if (output.tool === "get_org_wallet_balances") {
    return { kind: "holdings", holdings: output };
  }
  if (output.tool === "get_automation") {
    return { kind: "automation", automation: output.automation, runs: output.runs, notEditable: asString(output.notEditable) };
  }
  if (EXEC_TOOLS.has(String(output.tool))) {
    const opId = asString(output.opId);
    // A protocol action names an opId. If it no longer resolves in the registry
    // (drift / quarantine), degrade to the stub rather than render an unkeyed
    // card. Contract calls and wallet reads carry no opId — they render a
    // schema-free key/value read card.
    if (opId !== undefined && getOperationEntry(opId) === undefined) {
      return { kind: "stub", toolName: String(output.tool), payload: output };
    }
    return {
      kind: "read",
      toolName: String(output.tool),
      opId,
      toolCallId: part.toolCallId,
      fingerprint: asString(output.fingerprint),
      input: part.input,
      data: output.data,
    };
  }
  // A well-formed but unrecognized success shape degrades to the stub.
  return { kind: "stub", toolName, payload: output };
}

// --- helpers -----------------------------------------------------------------

function opLabelFromInput(input: unknown): string | undefined {
  if (input !== null && typeof input === "object") {
    const actionType = (input as { actionType?: unknown }).actionType;
    if (typeof actionType === "string" && actionType !== "") {
      return getOperationEntry(actionType)?.label;
    }
  }
  return undefined;
}

/** The op id (KeeperHub action slug) declared in a write proposal's input, if
 *  any. A contract call carries none — the write card falls back to a verb title. */
function opIdFromInput(input: unknown): string | undefined {
  if (input !== null && typeof input === "object") {
    const actionType = (input as { actionType?: unknown }).actionType;
    if (typeof actionType === "string" && actionType !== "") {
      return actionType;
    }
  }
  return undefined;
}

function isToolOutput(
  value: unknown,
): value is Record<string, unknown> & { ok: boolean } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

function toRenderableError(error: unknown, t: Translate): RenderableError {
  if (error === null || typeof error !== "object") {
    return { message: t("cards.renderer.actionIncomplete") };
  }
  const record = error as Record<string, unknown>;
  return {
    code: asString(record.code),
    message: nonEmpty(record.message) ?? t("cards.renderer.actionIncomplete"),
    decoded: record.decoded,
    issues: Array.isArray(record.issues)
      ? (record.issues as RenderableError["issues"])
      : undefined,
    retryAfter:
      typeof record.retryAfter === "number" ? record.retryAfter : undefined,
    scope: isScope(record.scope) ? record.scope : undefined,
  };
}

function isScope(value: unknown): value is RenderableError["scope"] {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { upgradeUrl?: unknown }).upgradeUrl === "string"
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
