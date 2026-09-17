import { type NextRequest, NextResponse } from "next/server";

import { ulid } from "ulid";

import { persistNewSession, SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/session";
import {
  OAUTH_TXN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  signWithSessionSecret,
  timingSafeStringEqual,
} from "@/lib/session/cookie";
import { encryptToken } from "@/lib/session/crypto";
import {
  decodeAccessTokenClaims,
  exchangeCodeForTokens,
} from "@/lib/session/oauth";
import { REFRESH_TTL_MS } from "@/lib/session/refresh";

import {
  decodeTxn,
  resolveOrigin,
  sessionCookieOptions,
  signedOutRedirect,
} from "../_shared";

/*
 * The OAuth redirect target. Error path FIRST: a callback carrying `error`
 * (e.g. access_denied when the user cancels consent), a missing/mismatched
 * state, or a missing transient cookie clears the txn cookie and lands
 * signed-out on the shell — no error page, no dead end (AC 3). Happy path:
 * verify state, exchange the code, decode the JWT claims (WITHOUT verifying —
 * we do not hold KeeperHub's signing secret), mint a session, encrypt and
 * persist the tokens, set the signed session cookie, and return to the shell.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const errorParam = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  const txn = decodeTxn(request.cookies.get(OAUTH_TXN_COOKIE_NAME)?.value);

  if (
    errorParam ||
    !txn ||
    !state ||
    !code ||
    !timingSafeStringEqual(state, txn.state)
  ) {
    return signedOutRedirect(request, errorParam === "access_denied" ? "denied" : "failed");
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: txn.codeVerifier,
      redirectUri: txn.redirectUri,
    });
    const claims = decodeAccessTokenClaims(tokens.accessToken);

    const id = ulid();
    await persistNewSession({
      id,
      userId: claims.sub,
      orgId: claims.org,
      scope: tokens.scope,
      accessTokenCiphertext: encryptToken(tokens.accessToken),
      refreshTokenCiphertext: encryptToken(tokens.refreshToken),
      accessTokenExpiresAt: new Date(claims.exp * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    const origin = resolveOrigin(request);
    // Straight into the app, where a question typed before sign-in is waiting.
    const response = NextResponse.redirect(new URL("/app", origin));
    response.cookies.set(
      SESSION_COOKIE_NAME,
      signWithSessionSecret(id, "session"),
      sessionCookieOptions(origin, SESSION_COOKIE_MAX_AGE_SECONDS),
    );
    response.cookies.delete(OAUTH_TXN_COOKIE_NAME);
    return response;
  } catch (error) {
    // Structured server log; the user still lands signed-out, never a dead end.
    console.error(
      JSON.stringify({
        event: "oauth_callback_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return signedOutRedirect(request, "failed");
  }
}
