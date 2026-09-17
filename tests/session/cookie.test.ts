import { describe, expect, it } from "vitest";

import { sign, timingSafeStringEqual, verify } from "@/lib/session/cookie";

const secret = "s".repeat(32);

describe("cookie signing (HMAC-SHA256)", () => {
  it("verifies a value it signed", () => {
    const signed = sign("01ARZ3NDEKTSV4RRFFQ69G5FAV", secret);
    expect(verify(signed, secret)).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it("rejects a tampered value", () => {
    const signed = sign("01ARZ3NDEKTSV4RRFFQ69G5FAV", secret);
    const tampered = `01ARZ3NDEKTSV4RRFFQ69G5FAX${signed.slice(signed.indexOf("."))}`;
    expect(verify(tampered, secret)).toBeNull();
  });

  it("rejects a forged signature", () => {
    const signed = sign("01ARZ3NDEKTSV4RRFFQ69G5FAV", secret);
    expect(verify(`${signed.split(".")[0]}.deadbeef`, secret)).toBeNull();
  });

  it("rejects verification under a different secret", () => {
    const signed = sign("01ARZ3NDEKTSV4RRFFQ69G5FAV", secret);
    expect(verify(signed, "d".repeat(32))).toBeNull();
  });

  it("rejects a cookie with no signature segment", () => {
    expect(verify("justavalue", secret)).toBeNull();
  });

  it("rejects an empty cookie", () => {
    expect(verify("", secret)).toBeNull();
  });
});

describe("timingSafeStringEqual", () => {
  it("is true for identical strings", () => {
    expect(timingSafeStringEqual("abc123", "abc123")).toBe(true);
  });

  it("is false for same-length but differing strings", () => {
    expect(timingSafeStringEqual("abc123", "abc124")).toBe(false);
  });

  it("is false for differing lengths without throwing", () => {
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);
  });
});
