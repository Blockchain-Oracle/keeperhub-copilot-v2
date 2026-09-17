import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalJSON, signToolApproval } from "@/app/api/chat/approval-signature";

// An INDEPENDENT reference implementation (node:crypto) of the SAME documented
// scheme (ai@7.0.59 tool-approval-signature). If our WebCrypto reproduction agrees
// with node:crypto over the exact payload, and canonicalJSON matches the SDK's
// sorted-key form (asserted below), the signature the SDK verifies on resume will
// accept our re-signed edited quote. A drift in either impl fails this test.
function referenceSignature(params: {
  secret: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): string {
  const inputDigest = createHash("sha256").update(canonicalJSON(params.input)).digest("base64url");
  const payload = JSON.stringify([
    "ai-sdk-tool-approval-v1",
    params.approvalId,
    params.toolCallId,
    params.toolName,
    inputDigest,
  ]);
  return createHmac("sha256", params.secret).update(payload).digest("base64url");
}

describe("canonicalJSON (verbatim SDK scheme — sorted keys)", () => {
  it("sorts object keys so key order never changes the digest", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJSON({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
    // Nested + arrays canonicalize recursively; arrays keep order.
    expect(canonicalJSON({ z: [3, { y: 1, x: 2 }] })).toBe('{"z":[3,{"x":2,"y":1}]}');
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON("s")).toBe('"s"');
  });
});

describe("signToolApproval matches the independent node:crypto reference", () => {
  const cases = [
    {
      secret: "s".repeat(32),
      approvalId: "appr-1",
      toolCallId: "call-1",
      toolName: "execute_transfer",
      input: { chain_id: "11155111", to_address: "0xabc", amount: "45" },
    },
    {
      // Key ORDER in the input must not matter (canonical sort).
      secret: "another-secret-value-here-000000",
      approvalId: "appr-2",
      toolCallId: "call-2",
      toolName: "execute_transfer",
      input: { amount: "0.1", to_address: "0xabc", chain_id: "1", token_address: "0xtok" },
    },
  ];

  it.each(cases)("re-signs %#: WebCrypto === node:crypto", async (c) => {
    expect(await signToolApproval(c)).toBe(referenceSignature(c));
  });

  it("is base64url (no +, /, or = padding)", async () => {
    const sig = await signToolApproval(cases[0]);
    expect(sig).not.toMatch(/[+/=]/);
    expect(sig.length).toBeGreaterThan(0);
  });

  it("a changed amount yields a different signature (the edit is bound)", async () => {
    const original = await signToolApproval(cases[0]);
    const edited = await signToolApproval({
      ...cases[0],
      input: { ...cases[0].input, amount: "999" },
    });
    expect(edited).not.toBe(original);
  });
});
