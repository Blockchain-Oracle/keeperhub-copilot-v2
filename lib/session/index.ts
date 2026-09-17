import "server-only";

import { cookies } from "next/headers";

import {
  createSession as dataCreateSession,
  deleteSession as dataDeleteSession,
  getSessionById,
  rotateSessionTokens,
  type SessionRow,
  touchSession,
} from "@/lib/data";

import { SESSION_COOKIE_NAME, verifyWithSessionSecret } from "./cookie";
import { decryptToken, encryptToken } from "./crypto";
import { refreshAccessToken } from "./oauth";
import {
  accessTokenIsFresh,
  refreshSessionTokens,
  type RefreshResult,
  SessionDeadError,
} from "./refresh";
import { fetchOrgWalletAddress } from "./identity";

/*
 * The session layer's public read path — the SOLE reader of the session
 * cookie. Everything the
 * browser gets flows from a server-resolved session; there is no client-side
 * session probe.
 *
 * getSession returns the DECRYPTED access token for server-side use only (REST
 * with the Bearer, MCP calls in 1.4). It NEVER crosses to the browser — the UI
 * consumes getSessionIdentity(), which drops the token entirely.
 */

export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

// last_seen_at write throttle: refresh the column at most this often per
// session on the read path, so a signed-in page GET is not a DB write.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type AuthenticatedSession = {
  id: string;
  userId: string;
  orgId: string;
  scope: string;
  /** Decrypted access token. Server-side use only; never sent to the browser. */
  accessToken: string;
};

export type SessionIdentity = {
  userId: string;
  orgId: string;
  /** Org execution wallet (EIP-55) or null when none/unavailable. */
  walletAddress: string | null;
};

// In-process single-flight: never fire two token-endpoint refreshes for one
// session concurrently from the same process (the platform rotates the refresh
// token on every use, so a duplicate call would race itself into a dead token).
const inFlightRefreshes = new Map<string, Promise<RefreshResult>>();

function runRefreshSingleFlight(row: SessionRow): Promise<RefreshResult> {
  const existing = inFlightRefreshes.get(row.id);
  if (existing) {
    return existing;
  }
  const pending = refreshSessionTokens(row, {
    refreshAccessToken,
    rotate: rotateSessionTokens,
    reRead: getSessionById,
    encrypt: encryptToken,
    decrypt: decryptToken,
  }).finally(() => inFlightRefreshes.delete(row.id));
  inFlightRefreshes.set(row.id, pending);
  return pending;
}

function toSession(row: SessionRow, accessToken: string): AuthenticatedSession {
  return {
    id: row.id,
    userId: row.userId,
    orgId: row.orgId,
    scope: row.scope,
    accessToken,
  };
}

async function resolveSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return null;
  }
  return verifyWithSessionSecret(raw, "session");
}

/*
 * Resolve the current session, refreshing the access token if it is within the
 * skew window. Returns null for every signed-out shape — no cookie, forged
 * cookie, deleted/dead row, or lapsed refresh — so the shell simply renders
 * signed-out (AC 3: never a dead end). A stale cookie pointing at a deleted row
 * is inert here and gets overwritten on the next sign-in or cleared on logout;
 * Server Components cannot mutate cookies, so we do not try to clear it here.
 */
export async function getSession(): Promise<AuthenticatedSession | null> {
  const id = await resolveSessionId();
  if (!id) {
    return null;
  }

  const row = await getSessionById(id);
  if (!row) {
    return null;
  }

  const now = Date.now();

  // Refresh 30-day TTL lapsed -> the session is dead.
  if (row.refreshTokenExpiresAt.getTime() <= now) {
    await dataDeleteSession(id);
    return null;
  }

  if (accessTokenIsFresh(row, now)) {
    if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      try {
        await touchSession(id);
      } catch (error) {
        // last_seen_at is bookkeeping — a write blip must never fail the read.
        console.error(
          JSON.stringify({
            event: "session_touch_failed",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    let accessToken: string;
    try {
      accessToken = decryptToken(row.accessTokenCiphertext);
    } catch {
      // Undecryptable ciphertext (corruption or a rotated SESSION_SECRET): the
      // row can never be used again — treat it as a dead session so the shell
      // self-heals to signed-out instead of throwing on every request.
      await dataDeleteSession(id);
      return null;
    }
    return toSession(row, accessToken);
  }

  try {
    const refreshed = await runRefreshSingleFlight(row);
    return toSession(refreshed.row, refreshed.accessToken);
  } catch (error) {
    if (error instanceof SessionDeadError) {
      await dataDeleteSession(id);
      return null;
    }
    // Transient (429/5xx/network): surface it rather than silently signing out.
    throw error;
  }
}

/*
 * The token-free identity projection the UI consumes: who is signed in, the
 * org, and the org execution wallet address. The access token stays inside the
 * session layer.
 */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }
  const walletAddress = await fetchOrgWalletAddress(session.accessToken);
  return {
    userId: session.userId,
    orgId: session.orgId,
    walletAddress,
  };
}

/*
 * Persist a brand-new session after a successful OAuth exchange. The caller
 * (the callback route) has already decoded the claims and encrypted the tokens
 * through this layer; here we only hand the row to the accessor.
 */
export async function persistNewSession(row: {
  id: string;
  userId: string;
  orgId: string;
  scope: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}): Promise<void> {
  await dataCreateSession(row);
}

export async function destroySession(id: string): Promise<void> {
  await dataDeleteSession(id);
}
