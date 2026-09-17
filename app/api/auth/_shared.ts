import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { getAuthConfig } from "@/lib/config";
import {
  OAUTH_TXN_COOKIE_NAME,
  signWithSessionSecret,
  verifyWithSessionSecret,
} from "@/lib/session/cookie";
import {
  buildAuthorizeUrl,
  DEFAULT_SCOPE,
} from "@/lib/session/oauth";
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
} from "@/lib/session/pkce";

/*
 * Shared helpers for the OAuth dance routes (login, callback, logout, reauth).
 * Not a route itself (only route.ts files are routes).
 */

const TXN_MAX_AGE_SECONDS = 600; // ~10 min: the authorize round-trip window.
// Copilot's product surface needs only read + write (mcp:write already covers
// every workflow/execution/transfer tool). mcp:admin is intentionally NOT
// accepted here, so a crafted ?scope=mcp:admin link cannot drive a signed-in
// user into an admin consent run; re-add it deliberately if an admin flow lands.
const VALID_SCOPE = /^mcp:(read|write)$/;

export type OAuthTxn = {
  codeVerifier: string;
  state: string;
  redirectUri: string;
  scope: string;
};

/*
 * The public origin. In production it comes from APP_BASE_URL (config), so the
 * app's own origin — used to build the redirect_uri, the post-auth redirects,
 * and the cookie Secure flag — never derives from client-influenceable request
 * headers in a security-critical flow. Only local dev (APP_BASE_URL unset)
 * falls back to forwarded headers, where the host is loopback.
 */
export function resolveOrigin(request: NextRequest): string {
  const configured = getAuthConfig().APP_BASE_URL;
  if (configured) {
    return configured;
  }
  const proto = (
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "")
  )
    .split(",")[0]
    .trim();
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  return `${proto}://${host}`;
}

function cookieSecurity(origin: string): { secure: boolean } {
  // Secure cookies are dropped by browsers over http (localhost dev), so the
  // flag is https-only. httpOnly + SameSite=Lax still apply everywhere.
  return { secure: origin.startsWith("https://") };
}

export function sessionCookieOptions(origin: string, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...cookieSecurity(origin),
  };
}

/** Only pass through well-formed mcp scopes; default to read+write up front. */
export function sanitizeScope(raw: string | null): string {
  if (!raw) {
    return DEFAULT_SCOPE;
  }
  const parts = raw
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => VALID_SCOPE.test(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join(" ") : DEFAULT_SCOPE;
}

function encodeTxn(txn: OAuthTxn): string {
  return signWithSessionSecret(
    Buffer.from(JSON.stringify(txn)).toString("base64url"),
    "txn",
  );
}

export function decodeTxn(cookieValue: string | undefined): OAuthTxn | null {
  if (!cookieValue) {
    return null;
  }
  const verified = verifyWithSessionSecret(cookieValue, "txn");
  if (!verified) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(verified, "base64url").toString("utf8"),
    ) as Partial<OAuthTxn>;
    if (
      typeof parsed.codeVerifier === "string" &&
      typeof parsed.state === "string" &&
      typeof parsed.redirectUri === "string" &&
      typeof parsed.scope === "string"
    ) {
      return parsed as OAuthTxn;
    }
    return null;
  } catch {
    return null;
  }
}

/*
 * Start (or restart) the authorize flow: generate PKCE + state, stash them in
 * a short-lived signed txn cookie, and redirect to the KeeperHub consent
 * screen with the requested scope up front.
 */
export function startAuthorize(
  request: NextRequest,
  scope: string,
): NextResponse {
  const origin = resolveOrigin(request);
  const redirectUri = `${origin}/api/auth/callback`;
  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl({
    redirectUri,
    codeChallenge: codeChallengeS256(codeVerifier),
    state,
    scope,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    OAUTH_TXN_COOKIE_NAME,
    encodeTxn({ codeVerifier, state, redirectUri, scope }),
    sessionCookieOptions(origin, TXN_MAX_AGE_SECONDS),
  );
  return response;
}

/**
 * A clean signed-out landing on the app — never a dead end (AC 3). `reason`
 * lets the sign-in modal reopen and say what happened: `denied` when the person
 * cancelled on KeeperHub, `failed` for anything else.
 */
export function signedOutRedirect(
  request: NextRequest,
  reason: "denied" | "failed",
): NextResponse {
  const url = new URL("/app", resolveOrigin(request));
  url.searchParams.set("connect", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_TXN_COOKIE_NAME);
  return response;
}
