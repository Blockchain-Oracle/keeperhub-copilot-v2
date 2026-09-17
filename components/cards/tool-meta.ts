import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { getOperationEntry, integrations } from "@/lib/registry";
import { readResult } from "@/lib/read-results";

import { humanizeKey } from "./format.ts";

/*
 * Names for a tool call, for the tools line and the card frames: which
 * integration it belongs to, a plain title, and its input and output as short
 * key/value lines. Free of React so it runs under node tests.
 */

const AUTOMATION_TOOLS: ReadonlySet<string> = new Set([
  "list_automations",
  "get_automation",
  "create_automation",
  "set_automation_enabled",
  "update_automation",
  "run_automation",
  "delete_automation",
]);

export function actionTypeOf(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const actionType = (input as { actionType?: unknown }).actionType;
  return typeof actionType === "string" && actionType !== "" ? actionType : undefined;
}

/** "search" for the catalog lookup; the registry integration for a protocol action; "web3" for the chain verbs. */
export function integrationOf(toolName: string, input: unknown): string {
  if (toolName === "search_actions") return "search";
  if (toolName === "request_input") return "form";
  if (AUTOMATION_TOOLS.has(toolName)) return "workflow";
  const actionType = actionTypeOf(input);
  if (toolName === "execute_protocol_action" && actionType !== undefined) {
    return getOperationEntry(actionType)?.integration ?? actionType.split("/")[0];
  }
  return "web3";
}

export function integrationLabel(integration: string, t: Translate = englishTranslate): string {
  if (integration === "search") return t("cards.toolMeta.integration.search");
  if (integration === "form") return t("cards.toolMeta.integration.form");
  return integrations[integration]?.label ?? humanizeKey(integration);
}

export function toolTitle(toolName: string, input: unknown, t: Translate = englishTranslate): string {
  const record = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
  switch (toolName) {
    case "search_actions":
      return typeof record.query === "string" && record.query.trim() !== ""
        ? t("cards.toolMeta.title.lookupFor", { query: record.query.trim() })
        : t("cards.toolMeta.title.lookup");
    case "execute_protocol_action": {
      const actionType = actionTypeOf(input);
      return (
        (actionType !== undefined ? getOperationEntry(actionType)?.label : undefined) ??
        actionType ??
        t("cards.toolMeta.title.protocolAction")
      );
    }
    case "execute_contract_call":
      return typeof record.function_name === "string" && record.function_name !== ""
        ? t("cards.toolMeta.title.calledFunction", { name: record.function_name })
        : t("cards.toolMeta.title.contractCall");
    case "execute_transfer":
      return t("cards.toolMeta.title.transfer");
    case "get_wallet_integration":
      return t("cards.toolMeta.title.walletIntegration");
    case "list_automations":
      return t("cards.toolMeta.title.listAutomations");
    case "get_automation":
      return t("cards.toolMeta.title.getAutomation");
    case "create_automation":
      return typeof record.name === "string" && record.name.trim() !== ""
        ? t("cards.toolMeta.title.createNamed", { name: record.name.trim() })
        : t("cards.toolMeta.title.create");
    case "set_automation_enabled":
      return record.enabled === false ? t("cards.toolMeta.title.turnOff") : t("cards.toolMeta.title.turnOn");
    case "update_automation":
      return typeof record.name === "string" && record.name.trim() !== ""
        ? t("cards.toolMeta.title.updateNamed", { name: record.name.trim() })
        : t("cards.toolMeta.title.update");
    case "run_automation":
      return t("cards.toolMeta.title.run");
    case "get_org_wallet_balances":
      return t("cards.toolMeta.title.holdings");
    case "request_input":
      return typeof record.title === "string" && record.title.trim() !== ""
        ? t("cards.toolMeta.title.askNamed", { title: record.title.trim() })
        : t("cards.toolMeta.title.ask");
    case "delete_automation":
      return t("cards.toolMeta.title.delete");
    default:
      return humanizeKey(toolName);
  }
}

const DETAIL_MAX = 140;
const DETAIL_ROWS = 12;

function line(value: unknown): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (value === undefined) text = "";
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX - 1)}…` : text;
}

function rows(record: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .slice(0, DETAIL_ROWS)
    .map(([key, value]) => [key, line(value)]);
}

/** The call's input as lines; a protocol action shows its parameters, never the alternatives card data. */
export function detailInput(toolName: string, input: unknown, t: Translate = englishTranslate): Array<[string, string]> {
  if (input === null || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  if (toolName === "execute_protocol_action") {
    const params = record.params !== null && typeof record.params === "object" ? (record.params as Record<string, unknown>) : {};
    return [[t("cards.toolMeta.detail.action"), line(record.actionType)], ...rows(params)];
  }
  if (toolName === "create_automation" || toolName === "update_automation") {
    const trigger = record.trigger as { type?: unknown } | undefined;
    const steps = Array.isArray(record.steps) ? (record.steps as Array<{ action?: unknown }>) : [];
    return [
      [t("cards.toolMeta.detail.name"), line(record.name)],
      [t("cards.toolMeta.detail.starts"), line(trigger?.type)],
      ...steps
        .slice(0, DETAIL_ROWS)
        .map((step, index): [string, string] => [
          t("cards.toolMeta.detail.step", { position: String(index + 1) }),
          line(step.action),
        ]),
    ];
  }
  return rows(record);
}

/** The call's outcome as lines: matches for a lookup, the reason for a failure, the result fields for a read. */
export function detailOutput(
  toolName: string,
  output: unknown,
  errorText?: string,
  t: Translate = englishTranslate,
): Array<[string, string]> {
  if (typeof errorText === "string" && errorText !== "") return [[t("cards.toolMeta.detail.error"), line(errorText)]];
  if (output === null || typeof output !== "object") return [];
  const record = output as Record<string, unknown>;
  if (record.ok === false) {
    const error = record.error as { message?: unknown } | undefined;
    return [[t("cards.toolMeta.detail.error"), line(error?.message ?? t("cards.toolMeta.detail.notCompleted"))]];
  }
  if (toolName === "search_actions") {
    const result = record.result as { matches?: unknown } | undefined;
    const matches = Array.isArray(result?.matches) ? (result.matches as Array<Record<string, unknown>>) : [];
    return matches.slice(0, DETAIL_ROWS).map((match) => [line(match.opId), line(match.label)]);
  }
  if ("data" in record) {
    const shown = readResult(record.data);
    return shown !== null && typeof shown === "object" && !Array.isArray(shown)
      ? rows(shown as Record<string, unknown>)
      : [[t("cards.toolMeta.detail.result"), line(shown)]];
  }
  if (typeof record.state === "string") return [[t("cards.toolMeta.detail.state"), record.state]];
  return [];
}
