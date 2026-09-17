import "server-only";

import { getAuthConfig } from "@/lib/config";
import { callTool, type McpError } from "@/lib/mcp";
import type { AuthenticatedSession } from "@/lib/session";

import { toAutomationDetail, toAutomationRun, toAutomationSummary, type AutomationDetail, type AutomationRun, type AutomationSummary } from "./shape";

/*
 * Reading an org's KeeperHub automations. The list and one automation come
 * through KeeperHub's MCP server (list_workflows, get_workflow; mcp:read) with
 * the session's token, like every other KeeperHub call in lib/execution. Two
 * things have no MCP tool, so they are plain REST with the same Bearer, the
 * pattern lib/session/balance.ts uses: an automation's recent runs
 * (GET /api/workflows/[id]/executions) and its dry run
 * (POST /api/workflows/[id]/simulate). Running one is a write and lives in
 * lib/execution.
 */

export type AutomationError = Pick<McpError, "code" | "message" | "retryAfter" | "decoded">;

export type AutomationResult<T> = { ok: true; data: T } | { ok: false; error: AutomationError };

const REST_TIMEOUT_MS = 15_000;
/** The most runs listAutomationRuns returns, newest first. */
export const AUTOMATION_RUNS_LISTED = 20;

export async function listAutomations(session: AuthenticatedSession, requestId: string): Promise<AutomationResult<AutomationSummary[]>> {
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "list_workflows",
    args: {},
    idempotent: true,
    requestId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const rows = Array.isArray(result.data) ? result.data : [];
  return { ok: true, data: rows.flatMap((row) => toAutomationSummary(row) ?? []) };
}

export async function getAutomation(
  session: AuthenticatedSession,
  workflowId: string,
  requestId: string,
): Promise<AutomationResult<AutomationDetail | null>> {
  const record = await getAutomationRecord(session, workflowId, requestId);
  if (!record.ok) return record;
  return { ok: true, data: record.data === null ? null : toAutomationDetail(record.data) };
}

/** One automation's KeeperHub row as sent (nodes and edges included), or null when this org has none by that id. */
export async function getAutomationRecord(
  session: AuthenticatedSession,
  workflowId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<AutomationResult<Record<string, unknown> | null>> {
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "get_workflow",
    args: { workflowId },
    idempotent: true,
    requestId,
    signal,
  });
  if (!result.ok) {
    // KeeperHub answers an unknown or foreign workflow with a 404 inside the tool error.
    if (result.error.code === "tool_error" && /\b404\b/.test(result.error.message)) return { ok: true, data: null };
    return { ok: false, error: result.error };
  }
  return { ok: true, data: isRecord(result.data) ? result.data : null };
}

export type CronCheck = { valid: true; description: string | null } | { valid: false; error: string };

/** KeeperHub's own reading of a cron line (MCP validate_cron), or null when it could not be asked. */
export async function validateCron(
  session: AuthenticatedSession,
  cron: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<CronCheck | null> {
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "validate_cron",
    args: { cronExpression: cron },
    idempotent: true,
    requestId,
    signal,
  });
  if (!result.ok || !isRecord(result.data)) return null;
  if (result.data.valid === true) {
    return { valid: true, description: typeof result.data.description === "string" ? result.data.description : null };
  }
  return { valid: false, error: typeof result.data.error === "string" ? result.data.error : "the cron line is not valid" };
}

export type AutomationValidation = { valid: boolean; errors: string[]; warnings: string[] };

/*
 * KeeperHub's structural check of a saved automation (MCP validate_workflow,
 * fork lib/mcp/tools.ts:2746-2779): `{ ok, result: { valid, errors?, warnings? } }`,
 * each entry `{ code, message, parameterPath }`. Null when it could not be asked.
 */
export async function validateAutomation(
  session: AuthenticatedSession,
  workflowId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<AutomationValidation | null> {
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "validate_workflow",
    args: { workflowId },
    idempotent: true,
    requestId,
    signal,
  });
  if (!result.ok || !isRecord(result.data)) return null;
  const payload = isRecord(result.data.result) ? result.data.result : result.data;
  if (typeof payload.valid !== "boolean") return null;
  return { valid: payload.valid, errors: messagesOf(payload.errors), warnings: messagesOf(payload.warnings) };
}

/*
 * A verified contract's ABI as JSON text, from KeeperHub's block explorer lookup
 * `GET /api/chains/[chainId]/abi?address=` (no auth check, fork
 * app/api/chains/[chainId]/abi/route.ts), or null when there is none.
 */
