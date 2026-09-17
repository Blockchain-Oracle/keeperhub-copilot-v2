import { describe, expect, it } from "vitest";

import {
  canonicalStringify,
  computeFingerprint,
  computeSnapshotId,
} from "@/lib/registry/fingerprint";

const fields = [
  { key: "to", label: "To", type: "protocol-address", required: true },
  { key: "amount", label: "Amount", type: "protocol-uint", required: true },
];

describe("canonicalStringify", () => {
  it("is key-order independent", () => {
    expect(canonicalStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it("preserves array order (arrays are sequences, not sets)", () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it("drops undefined-valued keys like JSON serialization does", () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe(
      canonicalStringify({ a: 1 }),
    );
  });
});

describe("computeFingerprint (per-op: configFields + effect class)", () => {
  it("is stable across runs and key order", () => {
    const a = computeFingerprint({ configFields: fields, effectClass: "read" });
    const b = computeFingerprint({
      effectClass: "read",
      configFields: fields.map((f) => ({ ...f })),
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes when a field or the effect class changes", () => {
    const base = computeFingerprint({ configFields: fields, effectClass: "read" });
    expect(
      computeFingerprint({
        configFields: [...fields, { key: "memo", label: "Memo", type: "text" }],
        effectClass: "read",
      }),
    ).not.toBe(base);
    expect(
      computeFingerprint({ configFields: fields, effectClass: "value-moving-write" }),
    ).not.toBe(base);
  });
});

describe("computeSnapshotId (registry-level)", () => {
  it("hashes the canonicalized snapshot body with commit and timestamp", () => {
    const body = {
      source_commit: "9d510a1",
      extracted_at: "2026-08-10T00:00:00.000Z",
      integrations: { slack: { label: "Slack", description: "Send messages" } },
      actions: [{ id: "slack/send-message", configFields: fields }],
    };
    const id = computeSnapshotId(body);
    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(computeSnapshotId({ ...body })).toBe(id);
    expect(
      computeSnapshotId({ ...body, source_commit: "different" }),
    ).not.toBe(id);
  });
});
