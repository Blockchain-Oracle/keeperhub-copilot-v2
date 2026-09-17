import { ulid } from "ulid";

import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * The automations routes' session gate and error envelope, the same
 * { error: { code, message } } shape and statuses as /api/ledger and
 * /api/account.
 */

export type Gate = { ok: true; session: AuthenticatedSession; requestId: string } | { ok: false; response: Response };

export function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function gateSession(event: string): Promise<Gate> {
  const requestId = ulid();
  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(JSON.stringify({ event, requestId, message: error instanceof Error ? error.message : String(error) }));
    return {
      ok: false,
      response: errorResponse(503, "server_error", "We could not reach KeeperHub just now. Try again in a moment."),
    };
  }
  if (session === null) {
    return { ok: false, response: errorResponse(401, "unauthorized", "Connect KeeperHub to continue.") };
  }
  return { ok: true, session, requestId };
}

/** A KeeperHub error as a response: a lapsed session, a missing scope and a throttle keep their meaning. */
export function upstreamError(error: { code: string; message: string }): Response {
  switch (error.code) {
    case "unauthorized":
    case "session":
      return errorResponse(401, "unauthorized", "Your KeeperHub session ended. Connect KeeperHub to continue.");
    case "insufficient_scope":
      return errorResponse(403, "insufficient_scope", "This needs more access to KeeperHub. Reconnect and allow it.");
    case "rate_limited":
      return errorResponse(429, "rate_limited", "KeeperHub is busy. Try again in a moment.");
    case "server_error":
      return errorResponse(500, "server_error", error.message);
    default:
      return errorResponse(502, "upstream_error", error.message);
  }
}
