import { type NextRequest, NextResponse } from "next/server";

import { destroySession } from "@/lib/session";
import {
  SESSION_COOKIE_NAME,
  verifyWithSessionSecret,
} from "@/lib/session/cookie";

import { resolveOrigin } from "../_shared";

/*
 * Log out. This must actually destroy server-side state, not just the cookie:
 * delete the session row (best-effort — the cookie is cleared regardless) and
 * redirect back with 303 so the browser re-fetches as a GET. It lands on /app,
 * where the sign-in card waits, as Masayume's Disconnect leaves you in the app.
 */
export async function POST(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const id = raw ? verifyWithSessionSecret(raw, "session") : null;
  if (id) {
    try {
      await destroySession(id);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "logout_destroy_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  const response = NextResponse.redirect(new URL("/app", resolveOrigin(request)), 303);
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
