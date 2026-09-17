import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { emitRegistryFiles } from "@/scripts/registry-emitter";
import type { Snapshot } from "@/scripts/registry-emitter";

const snapshot = JSON.parse(
  readFileSync(
    new URL("../../lib/registry/vendor/configfields.snapshot.json", import.meta.url),
    "utf8",
  ),
) as Snapshot;

function serialize(files: Map<string, string>): string {
  return [...files.entries()]
    .map(([name, contents]) => `${name}\n${contents}`)
    .join("\n");
}

describe("emitRegistryFiles determinism (the regen-diff invariant, AC 2)", () => {
  it("emits byte-identical output from the same snapshot, twice", () => {
    const first = emitRegistryFiles(structuredClone(snapshot));
    const second = emitRegistryFiles(structuredClone(snapshot));
    expect(serialize(first)).toBe(serialize(second));
  });

  it("stamps stable per-op fingerprints and the snapshot id across runs", () => {
    const meta = emitRegistryFiles(structuredClone(snapshot)).get("meta.ts");
    expect(meta).toContain(snapshot.snapshot_id);
    const slack = emitRegistryFiles(structuredClone(snapshot)).get("slack.ts");
    expect(slack).toMatch(/"fingerprint": "sha256:[0-9a-f]{64}"/);
  });
});

describe("emitRegistryFiles validation (fail loud, never emit from bad input)", () => {
  it("rejects a tampered action count", () => {
    const tampered = structuredClone(snapshot);
    tampered.actions = tampered.actions.slice(0, 441);
    expect(() => emitRegistryFiles(tampered)).toThrow(/non-relitigable/);
  });

  it("rejects a hand-edited snapshot body (snapshot id mismatch)", () => {
    const tampered = structuredClone(snapshot);
    tampered.actions[0].description = "hand-edited";
    expect(() => emitRegistryFiles(tampered)).toThrow(/Snapshot id mismatch/);
  });

  it("rejects a credential-count drift", () => {
    const tampered = structuredClone(snapshot);
    const gated = tampered.actions.find((action) => action.requiresCredentials);
    if (gated) {
      gated.requiresCredentials = false;
    }
    expect(() => emitRegistryFiles(tampered)).toThrow(/Credential-gated/);
  });
});
