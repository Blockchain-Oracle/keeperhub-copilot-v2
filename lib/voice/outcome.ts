import { readInputAnswer, readInputRequest, REQUEST_INPUT_TOOL } from "@/lib/chat/input-request";
import { getChain } from "@/lib/chains";

/*
 * What voice is told once a card it put on screen resolves (decision 26): one
 * plain line built from the tool part the chat now holds, never carrying an
 * address or hash to read aloud. Null while the card is still waiting or
 * sending. Pure, so the chat's watcher and the tests share it.
 *
 * A form (decision 33) is the exception: its line carries the exact values the
 * person entered, because voice has to use them. The voice rules already forbid
 * reading an address out loud.
 */

type LoosePart = { type?: unknown; state?: unknown; input?: unknown; output?: unknown; errorText?: unknown };

export function voiceOutcome(part: unknown): string | null {
  const loose = (part ?? {}) as LoosePart;
  if (typeof loose.type !== "string" || !loose.type.startsWith("tool-")) return null;
  const toolName = loose.type.slice("tool-".length);
  if (toolName === REQUEST_INPUT_TOOL) return formOutcome(loose);
  switch (loose.state) {
    case "output-denied":
      return "Outcome: the person cancelled the card. Nothing was done.";
    case "output-error":
      return `Outcome: the person authorized the card, but it could not run. ${plain(loose.errorText)}`;
    case "output-available":
      return `Outcome: the person authorized the card. ${resultLine(toolName, loose.output)}`;
    default:
      return null;
  }
}

function formOutcome(part: LoosePart): string | null {
  if (part.state === "output-error") return "The form could not be answered. Ask the person what they would like to do.";
  if (part.state !== "output-available") return null;
  const answer = readInputAnswer(part.output);
  if (answer === null) return null;
  if ("cancelled" in answer) {
    return "The person closed the form without filling it in. Nothing was done. Ask what they would like to do instead.";
  }
  const request = readInputRequest(part.input);
  const entries =
    request === null
      ? Object.entries(answer.values).map(([key, value]) => `${key}: ${value}`)
      : request.fields.flatMap((field) => {
          const value = answer.values[field.key];
          if (value === undefined) return [];
          if (field.kind === "network") return [`${field.label}: ${getChain(value).name} (chain id ${value})`];
          if (field.kind === "amount" && field.unit !== undefined) return [`${field.label}: ${value} ${field.unit}`];
          return [`${field.label}: ${value}`];
        });
  const filled = entries.length > 0 ? entries.join("; ") : "nothing optional was filled in";
  return `The person filled in the form. ${filled}. Carry on with their request using exactly these values.`;
}

function resultLine(toolName: string, output: unknown): string {
  const record = isRecord(output) ? output : {};
  if (record.ok === false) {
    const error = isRecord(record.error) ? record.error : {};
    return `It did not go through: ${plain(error.message)}`;
  }
  if (record.state !== "receipt") return "It completed.";
  const receipt = isRecord(record.receipt) ? record.receipt : {};
  switch (toolName) {
    case "create_automation":
      return "The automation was saved, switched off. Its card offers to turn it on.";
    case "update_automation":
      return "The changes to the automation were saved.";
    case "set_automation_enabled":
      return receipt.enabled === true ? "The automation is now on." : "The automation is now off.";
    case "run_automation":
      return "The run has started. Its card shows the result when it finishes.";
    case "delete_automation":
      return "The automation was deleted.";
    default:
      return "It went through, and KeeperHub confirmed it.";
  }
}

const LONG_HEX = /0x[0-9a-fA-F]{8,}/g;

function plain(value: unknown): string {
  const text = typeof value === "string" && value.trim() !== "" ? value.trim() : "No reason was given.";
  return text.replace(LONG_HEX, "(the value on the card)");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
