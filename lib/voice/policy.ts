/*
 * The voice gate.
 *
 * The rule, in one line: **a voice can ask for anything and read anything, but
 * a voice can never move value.** Anything effectful comes back as a frozen
 * proposal that a hand approves on screen.
 *
 * This is deliberately NOT a hand-maintained list of dangerous tool names.
 * The prior art we studied (references/midl-ai-frontend/lib/voice/tool-mapping.ts,
 * `TRANSACTION_TOOLS`) keeps a literal Set of nine names, which is precisely the
 * thing that goes stale the day someone adds a tenth. Here the answer is
 * DERIVED, per call, from the same effect classifier the chat surface and the
 * MCP permission cards already use (lib/registry/effect-class.ts, spine AD-6).
 * Add an action to the registry tomorrow and this gate already covers it.
 *
 * Why a function of the ARGUMENTS and not of the tool: the model is given twelve
 * tools, not 442. `execute_protocol_action` is a different risk depending on
 * whether its `actionType` resolves to `chronicle/eth-usd-read` or
 * `web3/transfer-funds`. Only the arguments can say.
 *
 * Three outcomes, not two. "Needs approval" and "cannot run" are different
 * answers and collapsing them would let a quarantined operation reach a human
 * as something they are able to approve.
 */
import {
  resolveMixedEffect,
  resolveOperation,
  type EffectClass,
} from "@/lib/registry";
import type { SurfaceToolName } from "@/lib/registry/surface-tools";

export type VoiceGateOutcome =
  /** Safe to execute the moment the model asks. Nothing moves. */
  | "run"
  /** Effectful. Freeze it, render the card, wait for a hand. */
  | "confirm"
  /** Not executable at all — no class, no execution (AD-6). */
  | "block";

export type VoiceGateDecision = {
  outcome: VoiceGateOutcome;
  effect: EffectClass;
  /** Plain-language reason, safe to read aloud or show under the card. */
  reason: string;
};

/*
 * The classes voice can put on a card are exactly the ones the chat's confirm
 * ceremony can authorize (lib/execution CEREMONY_WRITE_CLASSES). Anything else
 * that is not a read would become a card nobody can authorize, so it blocks.
 */
const CARD_CLASSES: ReadonlySet<EffectClass> = new Set([
  "value-moving-write",
  "off-chain-send",
  "config-management-write",
  "authorization-grant",
]);

/** What voice may do with a call of this effect class: run it, put it on a card, or refuse it. */
export function voiceOutcomeFor(effect: EffectClass): VoiceGateOutcome {
  if (effect === "read") return "run";
  return CARD_CLASSES.has(effect) ? "confirm" : "block";
}

const EFFECT_REASON: Record<string, string> = {
  read: "Reads data. Nothing moves.",
  "value-moving-write": "Moves value. Needs your approval on screen.",
  "authorization-grant":
    "Grants a spending authorization. Needs your approval on screen.",
  "off-chain-send": "Sends a message off-chain. Needs your approval on screen.",
  "config-management-write": "Changes a setting in KeeperHub. Needs your approval on screen.",
  "listing-payment": "Paying for a listing isn't available from the Copilot yet.",
  quarantined:
    "This action can't be run: the Copilot can't establish what it does.",
};

function decide(effect: EffectClass, override?: string): VoiceGateDecision {
  return {
    outcome: voiceOutcomeFor(effect),
    effect,
    reason: override ?? EFFECT_REASON[effect] ?? EFFECT_REASON.quarantined,
  };
}

