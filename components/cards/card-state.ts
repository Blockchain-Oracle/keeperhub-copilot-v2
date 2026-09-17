/*
 * The card lifecycle state model (Story 2.4, D19/D20/D24) — JSX-free so it is
 * unit-tested directly in node (tests/cards/card-state.test.ts), the same split
 * as write-card.ts ↔ WriteCard.tsx and select-renderer.ts ↔ CardRenderer.tsx.
 *
 * This is the SINGLE place the FR7 vocabulary is named (D19): `FR7_STATES` is the
 * canonical, verbatim table, and this module owns the proposed-card refinement,
 * DERIVED FROM PERSISTED DATA — never a UI boolean (AC1; EXPERIENCE.md:101 "states
 * are data, never UI booleans"). The coarse persisted-part-state → plan kind mapping
 * that actually renders lives in `selectRenderer` (deterministic on part.state +
 * the server-set ToolOutput discriminator, AC3; the model never chooses).
 *   - resolveProposedState({ simulatable, unavailable, preview }): the D20 refinement WITHIN a
 *     proposed card. The `simulated | no-preview` identity is DATA (isSimulatable,
 *     a function of the operation), never the ephemeral /api/chat/simulate fetch;
 *     the fetch supplies only the decoded VALUES and the dynamic needs-credential
 *     override. A no-preview op enables Confirm immediately from data (DESIGN.md:409,
 *     no fetch dependency); a simulatable op keeps Confirm disabled until the
 *     decoded preview lands (AC1).
 *
 * FR7_STATES is the verbatim DESIGN.md:403-417 vocabulary: the chip label, the
 * DESIGN treatment (the accent-filled chip is sanctioned for confirmed/executing
 * ONLY — the one-accent law, DESIGN.md:255-257), and whether the card border is
 * "live" (DESIGN.md:346-347: proposed/edited/simulated/no-preview/needs-credential).
 */
import { isSimulatable, isWriteUnavailable } from "@/lib/registry/simulatability";

import { requiresRevertAck, type PreviewState } from "./write-card.ts";

export { isSimulatable, isWriteUnavailable };

/** The 13-key FR7 card-visual vocabulary + the `needs-credential` pre-state
 *  (ARCHITECTURE-SPINE.md:227, project-context.md:64-67, DESIGN.md:403-417). The
 *  canonical set 2.4 encodes; some triggers land in later stories (`edited` → 2.5,
 *  `expired` → Epic 3, `paid-but-failed` → Epic 6) but the vocabulary is complete. */
export type FR7StateKey =
  | "streaming"
  | "proposed"
  | "edited"
  | "simulated"
  | "no-preview"
  | "confirmed"
  | "executing"
  | "receipt"
  | "failure"
  | "paid-but-failed"
  | "declined"
  | "expired"
  | "needs-credential";

/** The StateChip visual treatment. `accent` is sanctioned ONLY for the
 *  confirmed/executing chips (DESIGN.md:255-257); `heavy` is the failure family
 *  (heavy ink, never a second hue / red). */
export type ChipTreatment = "default" | "heavy" | "accent";

export type FR7StateSpec = {
  /** The verbatim DESIGN.md:403-417 chip label (copy law). */
  chip: string;
  treatment: ChipTreatment;
  /** Whether the card borders `line-strong` (a live-actionable card) — DESIGN.md:346-347. */
  live: boolean;
};

export const FR7_STATES: Record<FR7StateKey, FR7StateSpec> = {
  streaming: { chip: "Streaming", treatment: "default", live: false },
  // The live-actionable, pre-confirm set (DESIGN.md:346-347).
  proposed: { chip: "Proposed", treatment: "default", live: true },
  edited: { chip: "Edited", treatment: "default", live: true },
  simulated: { chip: "Simulated", treatment: "default", live: true },
  "no-preview": { chip: "No preview", treatment: "default", live: true },
  "needs-credential": { chip: "Needs credential", treatment: "default", live: true },
  // Confirmed/executing carry the sanctioned accent chip (DESIGN.md:255-257) but
  // are NOT live-bordered (they are past the confirm point).
  confirmed: { chip: "Confirmed", treatment: "accent", live: false },
  executing: { chip: "Executing", treatment: "accent", live: false },
  // Terminals: receipt is quiet; the failure family is heavy ink (never red).
  receipt: { chip: "Receipt", treatment: "default", live: false },
  failure: { chip: "Failed", treatment: "heavy", live: false },
  "paid-but-failed": { chip: "Paid+failed", treatment: "heavy", live: false },
  declined: { chip: "Declined", treatment: "heavy", live: false },
  expired: { chip: "Expired", treatment: "heavy", live: false },
};

