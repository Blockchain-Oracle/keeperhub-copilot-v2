/*
 * The bespoke money-mover views (Story 2.5, D27). A PURE, JSX-free classifier +
 * layout builder that SPECIALIZES the generic write card for the value-movers:
 * native + ERC-20 + Solana transfers and the ERC-20 approve. It produces the
 * bespoke title, the effect-class header meta, and decimals-aware field rows (the
 * amount via the ONE money module — a float never touches it, AD-11). Selection is
 * a deterministic function of tool + input — the MODEL never selects (AD-12).
 * Anything it does not recognize, or ANY malformed input / formatting throw,
 * returns undefined so the card degrades to the GENERIC write card (still
 * confirmable — the honest exact instruction), never a broken render (AD-12).
 *
 * Swap / lending / a generic contract write are deliberately NOT specialized here:
 * the registry already gives them a good label + param rows, and no token-metadata
 * source lets us convert their protocol-specific amounts to human units without
 * guessing a unit (DESIGN.md:299) — so they render on the generic write card.
 * Unit-tested directly in node (tests/cards/money-mover.test.ts).
 */
import { englishTranslate, type Translate } from "@/lib/i18n/translate";
import { isSolanaChainId } from "@/lib/registry/simulatability";

import {
  formatBaseUnits,
  nativeAmountMeta,
  parseHumanUnits,
  resolveTokenMeta,
} from "./money.ts";
import type { RequestRow } from "./write-card.ts";

export type MoneyMoverFamily =
  | "native-transfer"
  | "token-transfer"
  | "solana-transfer"
  | "approve";

export type MoneyMoverView = {
  family: MoneyMoverFamily;
  title: string;
  /** Header meta: "<chain> · <effect class>". */
  meta: string;
  rows: RequestRow[];
  /** The receipt lead line ("Sent 0.1 ETH to 0x…7238."). */
  summary?: string;
  /** A plainly-worded risk flag (approve: an unlimited allowance). */
  warning?: string;
  /** The in-card editable amount (Story 2.5, Task 4): the current human value + its
   *  decimals for validation. Present ONLY for a transfer (its wire amount is human);
   *  an approve's allowance is base units with no decimals source, so it is read-only. */
  amountEdit?: { value: string; decimals?: number };
};

// The uint256 max is the canonical "unlimited" ERC-20 allowance; anything at or
// above 2^255 is a "very large" allowance a person almost never intends — both are
// flagged plainly (the specific danger a token-movement simulation cannot see).
const MAX_UINT256 = 2n ** 256n - 1n;
const VERY_LARGE = 2n ** 255n;

const CHAIN_NAMES: Record<string, string> = {
  "1": "Ethereum",
  "8453": "Base",
  "11155111": "Sepolia",
  "84532": "Base Sepolia",
  "101": "Solana",
  "102": "Solana testnet",
  "103": "Solana devnet",
};

/** A human network name for the header meta; an honest "Chain <id>" fallback for
 *  a supported-but-unnamed chain (never a guessed name). */
export function chainName(chainId: string | undefined, t: Translate = englishTranslate): string {
  if (chainId === undefined || chainId === "") return t("cards.moneyMover.unknownNetwork");
  return CHAIN_NAMES[chainId] ?? t("cards.moneyMover.chain", { id: chainId });
}

// The effect-class header labels verbatim per DESIGN (e.g. "value-moving write",
// keeping the adjective hyphen). Every write card shows its effect class in the
// meta (DESIGN.md:363); swap/lending/contract writes get it here even though their
// amounts stay on the generic card (no token-metadata source to convert them).
const EFFECT_CLASS_LABELS: Record<string, string> = {
  "value-moving-write": "valueMovingWrite",
  "authorization-grant": "authorizationGrant",
  "config-management-write": "configManagementWrite",
  "off-chain-send": "offChainSend",
  "listing-payment": "listingPayment",
  read: "read",
};

/** A copy-law effect-class label for a write card's header meta. */
export function effectClassLabel(effectClass: string, t: Translate = englishTranslate): string {
  const key = EFFECT_CLASS_LABELS[effectClass];
  return key !== undefined ? t(`cards.effectClass.${key}`) : effectClass.replace(/-/g, " ");
}

/**
 * The bespoke money-mover view, or undefined when the write is not a specialized
 * money-mover (→ the generic write card). TOTAL: any unexpected shape or a
 * formatting throw is caught and returns undefined, so a bespoke fault degrades to
 * the generic card, never a broken render (AD-12 fault isolation).
 */
