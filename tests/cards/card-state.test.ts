import { describe, expect, it } from "vitest";

import {
  FR7_STATES,
  resolveProposedState,
  type FR7StateKey,
} from "@/components/cards/card-state";
import {
  isSimulatable,
  isSolanaChainId,
  isWriteUnavailable,
} from "@/lib/registry/simulatability";
import type { PreviewState } from "@/components/cards/write-card";

// The 13-key FR7 vocabulary + the pre-state, verbatim from DESIGN.md:403-417 /
// project-context.md:64-67 — the single place the vocabulary is named (D19).
const ALL_KEYS: FR7StateKey[] = [
  "streaming",
  "proposed",
  "edited",
  "simulated",
  "no-preview",
  "confirmed",
  "executing",
  "receipt",
  "failure",
  "paid-but-failed",
  "declined",
  "expired",
  "needs-credential",
];

describe("FR7_STATES — the canonical, verbatim state vocabulary (D19, D24)", () => {
  it("names every one of the 13 FR7 keys exactly once, with a verbatim DESIGN chip label", () => {
    expect(Object.keys(FR7_STATES).sort()).toEqual([...ALL_KEYS].sort());
    // The verbatim DESIGN.md:403-417 chip labels (copy law: sentence case, no
    // em-dash, no exclamation).
    expect(FR7_STATES.streaming.chip).toBe("Streaming");
    expect(FR7_STATES.proposed.chip).toBe("Proposed");
    expect(FR7_STATES.edited.chip).toBe("Edited");
    expect(FR7_STATES.simulated.chip).toBe("Simulated");
    expect(FR7_STATES["no-preview"].chip).toBe("No preview");
    expect(FR7_STATES.confirmed.chip).toBe("Confirmed");
    expect(FR7_STATES.executing.chip).toBe("Executing");
    expect(FR7_STATES.receipt.chip).toBe("Receipt");
    expect(FR7_STATES.failure.chip).toBe("Failed");
    expect(FR7_STATES["paid-but-failed"].chip).toBe("Paid+failed");
    expect(FR7_STATES.declined.chip).toBe("Declined");
    expect(FR7_STATES.expired.chip).toBe("Expired");
    expect(FR7_STATES["needs-credential"].chip).toBe("Needs credential");
    // No chip carries an em-dash or an exclamation.
    for (const key of ALL_KEYS) {
      expect(FR7_STATES[key].chip).not.toContain("—");
      expect(FR7_STATES[key].chip).not.toContain("!");
    }
  });

  it("marks the accent chip on confirmed/executing ONLY (DESIGN.md:255-257, 410-411)", () => {
    expect(FR7_STATES.confirmed.treatment).toBe("accent");
    expect(FR7_STATES.executing.treatment).toBe("accent");
    // Everything else is default or heavy — the one-accent law forbids a second use.
    const accented = ALL_KEYS.filter((k) => FR7_STATES[k].treatment === "accent");
    expect(accented.sort()).toEqual(["confirmed", "executing"]);
  });

  it("uses heavy ink for the failure family (never a second hue / red)", () => {
    expect(FR7_STATES.failure.treatment).toBe("heavy");
    expect(FR7_STATES["paid-but-failed"].treatment).toBe("heavy");
    expect(FR7_STATES.declined.treatment).toBe("heavy");
  });

  it("marks the live-border set EXACTLY as DESIGN.md:346-347 (proposed/edited/simulated/no-preview/needs-credential)", () => {
    const live = ALL_KEYS.filter((k) => FR7_STATES[k].live);
    expect(live.sort()).toEqual(
      ["edited", "needs-credential", "no-preview", "proposed", "simulated"].sort(),
    );
    // Terminals + executing are NOT live.
    for (const key of [
      "confirmed",
      "executing",
      "receipt",
      "failure",
      "declined",
      "expired",
      "paid-but-failed",
      "streaming",
    ] as const) {
      expect(FR7_STATES[key].live).toBe(false);
    }
  });
});

