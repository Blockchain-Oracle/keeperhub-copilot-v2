import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { getAuthConfig } from "@/lib/config";

/*
 * Token crypto (AD-9 / NFR3): access and refresh tokens are AES-256-GCM
 * encrypted at rest, keyed from SESSION_SECRET. Plaintext tokens exist only
 * transiently in server memory during a request; the browser never sees them.
 * A blob is the self-describing "ivHex:authTagHex:ciphertextHex" triple, so
 * decryption needs nothing but the key.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard.

/*
 * The AES-256 encryption key, HKDF-derived from SESSION_SECRET with a per-use
 * `info` label ("token-enc") so it is cryptographically distinct from the
 * cookie-signing key that lib/session/cookie.ts derives from the SAME secret
 * (info "cookie-sig"). Domain separation (NFR3): one operator secret, but no
 * two primitives ever share key material.
 */
const KEY_SALT = "keeperhub-copilot/session/v1";

export function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, KEY_SALT, "token-enc", 32));
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(blob: string, key: Buffer): string {
  const [ivHex, tagHex, ctHex] = blob.split(":");
  if (!(ivHex && tagHex && ctHex)) {
    throw new Error("Malformed ciphertext blob");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  // decipher.final() throws on a wrong key or a tampered tag/ciphertext — the
  // GCM authentication guarantee. We let that propagate as a hard failure.
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

let cachedKey: Buffer | undefined;

function sessionKey(): Buffer {
  cachedKey ??= deriveKey(getAuthConfig().SESSION_SECRET);
  return cachedKey;
}

/** Encrypt a token with the SESSION_SECRET-derived key (server request path). */
export function encryptToken(plaintext: string): string {
  return encrypt(plaintext, sessionKey());
}

/** Decrypt a stored token blob with the SESSION_SECRET-derived key. */
export function decryptToken(blob: string): string {
  return decrypt(blob, sessionKey());
}
