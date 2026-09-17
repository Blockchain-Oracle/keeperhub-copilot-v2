import { describe, expect, it } from "vitest";

import { isShareable, sharedReceiptTitle, sharedReceiptView } from "@/lib/shares";

/* What a shared receipt link may show (decision 37): public facts only. */

const TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HASH = `0x${"ab".repeat(32)}`;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "01LEDGER",
    orgId: "org-secret",
    conversationId: "conv-secret",
    workflowId: null,
    toolCallId: "tc-1",
    opId: "execute_transfer",
    state: "receipt",
    txHash: HASH,
    confirmedInputs: { chain_id: "84532", to_address: TO, amount: "0.01", note: "rent for Sam" },
    receipt: { receipts: [{ hash: HASH, chainId: "84532", verified: true, receiptStatus: "success", blockNumber: 123 }] },
    idempotencyKey: "k",
    schemaFingerprint: null,
    registrySnapshotId: null,
    createdAt: new Date("2026-09-14T10:00:00.000Z"),
    updatedAt: new Date("2026-09-14T10:00:05.000Z"),
    ...overrides,
  };
}

describe("isShareable", () => {
  it("allows only an executed row with a transaction", () => {
    expect(isShareable(row())).toBe(true);
    for (const state of ["declined", "failure", "intent", "read", "expired"]) {
      expect(isShareable(row({ state })), state).toBe(false);
    }
    expect(isShareable(row({ txHash: null }))).toBe(false);
    expect(isShareable(row({ txHash: "" }))).toBe(false);
    // An automation save has no transaction, so no link.
    expect(isShareable(row({ opId: "workflow/create", txHash: null }))).toBe(false);
  });
});

describe("sharedReceiptView", () => {
  it("shows a transfer's public facts and nothing else", () => {
    const view = sharedReceiptView(row());
    expect(view).toEqual({
      opId: "execute_transfer",
      label: "Send",
      integration: "web3",
      network: "84532",
      txHash: HASH,
      verified: true,
      blockNumber: "123",
      executedAt: "2026-09-14T10:00:05.000Z",
      transfer: { amount: "0.01", to: TO, tokenAddress: null },
    });
    const text = JSON.stringify(view);
    for (const secret of ["org-secret", "conv-secret", "tc-1", "rent for Sam", "01LEDGER"]) {
      expect(text).not.toContain(secret);
    }
    expect(sharedReceiptTitle(view!)).toBe("Send on Base Sepolia");
  });

  it("keeps a token transfer's token and gives other actions no transfer block", () => {
    const token = `0x${"c".repeat(40)}`;
    expect(sharedReceiptView(row({ confirmedInputs: { chain_id: "1", to_address: TO, amount: "5", token_address: token } }))?.transfer).toEqual({
      amount: "5",
      to: TO,
      tokenAddress: token,
    });
    const supply = sharedReceiptView(
      row({
        opId: "aave-v3/supply",
        confirmedInputs: { network: "1", asset: token, amount: "1000000", onBehalfOf: TO },
        receipt: { transactionHash: HASH, chainId: "1" },
      }),
    );
    expect(supply).toMatchObject({ integration: "aave-v3", network: "1", transfer: null, verified: null, blockNumber: null });
    expect(JSON.stringify(supply)).not.toContain("1000000");
  });

  it("an automation run never shows which automation it was", () => {
    const view = sharedReceiptView(row({ opId: "workflow/run", workflowId: "wf-secret", confirmedInputs: { workflowId: "wf-secret" } }));
    expect(view).toMatchObject({ label: "Automation run", network: "84532", transfer: null });
    expect(JSON.stringify(view)).not.toContain("wf-secret");
  });

  it("draws nothing for a row that can't be shared", () => {
    expect(sharedReceiptView(row({ state: "failure" }))).toBeNull();
  });
});