describe("isSolanaChainId + isSimulatable — the data-derived classification (D20, AD-6)", () => {
  it("detects Solana chain ids and aliases", () => {
    for (const id of ["101", "102", "103"]) expect(isSolanaChainId(id)).toBe(true);
    expect(isSolanaChainId("solana-mainnet")).toBe(true);
    expect(isSolanaChainId("1")).toBe(false);
    expect(isSolanaChainId(undefined)).toBe(false);
  });

  it("a simulable EVM contract call is simulatable; a Solana contract call is not", () => {
    expect(
      isSimulatable("execute_contract_call", { chain_id: "1", function_name: "transfer" }),
    ).toBe(true);
    // Solana cannot be dry-run simulated (KeeperHub rejects it) → no-preview class.
    expect(
      isSimulatable("execute_contract_call", { chain_id: "101", function_name: "x" }),
    ).toBe(false);
    // A contract call with no chain id defaults to simulatable (the server would
    // validate the missing field; the classification never over-claims no-preview).
    expect(isSimulatable("execute_contract_call", { function_name: "x" })).toBe(true);
  });

  it("a protocol action / off-chain send / malformed input is NEVER simulatable (no-preview)", () => {
    expect(
      isSimulatable("execute_protocol_action", { actionType: "web3/transfer-token", params: {} }),
    ).toBe(false);
    expect(isSimulatable("execute_protocol_action", { actionType: "slack/send-message" })).toBe(
      false,
    );
    expect(isSimulatable("search_actions", {})).toBe(false);
    expect(isSimulatable("execute_contract_call", null)).toBe(true); // no chain → EVM default
    expect(isSimulatable("execute_protocol_action", null)).toBe(false);
  });

  it("marks a Solana contract-call write UNAVAILABLE (server-refused); everything else available (P1)", () => {
    // isWriteUnavailable mirrors lib/execution's Solana refusal — a confirmable
    // dead-end is never offered; the Solana bespoke card is Story 2.5.
    expect(isWriteUnavailable("execute_contract_call", { chain_id: "101" })).toBe(true);
    expect(isWriteUnavailable("execute_contract_call", { chain_id: "solana-mainnet" })).toBe(true);
    expect(isWriteUnavailable("execute_contract_call", { chain_id: "1" })).toBe(false);
    expect(isWriteUnavailable("execute_contract_call", { function_name: "x" })).toBe(false);
    expect(
      isWriteUnavailable("execute_protocol_action", { actionType: "web3/transfer-token" }),
    ).toBe(false);
  });

  it("execute_transfer: EVM simulates, Solana is no-preview but NEVER unavailable (AC 2, D28)", () => {
    // An EVM transfer dry-run simulates (mirrors the contract call).
    expect(isSimulatable("execute_transfer", { chain_id: "11155111", to_address: "0x", amount: "1" })).toBe(true);
    // A Solana transfer cannot be simulated → no-preview...
    expect(isSimulatable("execute_transfer", { chain_id: "101", to_address: "So1", amount: "1" })).toBe(false);
    // ...but a Solana transfer BROADCASTS (unlike a Solana contract call), so it is
    // NEVER write-unavailable — the Solana bespoke card is a confirmable no-preview card.
    expect(isWriteUnavailable("execute_transfer", { chain_id: "101" })).toBe(false);
    expect(isWriteUnavailable("execute_transfer", { chain_id: "1" })).toBe(false);
  });
});

