import type { ChainId } from "@/lib/chains";

/*
 * The network picked in the header's network pill. It lives in a cookie so the
 * server reads the same choice the header shows: the chat route tells the
 * model, and write cards default to it.
 *
 * Base Sepolia until someone picks: the first real transaction this app makes
 * is a zero-value self-transfer there, and a new org wallet holds nothing on a
 * mainnet.
 */
export const NETWORK_COOKIE_NAME = "kh_network";
export const NETWORK_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const DEFAULT_NETWORK_ID: ChainId = "84532";

const CHAIN_ID = /^\d{1,12}$/;

/** Any well-formed chain id is kept — the platform lists networks lib/chains does not name yet. */
export function parseNetworkCookie(value: string | null | undefined): ChainId {
  return value && CHAIN_ID.test(value) ? value : DEFAULT_NETWORK_ID;
}

/** For route handlers that have the raw request rather than next/headers. */
export function readNetworkFromCookieHeader(header: string | null): ChainId {
  if (!header) return DEFAULT_NETWORK_ID;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === NETWORK_COOKIE_NAME) {
      return parseNetworkCookie(part.slice(eq + 1).trim());
    }
  }
  return DEFAULT_NETWORK_ID;
}

export function serializeNetworkCookie(chainId: ChainId): string {
  return `${NETWORK_COOKIE_NAME}=${parseNetworkCookie(chainId)}; Path=/; Max-Age=${NETWORK_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
