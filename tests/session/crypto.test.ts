import { describe, expect, it } from "vitest";

import { decrypt, deriveKey, encrypt } from "@/lib/session/crypto";

function flipLastHexNibble(hex: string): string {
  const last = hex.at(-1) ?? "0";
  const flipped = last === "f" ? "e" : "f";
  return hex.slice(0, -1) + flipped;
}

describe("token crypto (AES-256-GCM)", () => {
  const key = deriveKey("s".repeat(32));

  it("round-trips a token and never leaks the plaintext into the blob", () => {
    const blob = encrypt("kh-access-token-value", key);
    expect(blob).not.toContain("kh-access-token-value");
    expect(decrypt(blob, key)).toBe("kh-access-token-value");
  });

  it("uses a fresh iv per call so identical plaintext yields distinct blobs", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("rejects decryption under the wrong key", () => {
    const blob = encrypt("secret", key);
    expect(() => decrypt(blob, deriveKey("d".repeat(32)))).toThrow();
  });

  it("rejects a tampered ciphertext (GCM auth tag mismatch)", () => {
    const [iv, tag, ct] = encrypt("secret", key).split(":");
    expect(() => decrypt(`${iv}:${tag}:${flipLastHexNibble(ct)}`, key)).toThrow();
  });

  it("rejects a structurally malformed blob", () => {
    expect(() => decrypt("not-a-valid-blob", key)).toThrow();
  });
});
