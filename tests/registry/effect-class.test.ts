import { describe, expect, it } from "vitest";

import {
  AGGREGATE_EXECUTION_TOOLS,
  resolveEffectClass,
  resolveMixedEffect,
} from "@/lib/registry/effect-class";

const protocolRead = {
  id: "aave-v3/get-user-account-data",
  kind: "plugin" as const,
  integration: "aave-v3",
  requiresCredentials: false,
  protocolType: "read" as const,
};

const protocolWrite = {
  id: "aave-v3/supply",
  kind: "plugin" as const,
  integration: "aave-v3",
  requiresCredentials: true,
  protocolType: "write" as const,
};

const staticOp = (id: string, requiresCredentials = false) => ({
  id,
  kind: "plugin" as const,
  integration: id.split("/")[0],
  requiresCredentials,
});

const systemOp = (id: string) => ({
  id,
  kind: "system" as const,
  integration: "system",
  requiresCredentials: false,
});

describe("resolveEffectClass (the pure classifier, AD-6)", () => {
  it("classifies protocol actions from their source read/write type", () => {
    expect(resolveEffectClass(protocolRead)).toBe("read");
    expect(resolveEffectClass(protocolWrite)).toBe("value-moving-write");
  });

  it("never derives effect from the credential marker: a gated read stays a read", () => {
    expect(resolveEffectClass(staticOp("safe/get-pending-transactions", true))).toBe(
      "read",
    );
  });

  it("classifies authorization grants as their own high-risk class", () => {
    expect(resolveEffectClass(staticOp("web3/approve-token", true))).toBe(
      "authorization-grant",
    );
    expect(resolveEffectClass(staticOp("web3/sign-typed-data", true))).toBe(
      "authorization-grant",
    );
    expect(
      resolveEffectClass({
        ...protocolWrite,
        id: "morpho/set-authorization",
        integration: "morpho",
      }),
    ).toBe("authorization-grant");
    expect(
      resolveEffectClass({
        ...protocolWrite,
        id: "cowswap/set-pre-signature",
        integration: "cowswap",
      }),
    ).toBe("authorization-grant");
    // Every protocol approve is a grant, keyed on the slug, not a list.
    expect(
      resolveEffectClass({
        ...protocolWrite,
        id: "uniswap-v3/approve-token-spending",
        integration: "uniswap-v3",
      }),
    ).toBe("authorization-grant");
  });

  it("classifies off-chain sends", () => {
    for (const id of [
      "slack/send-message",
      "sendgrid/send-email",
      "discord/send-message",
      "telegram/send-message",
      "webhook/send-webhook",
    ]) {
      expect(resolveEffectClass(staticOp(id, true))).toBe("off-chain-send");
    }
    expect(resolveEffectClass(systemOp("HTTP Request"))).toBe("off-chain-send");
  });

  it("classifies static value movers including the Solana and tempo paths", () => {
    for (const id of [
      "web3/transfer-funds",
      "web3/transfer-token",
      "web3/transfer-spl-token",
      "web3/call-solana-program-anchor",
      "web3/send-raw-solana-instruction",
      "web3/write-contract",
      "tempo/dex-swap",
      "tempo/batch-payout",
    ]) {
      expect(resolveEffectClass(staticOp(id, true))).toBe("value-moving-write");
    }
  });

  it("classifies effect-free system primitives as reads", () => {
    for (const id of ["Condition", "For Each", "Collect"]) {
      expect(resolveEffectClass(systemOp(id))).toBe("read");
    }
  });

  it("quarantines operations with unbounded effects", () => {
    // Arbitrary SQL - could be SELECT or INSERT; no static signal.
    expect(resolveEffectClass(systemOp("Database Query"))).toBe("quarantined");
    // Arbitrary user JS with user-destination egress (KeeperHub's own tier).
    expect(resolveEffectClass(staticOp("code/run-code"))).toBe("quarantined");
  });

  it("quarantines any static action missing from the owned allowlist", () => {
    expect(resolveEffectClass(staticOp("web3/some-new-action"))).toBe("quarantined");
  });

  it("covers every static read in the owned allowlist", () => {
    for (const id of [
      "blockscout/get-address-balance",
      "hyperliquid/clearinghouse-state",
      "math/aggregate",
      "web3/check-balance",
      "web3/read-contract",
      "web3/decode-calldata",
    ]) {
      expect(resolveEffectClass(staticOp(id))).toBe("read");
    }
  });
});

describe("mixed-effect aggregate tools", () => {
  it("stamps exactly the 4 aggregate execution tools", () => {
    expect(Object.keys(AGGREGATE_EXECUTION_TOOLS).sort()).toEqual([
      "call_workflow",
      "execute_check_and_execute",
      "execute_contract_call",
      "execute_protocol_action",
    ]);
    for (const tool of Object.values(AGGREGATE_EXECUTION_TOOLS)) {
      expect(tool.effectClass).toBe("mixed-effect");
    }
  });

  it("resolves execute_contract_call from function mutability", () => {
    expect(
      resolveMixedEffect({ tool: "execute_contract_call", stateMutability: "view" }),
    ).toBe("read");
    expect(
      resolveMixedEffect({ tool: "execute_contract_call", stateMutability: "pure" }),
    ).toBe("read");
    expect(
      resolveMixedEffect({
        tool: "execute_contract_call",
        stateMutability: "nonpayable",
      }),
    ).toBe("value-moving-write");
    // payable SENDS native value — the mutability that moves funds must classify
    // as a write, never a read.
    expect(
      resolveMixedEffect({
        tool: "execute_contract_call",
        stateMutability: "payable",
      }),
    ).toBe("value-moving-write");
  });

  it("resolves execute_protocol_action to the underlying action's effect", () => {
    expect(
      resolveMixedEffect({
        tool: "execute_protocol_action",
        actionEffectClass: "authorization-grant",
      }),
    ).toBe("authorization-grant");
  });

  it("resolves execute_check_and_execute by whether it submits", () => {
    expect(
      resolveMixedEffect({ tool: "execute_check_and_execute", willExecute: false }),
    ).toBe("read");
    expect(
      resolveMixedEffect({
        tool: "execute_check_and_execute",
        willExecute: true,
        executionEffect: "value-moving-write",
      }),
    ).toBe("value-moving-write");
    // Submitting without a resolved execution effect is unresolvable.
    expect(
      resolveMixedEffect({ tool: "execute_check_and_execute", willExecute: true }),
    ).toBe("quarantined");
  });

  it("resolves call_workflow by listing kind", () => {
    expect(resolveMixedEffect({ tool: "call_workflow", listing: "read" })).toBe("read");
    expect(resolveMixedEffect({ tool: "call_workflow", listing: "write" })).toBe(
      "value-moving-write",
    );
    expect(resolveMixedEffect({ tool: "call_workflow", listing: "paid" })).toBe(
      "listing-payment",
    );
  });

  it("quarantines an out-of-domain context — fail-closed, never undefined (M7)", () => {
    // Bad wire data outside the typed union must fail closed to quarantined.
    expect(
      resolveMixedEffect({
        tool: "call_workflow",
        listing: "bogus" as unknown as "read",
      }),
    ).toBe("quarantined");
    expect(
      resolveMixedEffect({
        tool: "not_a_tool" as unknown as "call_workflow",
        listing: "read",
      }),
    ).toBe("quarantined");
  });
});
