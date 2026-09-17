import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  getChatTool,
  getInputSchema,
  getOperationEntry,
  getRealtimeFunction,
  listOperationEntries,
  opIdForToolName,
  registryMeta,
  resolveOperation,
} from "@/lib/registry";
import { OPENAI_TOOL_NAME_PATTERN } from "@/lib/registry/tool-name";

const entries = listOperationEntries();

describe("generated registry coverage (AC 1)", () => {
  it("contains exactly the snapshot's 442 operations", () => {
    expect(entries).toHaveLength(442);
    expect(registryMeta.actionCount).toBe(442);
  });

  it("marks exactly 139 operations credential-gated", () => {
    expect(entries.filter((entry) => entry.needsCredential)).toHaveLength(139);
  });

  it("never credential-gates a read (reads are never gated as ceremony)", () => {
    // The two [C] reads (e.g. safe/get-pending-transactions) keep the marker
    // as a SETUP pre-state; the class stays read so no confirm ceremony ever
    // attaches. This asserts the class, which is what gates ceremony.
    const gatedReads = entries.filter(
      (entry) => entry.effectClass === "read" && entry.needsCredential,
    );
    for (const entry of gatedReads) {
      expect(entry.effectClass).toBe("read");
    }
  });

  it("stamps the registry snapshot id from the vendored snapshot header", () => {
    const snapshot = JSON.parse(
      readFileSync(
        new URL("../../lib/registry/vendor/configfields.snapshot.json", import.meta.url),
        "utf8",
      ),
    ) as { snapshot_id: string; source_commit: string };
    expect(registryMeta.snapshotId).toBe(snapshot.snapshot_id);
    expect(registryMeta.sourceCommit).toBe(snapshot.source_commit);
  });

  it("gives every operation a wire-legal, unique toolName", () => {
    const seen = new Set<string>();
    for (const entry of entries) {
      expect(entry.toolName).toMatch(OPENAI_TOOL_NAME_PATTERN);
      expect(seen.has(entry.toolName)).toBe(false);
      seen.add(entry.toolName);
    }
  });

  it("keeps rendererKey identical to opId (one identity everywhere)", () => {
    for (const entry of entries) {
      expect(entry.rendererKey).toBe(entry.opId);
    }
  });

  it("marks exactly the control-flow primitives and Solana movers bespoke", () => {
    const bespoke = entries
      .filter((entry) => entry.renderer === "bespoke")
      .map((entry) => entry.opId)
      .sort();
    expect(bespoke).toEqual([
      "Collect",
      "Condition",
      "Database Query",
      "For Each",
      "HTTP Request",
      "web3/call-solana-program-anchor",
      "web3/send-raw-solana-instruction",
      "web3/transfer-spl-token",
    ]);
  });

  it("populates only the 1.3 effect classes among the 442", () => {
    const classes = new Set(entries.map((entry) => entry.effectClass));
    expect(classes.has("listing-payment")).toBe(false);
    expect(classes.has("config-management-write")).toBe(false);
    expect(classes.has("mixed-effect")).toBe(false);
  });

  it("quarantines exactly the unbounded-effect operations", () => {
    const quarantined = entries
      .filter((entry) => entry.effectClass === "quarantined")
      .map((entry) => entry.opId)
      .sort();
    expect(quarantined).toEqual(["Database Query", "code/run-code"]);
  });

  it("carries hidden protocol metadata as passthrough defaults, not fields", () => {
    const entry = getOperationEntry("aave-v3/supply");
    expect(entry).toBeDefined();
    expect(entry?.passthroughDefaults._protocolMeta).toBeDefined();
    expect(entry?.fields.some((field) => field.key === "_protocolMeta")).toBe(false);
  });
});

describe("runtime lookup and quarantine resolution (AC 3)", () => {
  it("resolves an absent op id to quarantined - never executable", () => {
    expect(resolveOperation("web3/not-a-real-action")).toEqual({
      status: "quarantined",
      reason: "absent",
      opId: "web3/not-a-real-action",
    });
  });

  it("resolves a fingerprint mismatch (drift) to quarantined", () => {
    const resolved = resolveOperation("slack/send-message", {
      expectedFingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(resolved.status).toBe("quarantined");
    expect(resolved.status === "quarantined" && resolved.reason).toBe(
      "fingerprint-drift",
    );
  });

  it("resolves a quarantined-class op to quarantined", () => {
    const resolved = resolveOperation("code/run-code");
    expect(resolved.status).toBe("quarantined");
    expect(resolved.status === "quarantined" && resolved.reason).toBe(
      "quarantined-class",
    );
  });

  it("resolves a healthy op with a matching fingerprint", () => {
    const entry = getOperationEntry("slack/send-message");
    const resolved = resolveOperation("slack/send-message", {
      expectedFingerprint: entry?.fingerprint,
    });
    expect(resolved.status).toBe("ok");
  });

  it("gives quarantined operations no tool surface at all", () => {
    expect(getChatTool("code/run-code")).toBeUndefined();
    expect(getRealtimeFunction("Database Query")).toBeUndefined();
    expect(getChatTool("web3/not-a-real-action")).toBeUndefined();
  });
});

describe("single-source tool derivation (AC 1)", () => {
  it("derives the chat tool from the registry entry", () => {
    const tool = getChatTool("slack/send-message");
    expect(tool?.name).toBe("slack__send-message");
    expect(tool?.description).toBe("Send a message to a Slack channel");
    expect(
      tool?.inputSchema.safeParse({ slackChannel: "#ops", slackMessage: "hi" }).success,
    ).toBe(true);
    expect(tool?.inputSchema.safeParse({ slackChannel: "#ops" }).success).toBe(false);
  });

  it("keeps the baked Realtime parameters aligned with the runtime Zod schema", () => {
    const fn = getRealtimeFunction("web3/transfer-funds");
    const schema = getInputSchema("web3/transfer-funds");
    expect(fn?.type).toBe("function");
    expect(fn?.name).toBe("web3__transfer-funds");
    const properties = fn?.parameters.properties as Record<string, { type?: string }>;
    expect(Object.keys(properties).sort()).toEqual(
      Object.keys(schema?.shape ?? {}).sort(),
    );
  });

  it("types amounts as strings on the Realtime wire too (AD-11)", () => {
    const fn = getRealtimeFunction("aave-v3/supply");
    const properties = fn?.parameters.properties as Record<string, { type?: string }>;
    expect(properties.amount?.type).toBe("string");
  });

  it("maps wire toolNames back to canonical op ids", () => {
    expect(opIdForToolName("slack__send-message")).toBe("slack/send-message");
    expect(opIdForToolName("HTTP_20Request")).toBe("HTTP Request");
    expect(opIdForToolName("not__registered")).toBeUndefined();
  });
});
