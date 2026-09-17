import type { NextRequest } from "next/server";

import { createShare, revokeShare, shareStatus, type ReceiptRef, type ShareLookup } from "@/lib/data/shares";

import { resolveOrigin } from "../../auth/_shared";
import { errorResponse, gateSession } from "../../automations/_shared/gate";

/*
 * A receipt's share link (decision 37), for the Share menu on a receipt card
 * and in Activity. Signed in only, this org's receipts only.
 *   GET    ?ledgerId= | ?toolCallId=   → whether it can be shared, and its live link
 *   POST   { ledgerId } | { toolCallId } → the live link, made if needed
 *   DELETE { ledgerId } | { toolCallId } → the link turned off
 * Only an executed action with a transaction can be shared (409 otherwise).
 */
export const dynamic = "force-dynamic";

export type ShareResponse = { shareable: boolean; url: string | null };

const ID = /^[A-Za-z0-9_-]{1,100}$/;

function readRef(source: { ledgerId?: unknown; toolCallId?: unknown }): ReceiptRef | null {
  if (typeof source.ledgerId === "string" && ID.test(source.ledgerId)) return { ledgerId: source.ledgerId };
  if (typeof source.toolCallId === "string" && ID.test(source.toolCallId)) return { toolCallId: source.toolCallId };
  return null;
}

async function readBodyRef(request: NextRequest): Promise<ReceiptRef | null> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === "object" ? readRef(body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function answer(request: NextRequest, lookup: ShareLookup, refuseUnshareable: boolean): Response {
  if (!lookup.found) return errorResponse(404, "not_found", "This receipt is not available.");
  if (!lookup.shareable && refuseUnshareable) {
    return errorResponse(409, "not_shareable", "Only an action that executed with a transaction can be shared.");
  }
  const body: ShareResponse = {
    shareable: lookup.shareable,
    url: lookup.token === null ? null : `${resolveOrigin(request)}/r/${lookup.token}`,
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

function failed(event: string, requestId: string, orgId: string, error: unknown): Response {
  console.error(
    JSON.stringify({ event, requestId, orgId, message: error instanceof Error ? error.message : String(error) }),
  );
  return errorResponse(500, "server_error", "The share link could not be reached. Try again in a moment.");
}

export async function GET(request: NextRequest): Promise<Response> {
  const gate = await gateSession("receipt_share_session_error");
  if (!gate.ok) return gate.response;
  const params = request.nextUrl.searchParams;
  const ref = readRef({ ledgerId: params.get("ledgerId") ?? undefined, toolCallId: params.get("toolCallId") ?? undefined });
  if (ref === null) return errorResponse(400, "bad_request", "Which receipt is missing.");
  try {
    return answer(request, await shareStatus(gate.session, ref), false);
  } catch (error) {
    return failed("receipt_share_read_failed", gate.requestId, gate.session.orgId, error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const gate = await gateSession("receipt_share_session_error");
  if (!gate.ok) return gate.response;
  const ref = await readBodyRef(request);
  if (ref === null) return errorResponse(400, "bad_request", "Which receipt is missing.");
  try {
    const lookup = await createShare(gate.session, ref);
    if (lookup.found && lookup.shareable) {
      console.log(JSON.stringify({ event: "receipt_shared", requestId: gate.requestId, orgId: gate.session.orgId }));
    }
    return answer(request, lookup, true);
  } catch (error) {
    return failed("receipt_share_create_failed", gate.requestId, gate.session.orgId, error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const gate = await gateSession("receipt_share_session_error");
  if (!gate.ok) return gate.response;
  const ref = await readBodyRef(request);
  if (ref === null) return errorResponse(400, "bad_request", "Which receipt is missing.");
  try {
    const lookup = await revokeShare(gate.session, ref);
    if (lookup.found) {
      console.log(JSON.stringify({ event: "receipt_share_revoked", requestId: gate.requestId, orgId: gate.session.orgId }));
    }
    return answer(request, lookup, false);
  } catch (error) {
    return failed("receipt_share_revoke_failed", gate.requestId, gate.session.orgId, error);
  }
}
