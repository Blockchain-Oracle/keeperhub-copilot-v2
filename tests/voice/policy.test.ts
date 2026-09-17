import { describe, expect, it } from "vitest";

import { voiceInstructions } from "@/lib/voice/instructions";
import { voiceOutcome } from "@/lib/voice/outcome";
import { gateVoiceCall, voiceNeedsApproval, voiceOutcomeFor, VOICE_POLICY_PROMPT } from "@/lib/voice/policy";

describe("what voice may do with a call", () => {
  it("runs reads, puts changes on a card, and blocks the rest", () => {
    expect(gateVoiceCall("search_actions", {}).outcome).toBe("run");
    expect(gateVoiceCall("list_automations", {}).outcome).toBe("run");
    expect(gateVoiceCall("execute_transfer", {}).outcome).toBe("confirm");
    expect(gateVoiceCall("execute_protocol_action", { actionType: "web3/transfer-funds" }).outcome).toBe("confirm");
    expect(gateVoiceCall("update_automation", {}).outcome).toBe("confirm");
    expect(gateVoiceCall("delete_automation", {}).outcome).toBe("confirm");
    expect(gateVoiceCall("run_automation", {})).toMatchObject({ outcome: "confirm", effect: "value-moving-write" });
    expect(gateVoiceCall("execute_protocol_action", { actionType: "nope/teleport" }).outcome).toBe("block");
    expect(gateVoiceCall("execute_contract_call", {}).outcome).toBe("block");
    expect(gateVoiceCall("teleport", {}).outcome).toBe("block");
    expect(voiceNeedsApproval("execute_transfer", {})).toBe(true);
    expect(voiceNeedsApproval("get_automation", {})).toBe(false);
  });

  it("only offers a card the chat's ceremony can authorize", () => {
    expect(voiceOutcomeFor("config-management-write")).toBe("confirm");
    expect(voiceOutcomeFor("authorization-grant")).toBe("confirm");
    expect(voiceOutcomeFor("listing-payment")).toBe("block");
    expect(voiceOutcomeFor("mixed-effect")).toBe("block");
    expect(voiceOutcomeFor("quarantined")).toBe("block");
  });
});

describe("the voice session's rules", () => {
  it("waits for the card, never claims it is done, and names the selected network", () => {
    expect(VOICE_POLICY_PROMPT).toContain("STOP and wait");
    expect(VOICE_POLICY_PROMPT).toContain("NEVER SAY AN ACTION IS DONE");
    expect(VOICE_POLICY_PROMPT).toContain("Never read out addresses");
    expect(voiceInstructions("84532")).toContain("Base Sepolia (chain id 84532)");
  });

  it("speaks the picked language, pinned, and English until one is picked (decisions 38–40)", () => {
    expect(VOICE_POLICY_PROMPT).not.toContain("English only");
    const japanese = voiceInstructions("84532", null, "ja");
    expect(japanese).toContain("# Language");
    expect(japanese).toContain("Reply only in Japanese (日本語)");
    expect(japanese).toContain("Do not switch language because of the person's accent");
    expect(voiceInstructions("84532")).toContain("Reply only in English,");
  });
});

describe("what voice hears when its card resolves", () => {
  const card = (state: string, output?: unknown, errorText?: string) => ({ type: "tool-execute_transfer", state, output, errorText });

  it("says nothing while the card waits or sends", () => {
    expect(voiceOutcome(card("approval-requested"))).toBeNull();
    expect(voiceOutcome(card("approval-responded"))).toBeNull();
    expect(voiceOutcome({ type: "text", text: "hi" })).toBeNull();
  });

  it("reports a cancel, a failure and a receipt in plain words, with no hash to read aloud", () => {
    expect(voiceOutcome(card("output-denied"))).toBe("Outcome: the person cancelled the card. Nothing was done.");
    expect(voiceOutcome(card("output-available", { ok: true, state: "receipt", txHash: "0xabc" }))).toBe(
      "Outcome: the person authorized the card. It went through, and KeeperHub confirmed it.",
    );
    const failed = voiceOutcome(card("output-available", { ok: false, error: { message: `Reverted at 0x${"a".repeat(40)}` } }));
    expect(failed).toContain("It did not go through: Reverted at (the value on the card)");
    expect(voiceOutcome(card("output-error", undefined, "timeout"))).toContain("could not run. timeout");
  });

  it("uses each automation change's own words", () => {
    const receipt = (type: string, receiptBody: unknown = {}) =>
      voiceOutcome({ type, state: "output-available", output: { ok: true, state: "receipt", receipt: receiptBody } });
    expect(receipt("tool-create_automation")).toContain("saved, switched off");
    expect(receipt("tool-set_automation_enabled", { enabled: true })).toContain("now on");
    expect(receipt("tool-run_automation")).toContain("run has started");
    expect(receipt("tool-delete_automation")).toContain("deleted");
  });
});
