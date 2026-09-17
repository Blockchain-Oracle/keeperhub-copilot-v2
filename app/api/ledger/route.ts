import { ulid } from "ulid";

import { activityIntegration, activityLabel, activityNetwork, parseLedgerKind } from "@/lib/activity";
import { listLedgerRows } from "@/lib/data/ledger";
import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * This org's ledger, newest first — the ticker's latest receipts and the
 * Activity page. A token-free projection: what ran (with its plain name,
 * integration and network), how it ended, and its hash; confirmed inputs and
 * receipts stay server-side.
 *
 * `?limit=` 1–100 (default 50), `?before=<ISO time>` for the next page,
 * `?kind=actions|reads|all` (default all; decision 17).
 * Same envelope as the account route: { error: { code, message } }.
 */
export const dynamic = "force-dynamic";

const LIMIT = /^\d{1,3}$/;

export type LedgerListItem = {
  id: string;
  opId: string;
  label: string;
  integration: string;
  network: string | null;
  state: string;
  txHash: string | null;
  conversationId: string | null;
  workflowId: string | null;
  createdAt: string;
};

export type LedgerListResponse = { rows: LedgerListItem[] };

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = ulid();
  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ledger_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(503, "server_error", "We could not reach KeeperHub just now. Try again in a moment.");
  }
  if (session === null) {
    return errorResponse(401, "unauthorized", "Connect KeeperHub to continue.");
  }

  const params = new URL(request.url).searchParams;
  const limitParam = params.get("limit");
  if (limitParam !== null && !LIMIT.test(limitParam)) {
    return errorResponse(400, "invalid_limit", "That page size is not valid.");
  }
  const beforeParam = params.get("before");
  const before = beforeParam === null ? undefined : new Date(beforeParam);
  if (before !== undefined && Number.isNaN(before.getTime())) {
    return errorResponse(400, "invalid_cursor", "That page cursor is not valid.");
  }
  const kind = parseLedgerKind(params.get("kind"));
  if (kind === undefined) {
    return errorResponse(400, "invalid_kind", "That filter is not valid.");
  }

  try {
    const rows = await listLedgerRows(session, {
      limit: limitParam === null ? undefined : Number(limitParam),
      before,
      kind,
    });
    const body: LedgerListResponse = {
      rows: rows.map((row) => ({
        id: row.id,
        opId: row.opId,
        label: activityLabel(row.opId),
        integration: activityIntegration(row.opId),
        network: activityNetwork(row.confirmedInputs),
        state: row.state,
        txHash: row.txHash,
        conversationId: row.conversationId,
        workflowId: row.workflowId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "ledger_list_failed",
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(500, "server_error", "Your activity could not be loaded. Try again in a moment.");
  }
}
