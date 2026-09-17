import "server-only";

import { createHash, randomBytes } from "node:crypto";

/*
 * PKCE (RFC 7636). S256 is mandatory on this platform — plain is rejected at
 * the token endpoint. The verifier is stashed in the transient httpOnly txn
 * cookie; only the challenge travels in the authorize redirect.
 */

/** 32 random bytes as base64url — a 43-char verifier in the unreserved set. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** base64url(SHA-256(verifier)) — the S256 code challenge. */
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** An opaque CSRF value round-tripped through the authorize flow as `state`. */
export function generateState(): string {
  return randomBytes(16).toString("base64url");
}
