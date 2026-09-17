/*
 * Pure value formatting for read cards (Story 1.4). Money and machine truth —
 * amounts, addresses, hashes — render in mono with tabular numerals; addresses
 * truncate in the middle and never announce raw hex. No JSX here so it is unit
 * tested directly in node (tests/cards).
 */
import { englishTranslate, type Translate } from "@/lib/i18n/translate";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_HASH = /^0x[0-9a-fA-F]{64}$/;
// Any all-digit string is a base-unit amount / count / block number — render it
// mono+tabular like a JSON number, so "0"/"42" match "100000000000000000"
// instead of falling to proportional text.
const INTEGERISH = /^-?\d+$/;

export type ValueKind = "address" | "hash" | "number" | "boolean" | "text";

export function classifyScalar(value: string | number | boolean): ValueKind {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (HEX_ADDRESS.test(value)) return "address";
  if (HEX_HASH.test(value)) return "hash";
  if (INTEGERISH.test(value)) return "number";
  return "text";
}

export function shortMiddle(value: string, head = 6, tail = 4): string {
  return value.length > head + tail + 1
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;
}

/** snake_case / camelCase / kebab-case → sentence-case words; drops a leading _. */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (spaced === "") return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Announce an address by its last four, never spelled hex (a11y floor 4.1.3). */
export function addressAnnouncement(value: string, t: Translate = englishTranslate): string {
  return t("cards.format.addressEnding", { last: value.slice(-4) });
}

export function hashAnnouncement(value: string, t: Translate = englishTranslate): string {
  return t("cards.format.hashEnding", { last: value.slice(-4) });
}
