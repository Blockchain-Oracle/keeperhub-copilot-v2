import { ulid } from "ulid";

import { recoverOpenWrites, type RecoveredWrite } from "@/lib/execution";
import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * Recovery on return. The shell calls this once per visit: every write intent
 * left open long enough that no live request still owns it is checked against
 * KeeperHub and closed on its answer. Nothing is re-sent. The shell says what
 * was found through a toast (Masayume features/recovery/WriteRecovery.tsx).
 *
 * POST because it may write terminals. Same envelope as the ledger route.
 */
export const dynamic = "force-dynamic";

export type RecoverResponse = { results: RecoveredWrite[] };

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = ulid();
  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "recover_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(503, "server_error", "We could not reach KeeperHub just now. Try again in a moment.");
  }
  if (session === null) {
    return errorResponse(401, "unauthorized", "Connect KeeperHub to continue.");
  }

  try {
    const results = await recoverOpenWrites({ session, requestId, signal: request.signal });
    const body: RecoverResponse = { results };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "recover_failed",
        requestId,
        orgId: session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(500, "server_error", "Earlier actions could not be checked. Try again in a moment.");
  }
}
