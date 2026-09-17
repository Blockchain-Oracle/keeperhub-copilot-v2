import "server-only";

import type { SessionRow, SessionTokenUpdate } from "@/lib/data";

import {
  OAuthResponseError,
  OAuthTokenError,
  type TokenResponse,
} from "./oauth";

/*
 * Refresh policy. The platform ROTATES the refresh token on every use, so a
 * lost race would invalidate the stored token. Two guards cooperate:
 *   1. an in-process single-flight map (in index.ts) stops one process from
 *      firing two token-endpoint refreshes for the same session, and
 *   2. this compare-and-set: only the request whose expected refresh
 *      ciphertext still matches the row writes the new pair.
 *
 * Collaborators are injected so the winner/loser/dead paths are unit-testable
 * without touching the network or the database.
 */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_SKEW_MS = 60 * 1000; // treat a token expiring within 60s as due

export class SessionDeadError extends Error {
  constructor(message = "Session is dead") {
    super(message);
    this.name = "SessionDeadError";
  }
}

export type RefreshResult = { row: SessionRow; accessToken: string };

export type RefreshDeps = {
  refreshAccessToken: (refreshToken: string) => Promise<TokenResponse>;
  rotate: (
    id: string,
    expectedRefreshCiphertext: string,
    next: SessionTokenUpdate,
  ) => Promise<SessionRow | null>;
  reRead: (id: string) => Promise<SessionRow | null>;
  encrypt: (plaintext: string) => string;
  decrypt: (blob: string) => string;
  now?: () => number;
};

/** True when the row's access token is still comfortably valid. */
export function accessTokenIsFresh(row: SessionRow, now: number): boolean {
  return row.accessTokenExpiresAt.getTime() - now > ACCESS_SKEW_MS;
}

export async function refreshSessionTokens(
  row: SessionRow,
  deps: RefreshDeps,
): Promise<RefreshResult> {
  const now = deps.now ? deps.now() : Date.now();

  let currentRefreshToken: string;
  try {
    currentRefreshToken = deps.decrypt(row.refreshTokenCiphertext);
  } catch {
    // The stored ciphertext will not decrypt (corruption, or SESSION_SECRET
    // rotated out from under it) — it can never refresh, so the session is dead.
    throw new SessionDeadError("stored refresh token is undecryptable");
  }

  let tokens: TokenResponse;
  try {
    tokens = await deps.refreshAccessToken(currentRefreshToken);
  } catch (error) {
    // Our refresh token may have been consumed by a concurrent winner (its
    // token call rotated it first). ANY detected rotation means a winner
    // refreshed for us: ride its pair regardless of how much life its access
    // token has left — a near-skew winner is still valid, and deleting it here
    // would kill a live session (the next read simply refreshes again).
    const concurrent = await deps.reRead(row.id);
    if (
      concurrent &&
      concurrent.refreshTokenCiphertext !== row.refreshTokenCiphertext
    ) {
      return {
        row: concurrent,
        accessToken: deps.decrypt(concurrent.accessTokenCiphertext),
      };
    }
    // A malformed 2xx (no usable tokens) or a 400/401 grant rejection is
    // terminal — the session is dead. Anything else (429/5xx/network/timeout)
    // is transient: propagate it so a blip never silently signs the user out.
    if (error instanceof OAuthResponseError) {
      throw new SessionDeadError("token endpoint returned an unusable response");
    }
    if (
      error instanceof OAuthTokenError &&
      (error.status === 400 || error.status === 401)
    ) {
      throw new SessionDeadError(`refresh rejected (${error.status})`);
    }
    throw error;
  }

  // A refreshed token whose lifetime is already inside the skew window is born
  // stale and would trigger a refresh on every subsequent request. That is a
  // broken-platform signal, not a usable token — fail closed rather than storm.
  if (
    !Number.isFinite(tokens.expiresInSeconds) ||
    tokens.expiresInSeconds * 1000 <= ACCESS_SKEW_MS
  ) {
    throw new SessionDeadError(
      `refreshed access token TTL (${tokens.expiresInSeconds}s) is within the skew window`,
    );
  }

  const next: SessionTokenUpdate = {
    accessTokenCiphertext: deps.encrypt(tokens.accessToken),
    refreshTokenCiphertext: deps.encrypt(tokens.refreshToken),
    accessTokenExpiresAt: new Date(now + tokens.expiresInSeconds * 1000),
    refreshTokenExpiresAt: new Date(now + REFRESH_TTL_MS),
  };

  const updated = await deps.rotate(row.id, row.refreshTokenCiphertext, next);
  if (updated) {
    return { row: updated, accessToken: tokens.accessToken };
  }

  // CAS missed: a concurrent request rotated between our read and our write.
  // Re-read and use the winner's fresh pair rather than our now-orphaned one.
  const concurrent = await deps.reRead(row.id);
  if (concurrent) {
    return {
      row: concurrent,
      accessToken: deps.decrypt(concurrent.accessTokenCiphertext),
    };
  }
  throw new SessionDeadError("session vanished during refresh");
}
