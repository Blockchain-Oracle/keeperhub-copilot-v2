/*
 * Display formatting for money and machine truth. Pure, no JSX.
 *
 *   formatBaseUnits, formatUtc     masayume packages/core/src/units/{format,display}.ts
 *   formatAddress, shortenDigest   deepbookie apps/web/src/lib/format.ts
 *
 * Amounts never touch a float: base units in, decimal string out.
 */

export interface FormatBaseUnitsOptions {
  maxDp?: number;
  minDp?: number;
  signed?: boolean;
  group?: boolean;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Renders base units as a decimal string without ever touching a float; truncates (never rounds) past `maxDp`. */
export function formatBaseUnits(value: bigint, decimals: number, options: FormatBaseUnitsOptions = {}): string {
  const { maxDp = 2, minDp = 2, signed = false, group = true } = options;
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const one = 10n ** BigInt(decimals);
  const whole = (magnitude / one).toString();
  const fractionDigits = (magnitude % one).toString().padStart(decimals, "0");
  let fraction = fractionDigits.slice(0, Math.min(maxDp, decimals)).replace(/0+$/, "");
  if (fraction.length < minDp) fraction = fraction.padEnd(minDp, "0");
  const wholeText = group ? groupThousands(whole) : whole;
  const body = fraction.length > 0 ? `${wholeText}.${fraction}` : wholeText;
  if (negative) return `-${body}`;
  return signed && value > 0n ? `+${body}` : body;
}

/**
 * A decimal string someone else already formatted ("0.042100000000000000", as
 * KeeperHub returns balances) through the same no-float path. Anything that is
 * not a plain decimal comes back null so the caller shows unavailable, not a guess.
 */
export function formatDecimalString(value: string, options: FormatBaseUnitsOptions = {}): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  return formatBaseUnits(BigInt(`${sign}${whole}${fraction}`), fraction.length, options);
}

/** 0x7a3f…4e21 — the address/id treatment used everywhere in the design. */
export function formatAddress(addr?: string | null, lead = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

export function shortenDigest(digest: string, lead = 8, tail = 6): string {
  return formatAddress(digest, lead, tail);
}

export interface FormatUtcOptions {
  withSeconds?: boolean;
  withDate?: boolean;
}

/** Absolute UTC for anything screenshotable — never a relative time that goes stale in an image. */
export function formatUtc(ms: number, { withSeconds = true, withDate = false }: FormatUtcOptions = {}): string {
  const iso = new Date(ms).toISOString();
  const time = withSeconds ? iso.slice(11, 19) : iso.slice(11, 16);
  return withDate ? `${iso.slice(0, 10)} ${time} UTC` : `${time} UTC`;
}
