import { ulid } from "ulid";

import { getSession, type AuthenticatedSession } from "@/lib/session";
import { fetchSpendLimit, type SpendLimit } from "@/lib/session/spend-cap";

/*
 * The org's daily spending limit, read when the account menu opens rather than
 * with every header load: it is one more KeeperHub round-trip that only the menu
 * shows. `limit` is null when KeeperHub could not say.
 *
 * Same envelope as the account route: { error: { code, message } }.
 */
export const dynamic = "force-dynamic";

export type LimitsResponse = { limit: SpendLimit | null };

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(): Promise<Response> {
  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "limits_session_error",
        requestId: ulid(),
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(503, "server_error", "We could not reach KeeperHub just now. Try again in a moment.");
  }
  if (session === null) {
    return errorResponse(401, "unauthorized", "Connect KeeperHub to continue.");
  }

  const body: LimitsResponse = { limit: await fetchSpendLimit(session.accessToken) };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
