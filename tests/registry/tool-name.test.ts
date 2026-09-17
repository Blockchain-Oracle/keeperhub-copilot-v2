import { describe, expect, it } from "vitest";

import {
  OPENAI_TOOL_NAME_PATTERN,
  decodeToolName,
  encodeToolName,
} from "@/lib/registry/tool-name";

describe("toolName encoding (opId -> OpenAI wire name)", () => {
  it("encodes the canonical slug separator reversibly", () => {
    expect(encodeToolName("slack/send-message")).toBe("slack__send-message");
    expect(decodeToolName("slack__send-message")).toBe("slack/send-message");
  });

  it("encodes system action ids containing spaces", () => {
    const encoded = encodeToolName("HTTP Request");
    expect(encoded).toMatch(OPENAI_TOOL_NAME_PATTERN);
    expect(decodeToolName(encoded)).toBe("HTTP Request");
  });

  it("round-trips every character class present in real ids", () => {
    for (const opId of [
      "web3/approve-token",
      "aave-v3/supply",
      "Database Query",
      "For Each",
      "frax-ether-v2/submit-and-deposit",
    ]) {
      const encoded = encodeToolName(opId);
      expect(encoded).toMatch(OPENAI_TOOL_NAME_PATTERN);
      expect(decodeToolName(encoded)).toBe(opId);
    }
  });

  it("escapes a literal underscore so decoding never misreads it", () => {
    const encoded = encodeToolName("odd_id/with_underscores");
    expect(encoded).toMatch(OPENAI_TOOL_NAME_PATTERN);
    expect(decodeToolName(encoded)).toBe("odd_id/with_underscores");
  });

  it("caps encoded names at 64 chars with a deterministic hash suffix", () => {
    const longId = `${"a".repeat(80)}/action`;
    const encoded = encodeToolName(longId);
    expect(encoded.length).toBeLessThanOrEqual(64);
    expect(encoded).toMatch(OPENAI_TOOL_NAME_PATTERN);
    expect(encodeToolName(longId)).toBe(encoded);
    // A truncated name is not algorithmically reversible - the registry's
    // bidirectional map is the authoritative reverse for these.
    expect(decodeToolName(encoded)).toBeNull();
  });

  it("rejects non-ASCII op ids loudly instead of mangling them", () => {
    expect(() => encodeToolName("slack/sénd")).toThrow(/ASCII/);
  });
});
