import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { getAuthConfig } from "@/lib/config";

/*
 * Cookie signing (AD-1). The session cookie carries ONLY a signed copy of the
 * server-minted session id — never token material. The signature is an
 * HMAC-SHA256 over the value, so the browser cannot forge or mutate the id it
 * holds. The transient OAuth-txn cookie signs a base64url JSON payload the
 * same way. Neither the ULID id nor a base64url payload contains ".", so the
 * last "." cleanly separates value from signature.
 */
export const SESSION_COOKIE_NAME = "kh_session";
export const OAUTH_TXN_COOKIE_NAME = "kh_oauth_txn";

function signature(value: string, key: string | Buffer): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

export function sign(value: string, key: string | Buffer): string {
  return `${value}.${signature(value, key)}`;
}

/** Return the signed value if the signature verifies, else null. */
export function verify(signed: string, key: string | Buffer): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const value = signed.slice(0, dot);
  const provided = Buffer.from(signed.slice(dot + 1));
  const expected = Buffer.from(signature(value, key));
  if (provided.length !== expected.length) {
    return null;
  }
  return timingSafeEqual(provided, expected) ? value : null;
}

/**
 * Length-guarded constant-time string comparison, for security tokens compared
 * outside the sign/verify path (e.g. the OAuth `state` value on callback).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/*
 * Each cookie's context is folded into the HKDF `info`, so the session cookie
 * and the OAuth-txn cookie get cryptographically distinct signing keys — a
 * signature minted for one can never verify as the other — and neither key is
 * the raw SESSION_SECRET (crypto.ts HKDF-derives the AES key from the same
 * secret with a different label). One operator secret, full domain separation
 * (NFR3).
 */
const SIG_SALT = "keeperhub-copilot/session/v1";

export type CookieContext = "session" | "txn";

const sigKeyByContext = new Map<CookieContext, Buffer>();

function sigKey(context: CookieContext): Buffer {
  let key = sigKeyByContext.get(context);
  if (!key) {
    key = Buffer.from(
      hkdfSync(
        "sha256",
        getAuthConfig().SESSION_SECRET,
        SIG_SALT,
        `cookie-sig:${context}`,
        32,
      ),
    );
    sigKeyByContext.set(context, key);
  }
  return key;
}

export function signWithSessionSecret(
  value: string,
  context: CookieContext,
): string {
  return sign(value, sigKey(context));
}

export function verifyWithSessionSecret(
  signed: string,
  context: CookieContext,
): string | null {
  return verify(signed, sigKey(context));
}