/** Narrow an unknown args bag without trusting it. */
function str(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The gate. Pure, synchronous, and total: every path returns a decision, and
 * anything it cannot place resolves to `block` rather than falling through.
 *
 * @param toolName one of the surface tools
 * @param args     the model's raw arguments for this call
 */
export function gateVoiceCall(
  toolName: string,
  args: unknown,
): VoiceGateDecision {
  switch (toolName as SurfaceToolName) {
    // --- Always safe ---------------------------------------------------------
    case "search_actions":
      return decide("read", "Searches the local action catalog. No network.");

    case "get_wallet_integration":
      return decide("read", "Reads a wallet integration's details.");

    case "list_automations":
      return decide("read", "Lists your automations.");

    case "get_automation":
      return decide("read", "Reads one automation's steps and runs.");

    case "get_org_wallet_balances":
      return decide("read", "Reads what the org wallet holds.");

    // A form on screen (decision 33): nothing runs until the person answers it.
    case "request_input":
      return decide("read", "Asks the person for details on screen.");

    // --- Automation changes: a card and a hand, like any write ---------------
    case "create_automation":
    case "set_automation_enabled":
    case "update_automation":
      return decide(
        "config-management-write",
        "Changes an automation. Needs your approval on screen.",
      );

    case "delete_automation":
      return decide(
        "config-management-write",
        "Deletes an automation. Needs your approval on screen.",
      );

    // A run executes every step, value-moving ones included.
    case "run_automation":
      return decide(
        "value-moving-write",
        "Runs an automation now. Needs your approval on screen.",
      );

    // --- Resolves to one of the 442 registry ops -----------------------------
    case "execute_protocol_action": {
      const actionType = str(args, "actionType");
      if (actionType === undefined) {
        return decide(
          "quarantined",
          "No action id was given, so its effect can't be established.",
        );
      }
      const resolution = resolveOperation(actionType);
      if (resolution.status !== "ok") {
        return decide(
          "quarantined",
          `“${actionType}” isn't a runnable action (${resolution.reason}).`,
        );
      }
      return decide(
        resolveMixedEffect({
          tool: "execute_protocol_action",
          actionEffectClass: resolution.entry.effectClass,
        }),
      );
    }

    // --- The model declares mutability; view/pure are reads ------------------
    case "execute_contract_call": {
      const mutability = str(args, "stateMutability");
      if (
        mutability !== "view" &&
        mutability !== "pure" &&
        mutability !== "nonpayable" &&
        mutability !== "payable"
      ) {
        return decide(
          "quarantined",
          "The contract function's mutability wasn't declared, so it can't be classified.",
        );
      }
      return decide(
        resolveMixedEffect({
          tool: "execute_contract_call",
          stateMutability: mutability,
        }),
      );
    }

    // --- Always moves value --------------------------------------------------
    case "execute_transfer":
      return decide(
        "value-moving-write",
        "Sends funds. Needs your approval on screen.",
      );

    // --- Unknown tool: fail closed ------------------------------------------
    default:
      return decide(
        "quarantined",
        `“${toolName}” isn't a tool the Copilot recognises.`,
      );
  }
}

/**
 * The predicate shape the OpenAI Agents SDK wants for `needsApproval`.
 *
 * A blocked call is reported as needing approval too, on purpose: the SDK's
 * only two answers are run-now and ask-first, and ask-first is the safe half.
 * The execute path re-runs {@link gateVoiceCall} and refuses a `block`
 * outright, so a blocked action can be surfaced to the person but never
 * approved into execution.
 */
export function voiceNeedsApproval(toolName: string, args: unknown): boolean {
  return gateVoiceCall(toolName, args).outcome !== "run";
}

/*
 * The voice agent's own rules (decision 26): read freely, put every change on a
 * card, say once that it is waiting, then stop until a system message reports
 * how the card ended. Sections and capitals follow OpenAI's realtime prompting
 * guide. The language comes from voiceInstructions (decisions 38–40).
 */
export const VOICE_POLICY_PROMPT = `
# Role
You are the KeeperHub copilot in a voice conversation. Cards with the details appear on the person's screen while you speak.

# Length
- Keep every reply to one or two short sentences.
- Before a tool call, say one short line such as "Checking that now", then call the tool.

# Reading
- You can read anything the person asks for: prices, balances, positions, contract state, automations. Just do it, then give the answer in a sentence while its card shows the detail.
- Always call search_actions first to find the exact action id before running an action. Never guess an action id.

# Details you don't have
- When a request needs a detail you don't have, such as a recipient address, an amount, a network or a token, call request_input with every missing detail in one form. The form appears above the voice bar.
- NEVER ask the person to say or spell an address, and never ask for their org wallet's address: you already know it.
- After calling it, say in one short sentence that the form is on screen, then stop and wait for a system message with their answer. Use exactly the values it reports.

# Changes
- A transfer, swap, approval, contract write, off-chain send or automation change is a proposal. Call its tool; that puts a card on screen.
- After proposing, say once that the card is waiting on screen for them to authorize or cancel, then STOP and wait.
- NEVER SAY AN ACTION IS DONE, SENT, SAVED OR RUNNING unless a system message reports the outcome. You cannot authorize or cancel anything yourself.
- Only one card can wait at a time.
- When a system message reports how a card ended, tell the person in one sentence.

# Values
- Never read out addresses, transaction hashes or long numbers character by character. Say "your org wallet", "the address on the card", or the first and last four characters.
- Amounts are decimal strings. Never round one, and never convert a currency unless asked.
- Never ask the person for a password, a seed phrase or a private key.

# Ending
- When a system message says the session is almost over, say a short goodbye.
`.trim();