export type ResolvedCardState = FR7StateSpec & { key: FR7StateKey };

export type ProposedResolution = ResolvedCardState & {
  /** Whether Confirm is possible in this proposed state (AC1). */
  canConfirm: boolean;
  /** A predicted revert requires the explicit acknowledgement before Confirm arms (D1). */
  needsRevertAck: boolean;
};

/**
 * The proposed card's fine state (D20). The `simulated | no-preview` IDENTITY is
 * DATA (`simulatable`, a pure function of the operation), never the ephemeral
 * fetch. The `preview` (card-local /api/chat/simulate result) supplies only the
 * decoded VALUES and the dynamic `needs-credential` override:
 *   - unavailable (a Solana contract call, DATA) → the `no-preview` chip but Confirm
 *     DISABLED: the server refuses it this release, so the card never offers a Confirm
 *     it would reject (mirrors lib/execution; the Solana bespoke card is Story 2.5).
 *   - needs-credential (from the fetch) OVERRIDES to the setup pre-state, confirm
 *     disabled — credential binding is live server state, not op identity (D8).
 *   - a simulatable op is `proposed` until the decoded preview lands, then
 *     `simulated`; Confirm waits for it (AC1) + the revert-ack when it would revert.
 *   - a no-preview op resolves `no-preview` from data and enables Confirm
 *     IMMEDIATELY — no dependency on the fetch (DESIGN.md:409); a loading/absent/
 *     errored fetch never un-knows the no-preview identity.
 */
export function resolveProposedState(input: {
  simulatable: boolean;
  unavailable?: boolean;
  preview: PreviewState;
  /** Story 2.5 (Task 4): the person edited the amount in-card. The chip shows
   *  `edited` (live) while the simulation re-derives in place — ONE card, never a
   *  new card (surfaced-decision 1). Confirm still waits on the re-derived preview
   *  (a simulatable op) exactly as an un-edited proposal does. */
  edited?: boolean;
}): ProposedResolution {
  const { simulatable, unavailable, preview, edited } = input;
  // A write the server refuses outright (a Solana contract call — no dry-run, not
  // broadcastable this release; isWriteUnavailable mirrors lib/execution's refusal).
  // It stays a no-preview card by IDENTITY, but Confirm is DISABLED and the card says
  // why — never offer a Confirm the server will reject (AC1/AD-6; restores the pre-2.4
  // disabled-Confirm behavior). Wins over every fetch-derived override.
  if (unavailable) {
    return { ...specFor("no-preview"), canConfirm: false, needsRevertAck: false };
  }
  if (preview.status === "needs-credential") {
    return { ...specFor("needs-credential"), canConfirm: false, needsRevertAck: false };
  }
  if (simulatable) {
    const settled = preview.status === "simulated";
    // An edited card keeps the `edited` chip while it re-derives, then STAYS `edited`
    // with the re-derived preview + Confirm (EXPERIENCE.md:422) — distinct from an
    // un-edited `simulated`. Confirm still waits for the preview to settle (AC1).
    return {
      ...specFor(edited ? "edited" : settled ? "simulated" : "proposed"),
      canConfirm: settled,
      needsRevertAck: requiresRevertAck(preview),
    };
  }
  // A no-preview op (Solana / off-chain): editing shows `edited`; Confirm stays
  // enabled from data (no fetch dependency).
  return { ...specFor(edited ? "edited" : "no-preview"), canConfirm: true, needsRevertAck: false };
}

function specFor(key: FR7StateKey): ResolvedCardState {
  return { key, ...FR7_STATES[key] };
}