export async function fetchContractAbi(network: string, address: string): Promise<string | null> {
  const path = `/api/chains/${encodeURIComponent(network)}/abi?address=${encodeURIComponent(address)}`;
  try {
    const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
    const response = await fetch(`${KEEPERHUB_OAUTH_ISSUER}${path}`, {
      headers: { accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { success?: unknown; abi?: unknown };
    return body.success === true && Array.isArray(body.abi) ? JSON.stringify(body.abi) : null;
  } catch (error) {
    console.error(
      JSON.stringify({ event: "automation_abi_fetch_failed", path, message: error instanceof Error ? error.message : String(error) }),
    );
    return null;
  }
}

export type AutomationDeletion =
  | { ok: true; alreadyGone: boolean }
  | { ok: false; error: AutomationError; answered: boolean };

/*
 * Deleting an automation (decision 21). MCP delete_workflow cannot pass
 * `force`, and KeeperHub refuses to delete one that has runs without it (409,
 * fork app/api/workflows/[workflowId]/route.ts:1002-1025). Its own editor then
 * asks "Delete Workflow and All Runs" and sends force=true
 * (components/workflow/workflow-toolbar.tsx:1137-1141, lib/api-client.ts:708),
 * so the card says the run history goes too and this sends the same, as plain
 * REST with the session's Bearer. KeeperHub soft-deletes the row; a 404 means it
 * is already gone. `answered` is false when nothing came back, so nobody can
 * say whether it landed.
 */
export async function deleteAutomationRecord(session: AuthenticatedSession, workflowId: string): Promise<AutomationDeletion> {
  const path = `/api/workflows/${encodeURIComponent(workflowId)}?force=true`;
  let response: Response;
  try {
    const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
    response = await fetch(`${KEEPERHUB_OAUTH_ISSUER}${path}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "automation_delete_failed",
        path,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return {
      ok: false,
      answered: false,
      error: {
        code: "transport",
        message: "KeeperHub didn't answer, so it isn't known yet whether the automation was deleted. The Automations page will show it.",
      },
    };
  }
  if (response.ok) return { ok: true, alreadyGone: false };
  if (response.status === 404) return { ok: true, alreadyGone: true };
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  console.error(JSON.stringify({ event: "automation_delete_refused", path, status: response.status, orgId: session.orgId }));
  return {
    ok: false,
    answered: true,
    error: {
      code: response.status === 401 ? "unauthorized" : response.status === 403 ? "insufficient_scope" : response.status === 429 ? "rate_limited" : "tool_error",
      message: typeof body?.error === "string" ? body.error : `KeeperHub refused the delete (${response.status}).`,
    },
  };
}

function messagesOf(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => (isRecord(entry) && typeof entry.message === "string" ? [entry.message] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The newest runs, or null when KeeperHub's run history cannot be read (the page says so). */
export async function listAutomationRuns(session: AuthenticatedSession, workflowId: string): Promise<AutomationRun[] | null> {
  const body = await rest(session, "GET", `/api/workflows/${encodeURIComponent(workflowId)}/executions`);
  if (body === null || !Array.isArray(body)) return null;
  return body.flatMap((row) => toAutomationRun(row) ?? []).slice(0, AUTOMATION_RUNS_LISTED);
}

export type AutomationDryRun =
  | { ok: true; simulated: number; skipped: number; warnings: Array<{ nodeId: string; message: string }> }
  | { ok: false; reason: string };

/*
 * KeeperHub's workflow dry run is advisory: it checks each step it can and
 * returns warnings, never a block (fork lib/workflow/run-simulation.ts:57-65).
 */
export async function simulateAutomation(session: AuthenticatedSession, workflowId: string): Promise<AutomationDryRun> {
  const body = await rest(session, "POST", `/api/workflows/${encodeURIComponent(workflowId)}/simulate`, true);
  if (body === null || typeof body !== "object") return { ok: false, reason: "KeeperHub could not dry-run this automation." };
  const record = body as { ok?: unknown; error?: unknown; result?: unknown };
  if (record.ok !== true || record.result === null || typeof record.result !== "object") {
    return { ok: false, reason: dryRunReason(record.error) };
  }
  const result = record.result as { simulatedNodeCount?: unknown; skippedNodeCount?: unknown; warnings?: unknown };
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.flatMap((warning) => {
        const w = warning as { nodeId?: unknown; message?: unknown };
        return typeof w.message === "string" ? [{ nodeId: typeof w.nodeId === "string" ? w.nodeId : "", message: w.message }] : [];
      })
    : [];
  return {
    ok: true,
    simulated: typeof result.simulatedNodeCount === "number" ? result.simulatedNodeCount : 0,
    skipped: typeof result.skippedNodeCount === "number" ? result.skippedNodeCount : 0,
    warnings,
  };
}

function dryRunReason(code: unknown): string {
  switch (code) {
    case "SIMULATION_TIMEOUT":
      return "KeeperHub's dry run took too long.";
    case "SIMULATION_NODE_LIMIT_EXCEEDED":
      return "This automation has too many steps for KeeperHub to dry-run.";
    case "RATE_LIMIT_EXCEEDED":
      return "Too many dry runs just now. Try again in a moment.";
    default:
      return "KeeperHub could not dry-run this automation.";
  }
}

/** A REST call with the session's Bearer, or null on any failure; the callers show an honest unavailable state. */
async function rest(session: AuthenticatedSession, method: "GET" | "POST", path: string, allowErrorBody = false): Promise<unknown> {
  try {
    const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
    const response = await fetch(`${KEEPERHUB_OAUTH_ISSUER}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok && !allowErrorBody) {
      console.error(JSON.stringify({ event: "automation_rest_failed", path, status: response.status, orgId: session.orgId }));
      return null;
    }
    return (await response.json()) as unknown;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "automation_rest_failed",
        path,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}
