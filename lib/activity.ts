import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { getOperationEntry } from "@/lib/registry";

/*
 * What the History and Activity pages say about ledger rows, free of React and
 * the database so it runs under node tests and on either side of the wire.
 */

/** Decision 17: Activity lists actions, reads, or both. */
export type LedgerKind = "actions" | "reads" | "all";

export const LEDGER_KINDS: readonly LedgerKind[] = ["actions", "reads", "all"];

/** `?kind=` → a kind; absent means all (the ticker reads the whole ledger), anything else is not valid. */
export function parseLedgerKind(value: string | null): LedgerKind | undefined {
  if (value === null) return "all";
  return (LEDGER_KINDS as readonly string[]).includes(value) ? (value as LedgerKind) : undefined;
}

const VERB_LABELS: Readonly<Record<string, string>> = {
  execute_transfer: "pages.activity.verb.send",
  execute_contract_call: "pages.activity.verb.contractCall",
  get_wallet_integration: "pages.activity.verb.walletIntegration",
  "workflow/run": "pages.activity.verb.automationRun",
  "workflow/create": "pages.activity.verb.automationCreated",
  "workflow/update": "pages.activity.verb.automationChanged",
  "workflow/enable": "pages.activity.verb.automationOn",
  "workflow/disable": "pages.activity.verb.automationOff",
  "workflow/delete": "pages.activity.verb.automationDeleted",
};

/** A row's name: the verb's plain name, the registry label, or the id itself. */
export function activityLabel(opId: string, t: Translate = englishTranslate): string {
  const verb = VERB_LABELS[opId];
  return verb !== undefined ? t(verb) : (getOperationEntry(opId)?.label ?? opId);
}

/** The integration whose mark a row wears: the registry's, the automations' for workflow rows, else the chain verbs' "web3". */
export function activityIntegration(opId: string): string {
  const entry = getOperationEntry(opId);
  if (entry !== undefined) return entry.integration;
  return opId.startsWith("workflow/") ? "workflow" : "web3";
}

/** An automation row's own words once it lands and while it is open (decisions 18, 21). */
const WORKFLOW_OUTCOMES: Readonly<Record<string, { receipt: string; intent: string }>> = {
  "workflow/run": { receipt: "pages.activity.outcome.executed", intent: "pages.activity.outcome.running" },
  "workflow/create": { receipt: "pages.activity.outcome.saved", intent: "pages.activity.outcome.saving" },
  "workflow/update": { receipt: "pages.activity.outcome.saved", intent: "pages.activity.outcome.saving" },
  "workflow/enable": { receipt: "pages.activity.outcome.on", intent: "pages.activity.outcome.turningOn" },
  "workflow/disable": { receipt: "pages.activity.outcome.off", intent: "pages.activity.outcome.turningOff" },
  "workflow/delete": { receipt: "pages.activity.outcome.deleted", intent: "pages.activity.outcome.deleting" },
};

/** The network a row ran on, from its confirmed inputs: a verb's chain_id, a protocol action's network. */
export function activityNetwork(inputs: unknown): string | null {
  if (!isRecord(inputs)) return null;
  if (typeof inputs.chain_id === "string" && inputs.chain_id !== "") return inputs.chain_id;
  if (typeof inputs.network === "string" && inputs.network !== "") return inputs.network;
  const params = inputs.params;
  if (isRecord(params) && typeof params.network === "string" && params.network !== "") return params.network;
  return null;
}

export type OutcomeTone = "success" | "destructive" | "pending" | "muted" | "default";

/** A ledger state in the card vocabulary: EXECUTED for a receipt (SAVED, ON, OFF or DELETED for an automation change), CANCELLED for a decline. */
export function outcomeOf(state: string, opId?: string, t: Translate = englishTranslate): { label: string; tone: OutcomeTone } {
  const words = opId !== undefined ? WORKFLOW_OUTCOMES[opId] : undefined;
  switch (state) {
    case "receipt":
      return { label: t(words?.receipt ?? "pages.activity.outcome.executed"), tone: "success" };
    case "failure":
      return { label: t("pages.activity.outcome.failed"), tone: "destructive" };
    case "paid-but-failed":
      return { label: t("pages.activity.outcome.paidFailed"), tone: "destructive" };
    case "declined":
      return { label: t("pages.activity.outcome.cancelled"), tone: "muted" };
    case "expired":
      return { label: t("pages.activity.outcome.expired"), tone: "muted" };
    case "intent":
      return { label: t(words?.intent ?? "pages.activity.outcome.sending"), tone: "pending" };
    case "read":
      return { label: t("pages.activity.outcome.read"), tone: "default" };
    default:
      return { label: state, tone: "default" };
  }
}

export type ConversationSummary = { id: string; title: string; updatedAt: string; executed: number };

/** DeepBookie's History subtitle: how many conversations, and how many actions they executed. */
export function historySubtitle(items: readonly { executed: number }[], t: Translate = englishTranslate): string {
  if (items.length === 0) return t("pages.history.subtitle.empty");
  const executed = items.reduce((sum, item) => sum + item.executed, 0);
  return t("pages.history.subtitle.counts", { conversations: items.length, executed });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
