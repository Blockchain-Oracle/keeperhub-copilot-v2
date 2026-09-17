/*
 * The ONE decimals-aware amount module (Story 2.5, D26 / AD-11). Amounts are
 * exact decimal STRINGS end to end; the base<->human conversion is BigInt divmod,
 * never JS floating point — a `Number` cast never touches an amount (a float
 * literally cannot appear in this path). Human units surface ONLY at the render edge; the
 * wire format per route is respected upstream (a transfer's `amount` is already
 * human, an ERC-20 approve allowance is base units — D25/D26). JSX-free so it
 * unit-tests directly in node, matching the format.ts / write-card.ts split.
 *
 * No token-metadata MCP tool exists (verified against the Aug-5 references/keeperhub
 * snapshot). An ERC-20's decimals + symbol are sourced, in priority order:
 *   (a) a simulate response's decoded fields,
 *   (b) a `decimals()` / `symbol()` view read via execute_contract_call, or
 *   (c) the small KNOWN_TOKENS table below.
 * If none resolves, resolveTokenMeta returns undefined and the card shows the
 * amount against the truncated token address rather than guess a unit — a wrong
 * unit is worse than an honest address (DESIGN.md:299).
 */
import { isSolanaChainId } from "@/lib/registry/simulatability";

/** DESIGN: every amount renders mono + tabular-nums, defined in ONE place. */
export const AMOUNT_CLASS = "font-mono tabular-nums";

export const NATIVE_DECIMALS_EVM = 18;
export const NATIVE_DECIMALS_SOLANA = 9;

export interface AmountMeta {
  readonly decimals: number;
  readonly symbol: string;
}

const INTEGER = /^-?\d+$/;
// Thousands grouping: a boundary with a multiple-of-three run of digits ahead.
const GROUP = /\B(?=(\d{3})+(?!\d))/g;

/**
 * A base-unit integer string -> a grouped, EXACT human string via BigInt divmod.
 * Value-preserving trailing fractional zeros are trimmed; the integer part is
 * grouped in threes. `formatBaseUnits("100000000000000000", 18)` -> "0.1";
 * `formatBaseUnits("0", 6)` -> "0"; `formatBaseUnits("25000000", 6)` -> "25".
 * Throws on a non-integer input — a float can never be formatted as an amount.
 */
export function formatBaseUnits(value: string, decimals: number): string {
  assertDecimals(decimals);
  if (!INTEGER.test(value)) {
    throw new RangeError(`amount must be a base-unit integer string, got "${value}"`);
  }
  const negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).replace(/^0+(?=\d)/, "");
  const padded = digits.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  const intPart = padded.slice(0, cut);
  const fracPart = decimals === 0 ? "" : padded.slice(cut).replace(/0+$/, "");
  const grouped = intPart.replace(GROUP, ",");
  const human = fracPart === "" ? grouped : `${grouped}.${fracPart}`;
  return negative && human !== "0" ? `-${human}` : human;
}

/**
 * A human decimal string -> a base-unit integer string via BigInt. Surrounding
 * whitespace is trimmed. A comma is refused, never stripped: "0,5" is a half in
 * many languages and must not become 5 (decision 40). MORE fractional digits than
 * the token's decimals is rejected (never silently truncated — that would lose
 * money). `parseHumanUnits("0.1", 18)` -> "100000000000000000". Never uses
 * floating point.
 */
export function parseHumanUnits(value: string, decimals: number): string {
  assertDecimals(decimals);
  const trimmed = value.trim();
  if (trimmed.includes(",")) {
    throw new RangeError(`use a dot for decimals and no thousands separators, got "${value}"`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  if (unsigned === "" || unsigned === "." || !/^\d*\.?\d*$/.test(unsigned)) {
    throw new RangeError(`amount must be a decimal string, got "${value}"`);
  }
  const [intPart = "", fracRaw = ""] = unsigned.split(".");
  if (fracRaw.length > decimals) {
    throw new RangeError(
      `amount has ${fracRaw.length} fractional digits but the token allows ${decimals}`,
    );
  }
  const base = BigInt(`${intPart || "0"}${fracRaw.padEnd(decimals, "0")}`);
  const rendered = base.toString();
  return negative && rendered !== "0" ? `-${rendered}` : rendered;
}

/** Native currency meta by chain: Solana -> SOL/9, every EVM chain -> ETH/18. */
export function nativeAmountMeta(chainId: string | undefined): AmountMeta {
  return isSolanaChainId(chainId)
    ? { decimals: NATIVE_DECIMALS_SOLANA, symbol: "SOL" }
    : { decimals: NATIVE_DECIMALS_EVM, symbol: "ETH" };
}

export interface TokenMetaCandidate {
  /** Decimals as decoded upstream — a number, or a string count from a read. */
  readonly decimals?: number | string;
  readonly symbol?: string;
}

/**
 * Tokens whose (decimals, symbol) are known and verified, keyed
 * `${chainId}:${address.toLowerCase()}`. Deliberately empty until an address is
 * verified for its chain — a wrong unit is worse than an honest truncated address,
 * and no token-metadata MCP tool exists to populate it automatically.
 */
export const KNOWN_TOKENS: Readonly<Record<string, AmountMeta>> = {};

/**
 * Resolve an ERC-20's (decimals, symbol) from the available sources in priority
 * order: an explicit decoded candidate (simulate fields / a `decimals()` +
 * `symbol()` view read) first, then the KNOWN_TOKENS table. Returns undefined
 * when neither yields BOTH a decimals and a symbol — the caller then shows the
 * amount against the truncated address, never a guessed unit.
 */
export function resolveTokenMeta(
  chainId: string | undefined,
  tokenAddress: string | undefined,
  candidate?: TokenMetaCandidate,
): AmountMeta | undefined {
  const decimals = coerceDecimals(candidate?.decimals);
  if (decimals !== undefined && candidate?.symbol) {
    return { decimals, symbol: candidate.symbol };
  }
  if (chainId !== undefined && tokenAddress !== undefined) {
    const known = KNOWN_TOKENS[`${chainId}:${tokenAddress.toLowerCase()}`];
    if (known !== undefined) {
      return known;
    }
  }
  return undefined;
}

/** Decimals is a small non-negative integer COUNT (never an amount). */
function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`);
  }
}

/** Coerce a decoded decimals COUNT (number or digit string) to a safe integer. */
function coerceDecimals(value: number | string | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  return undefined;
}