export function buildMoneyMoverView(
  toolName: string,
  input: unknown,
  t: Translate = englishTranslate,
): MoneyMoverView | undefined {
  try {
    if (input === null || typeof input !== "object") return undefined;
    const record = input as Record<string, unknown>;
    if (toolName === "execute_transfer") {
      return transferView(record, t);
    }
    if (toolName === "execute_contract_call" && str(record.function_name) === "approve") {
      return approveView(record, t);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function transferView(record: Record<string, unknown>, t: Translate): MoneyMoverView | undefined {
  const chainId = str(record.chain_id);
  const toAddress = str(record.to_address);
  const amount = str(record.amount);
  if (chainId === undefined || toAddress === undefined || amount === undefined) {
    return undefined;
  }
  const tokenAddress = str(record.token_address);
  const solana = isSolanaChainId(chainId);
  const family: MoneyMoverFamily = solana
    ? "solana-transfer"
    : tokenAddress !== undefined
      ? "token-transfer"
      : "native-transfer";

  // The unit + decimals: native from constants; a token from resolveTokenMeta
  // (undefined at proposal time → show the amount against the truncated token
  // address, never a guessed symbol — DESIGN.md:299).
  const meta =
    tokenAddress !== undefined
      ? resolveTokenMeta(chainId, tokenAddress)
      : nativeAmountMeta(chainId);
  const unit = meta?.symbol;
  const human = normalizeHuman(amount, meta?.decimals);

  const rows: RequestRow[] = [
    { key: "amount", label: t("cards.labels.amount"), value: amount, display: { kind: "amount", human, unit } },
  ];
  if (tokenAddress !== undefined) {
    rows.push({ key: "token", label: t("cards.labels.token"), value: tokenAddress, display: { kind: "address" } });
  }
  rows.push(
    { key: "to_address", label: t("cards.labels.recipient"), value: toAddress, display: { kind: "address" } },
    { key: "network", label: t("cards.labels.network"), value: chainName(chainId, t), display: { kind: "text" } },
  );

  const unitText = unit !== undefined ? ` ${unit}` : "";
  return {
    family,
    title: t("cards.moneyMover.send"),
    meta: `${chainName(chainId, t)} · ${effectClassLabel("value-moving-write", t)}`,
    rows,
    summary: t("cards.moneyMover.summary", { amount: `${human}${unitText}`, address: truncate(toAddress) }),
    // The transfer amount is the one in-card editable field (Task 4): it is human
    // on the wire, so an edit is direct (no base↔human conversion) and validated
    // against the token's decimals.
    amountEdit: { value: amount, decimals: meta?.decimals },
  };
}

function approveView(record: Record<string, unknown>, t: Translate): MoneyMoverView | undefined {
  const chainId = str(record.chain_id);
  const token = str(record.contract_address);
  if (chainId === undefined || token === undefined) return undefined;
  const [spender, allowanceRaw] = parseArgs(record.function_args);

  const rows: RequestRow[] = [
    { key: "token", label: t("cards.labels.token"), value: token, display: { kind: "address" } },
  ];
  if (spender !== undefined) {
    rows.push({ key: "spender", label: t("cards.labels.spender"), value: spender, display: { kind: "address" } });
  }
  let warning: string | undefined;
  if (allowanceRaw !== undefined) {
    const allowance = safeBigInt(allowanceRaw);
    const unlimited = allowance !== undefined && allowance >= VERY_LARGE;
    if (unlimited) {
      warning = t("cards.moneyMover.unlimitedWarning");
      const size = allowance === MAX_UINT256 ? t("cards.moneyMover.unlimited") : t("cards.moneyMover.veryLarge");
      rows.push({
        key: "allowance",
        label: t("cards.labels.allowance"),
        value: size,
        display: { kind: "amount", human: size },
      });
    } else {
      // No token decimals are known at proposal time (no token-metadata tool), so
      // the EXACT base-unit allowance is shown mono — honest, never a guessed unit.
      rows.push({
        key: "allowance",
        label: t("cards.labels.allowanceBaseUnits"),
        value: allowanceRaw,
        display: { kind: "amount", human: allowanceRaw },
      });
    }
  }
  return {
    family: "approve",
    title: t("cards.moneyMover.approve"),
    meta: `${chainName(chainId, t)} · ${effectClassLabel("authorization-grant", t)}`,
    rows,
    warning,
  };
}

// --- helpers -----------------------------------------------------------------

/** Normalize a human amount for display: group/trim via the money module when the
 *  decimals are known (a base↔human round-trip), else show it as given. Never throws. */
function normalizeHuman(amount: string, decimals: number | undefined): string {
  if (decimals === undefined) return amount;
  try {
    return formatBaseUnits(parseHumanUnits(amount, decimals), decimals);
  } catch {
    return amount;
  }
}

/** The [spender, allowance] pair from an approve's function_args JSON string. */
function parseArgs(value: unknown): [string | undefined, string | undefined] {
  const raw = str(value);
  if (raw === undefined) return [undefined, undefined];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return [asArgString(parsed[0]), asArgString(parsed[1])];
    }
  } catch {
    // not JSON — no structured args to show
  }
  return [undefined, undefined];
}

function asArgString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function safeBigInt(value: string): bigint | undefined {
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function truncate(value: string): string {
  return value.length > 11 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

// --- in-card amount editing (Task 4) -----------------------------------------

/**
 * Validate a human amount draft for the editable money-mover amount (Task 4): a
 * non-empty decimal with no more than `decimals` fractional digits, and never a
 * float (the money module parses via BigInt). Returns a copy-law error message or
 * undefined. Decimals default to 18 (the common EVM/ERC-20 max) when unknown.
 */
export function validateAmountDraft(
  value: string,
  decimals: number | undefined,
  t: Translate = englishTranslate,
): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return t("cards.moneyMover.enterAmount");
  }
  if (trimmed.includes(",")) {
    return t("cards.moneyMover.noComma");
  }
  try {
    parseHumanUnits(trimmed, decimals ?? 18);
    return undefined;
  } catch {
    return decimals !== undefined
      ? t("cards.moneyMover.maxDecimals", { decimals: String(decimals) })
      : t("cards.checks.amountDot");
  }
}

/**
 * The edited tool input for a confirmed amount edit (Task 4): the original input
 * with only the human `amount` replaced. ONLY a transfer is editable in-card; any
 * other tool returns the input unchanged (the server also rejects a non-transfer
 * edit, so this is defence in depth). The op identity (chain, recipient, token) is
 * never touched here — an op-identity change retires + re-proposes (D28).
 */
export function buildEditedTransferInput(
  toolName: string,
  input: unknown,
  draftAmount: string,
): unknown {
  if (toolName !== "execute_transfer" || input === null || typeof input !== "object") {
    return input;
  }
  return { ...(input as Record<string, unknown>), amount: draftAmount.trim() };
}