describe("resolveProposedState — the D20 proposed-card refinement (state identity is DATA)", () => {
  const loading: PreviewState = { status: "loading" };
  const simulated: PreviewState = { status: "simulated", preview: {}, wouldRevert: false };
  const wouldRevert: PreviewState = { status: "simulated", preview: {}, wouldRevert: true };
  const noPreview: PreviewState = { status: "no-preview" };
  const needsCred: PreviewState = { status: "needs-credential", message: "needs web3" };
  const error: PreviewState = { status: "error", message: "boom" };

  it("a needs-credential fetch result OVERRIDES to the setup pre-state — confirm disabled (any op)", () => {
    // Credential binding is dynamic server state, not op identity; a gated op needs
    // setup before confirm (project-context.md:181; Story 2.1 D8).
    for (const simulatable of [true, false]) {
      const r = resolveProposedState({ simulatable, preview: needsCred });
      expect(r.key).toBe("needs-credential");
      expect(r.chip).toBe("Needs credential");
      expect(r.canConfirm).toBe(false);
    }
  });

  it("a simulatable op is 'proposed' until the decoded preview lands, then 'simulated' — confirm waits for it (AC1)", () => {
    const pending = resolveProposedState({ simulatable: true, preview: loading });
    expect(pending.key).toBe("proposed");
    expect(pending.chip).toBe("Proposed");
    expect(pending.canConfirm).toBe(false); // confirm only after the preview lands

    const landed = resolveProposedState({ simulatable: true, preview: simulated });
    expect(landed.key).toBe("simulated");
    expect(landed.chip).toBe("Simulated");
    expect(landed.canConfirm).toBe(true);
    expect(landed.needsRevertAck).toBe(false);
  });

  it("a simulatable op that would revert requires the explicit ack before confirm arms (D1)", () => {
    const r = resolveProposedState({ simulatable: true, preview: wouldRevert });
    expect(r.key).toBe("simulated");
    expect(r.needsRevertAck).toBe(true);
  });

  it("an EDITED amount shows the `edited` chip while it re-derives, then STAYS edited with Confirm (Story 2.5, Task 4)", () => {
    // While re-simulating (loading) the chip is `edited`, live-bordered, Confirm off.
    const rederiving = resolveProposedState({ simulatable: true, preview: loading, edited: true });
    expect(rederiving.key).toBe("edited");
    expect(rederiving.chip).toBe("Edited");
    expect(rederiving.live).toBe(true);
    expect(rederiving.canConfirm).toBe(false);
    // Once the re-derived preview lands, the chip STAYS `edited` (distinct from an
    // un-edited `simulated`) and Confirm is re-offered.
    const landed = resolveProposedState({ simulatable: true, preview: simulated, edited: true });
    expect(landed.key).toBe("edited");
    expect(landed.canConfirm).toBe(true);
    // A no-preview op (Solana) edited: `edited` chip, Confirm from data.
    const solEdited = resolveProposedState({ simulatable: false, preview: noPreview, edited: true });
    expect(solEdited.key).toBe("edited");
    expect(solEdited.canConfirm).toBe(true);
  });

  it("a simulatable op whose preview errors stays 'proposed', confirm disabled (never confirm the un-previewable)", () => {
    const r = resolveProposedState({ simulatable: true, preview: error });
    expect(r.key).toBe("proposed");
    expect(r.canConfirm).toBe(false);
  });

  it("a no-preview op resolves 'no-preview' FROM DATA — confirm enabled immediately, no fetch dependency (D20, DESIGN.md:409)", () => {
    // The identity + confirm-ability come from the operation, not the fetch: a
    // loading/absent/errored fetch never un-knows the no-preview state.
    for (const preview of [loading, noPreview, error]) {
      const r = resolveProposedState({ simulatable: false, preview });
      expect(r.key).toBe("no-preview");
      expect(r.chip).toBe("No preview");
      expect(r.canConfirm).toBe(true);
      expect(r.needsRevertAck).toBe(false);
    }
  });

  it("a write-unavailable op (Solana contract call) keeps the no-preview chip but Confirm is DISABLED, over every fetch result (P1)", () => {
    // isWriteUnavailable wins over the fetch (even a needs-credential result): the
    // server refuses it, so the card never offers a Confirm it would reject.
    for (const preview of [loading, noPreview, error, needsCred]) {
      const r = resolveProposedState({ simulatable: false, unavailable: true, preview });
      expect(r.key).toBe("no-preview");
      expect(r.chip).toBe("No preview");
      expect(r.canConfirm).toBe(false);
      expect(r.needsRevertAck).toBe(false);
    }
  });
});
