/*
 * Reading KeeperHub read results for the cards, free of React so it runs under
 * node tests and on the server.
 *
 * A protocol read comes back as { success, result, addressLink }, the contract's
 * named outputs under `result` (KeeperHub plugins/web3/steps/read-contract-core.ts:330-340
 * @ 946eeb5c9). A plugin step such as web3/check-balance returns its fields at
 * the top level.
 */

type Loose = Record<string, unknown>;

function isRecord(value: unknown): value is Loose {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The part of a read worth showing: the contract's outputs, or the step's fields without the success flag. */
export function readResult(data: unknown): unknown {
  if (!isRecord(data)) return data;
  if (data.success === true && "result" in data) return data.result;
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => key !== "success" && !(key === "error" && (value === undefined || value === null || value === "")),
    ),
  );
}

/** The explorer link to the contract a protocol read called, when KeeperHub gave one. */
export function contractLink(data: unknown): string | undefined {
  if (!isRecord(data) || data.success !== true || !("result" in data)) return undefined;
  const link = data.addressLink;
  return typeof link === "string" && /^https?:\/\//.test(link) ? link : undefined;
}

export function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

function toSafeInt(value: unknown): number | null {
  const big = toBigInt(value);
  return big === null || big > BigInt(Number.MAX_SAFE_INTEGER) || big < 0n ? null : Number(big);
}

/** One Chainlink round (latestRoundData / getRoundData). */
export type RoundReading = { roundId: bigint; answer: bigint; updatedAt: number };

export function readRound(data: unknown): RoundReading | null {
  const source = readResult(data);
  if (!isRecord(source)) return null;
  const roundId = toBigInt(source.roundId);
  const answer = toBigInt(source.answer);
  const updatedAt = toSafeInt(source.updatedAt);
  // A round that never happened reads back as zeros rather than reverting on some feeds.
  if (roundId === null || answer === null || updatedAt === null || updatedAt === 0) return null;
  return { roundId, answer, updatedAt };
}

/** A feed's decimals action: `{ decimals }` under result, or the bare value. */
export function readDecimals(data: unknown): number | null {
  const source = readResult(data);
  const value = isRecord(source) ? source.decimals : source;
  const decimals = toSafeInt(value);
  return decimals !== null && decimals <= 36 ? decimals : null;
}

export type BalanceReading = { address: string; raw: bigint; decimals: number; symbol?: string };

export const BALANCE_OPS = new Set(["web3/check-balance", "web3/check-token-balance"]);

/**
 * A balance read in raw units. The native balance takes its decimals from the
 * network (`nativeDecimals`); a token balance carries its own. Anything
 * unexpected returns null and the card falls back to the generic result.
 */
export function readBalance(opId: string, data: unknown, nativeDecimals: number | undefined): BalanceReading | null {
  const source = readResult(data);
  if (!isRecord(source) || typeof source.address !== "string" || source.address === "") return null;
  if (opId === "web3/check-balance") {
    const raw = toBigInt(source.balanceWei);
    if (raw === null || nativeDecimals === undefined) return null;
    return { address: source.address, raw, decimals: nativeDecimals };
  }
  if (opId === "web3/check-token-balance" && isRecord(source.balance)) {
    const raw = toBigInt(source.balance.balanceRaw);
    const decimals = toSafeInt(source.balance.decimals);
    if (raw === null || decimals === null) return null;
    const symbol = source.balance.symbol;
    return { address: source.address, raw, decimals, ...(typeof symbol === "string" && symbol !== "" ? { symbol } : {}) };
  }
  return null;
}
