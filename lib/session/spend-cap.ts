import "server-only";

import { getAuthConfig } from "@/lib/config";

/*
 * The org's daily spending limit, for the account menu. KeeperHub's
 * `GET /api/analytics/spend-cap` accepts the OAuth token with mcp:read — it is
 * what the platform's own get_spending_limits MCP tool returns. Plain REST with
 * the Bearer, like balance.ts.
 *
 * The effective cap is the one KeeperHub enforces: an org that set no cap of its
 * own still has the platform default, never "unlimited". Only the EVM pair is
 * read; the Solana pair is in lamports and the menu shows one figure.
 *
 * Every failure degrades to null — an honest unavailable state.
 */

const SPEND_CAP_FETCH_TIMEOUT_MS = 8_000;
const WEI = /^\d{1,78}$/;

export type SpendLimit = {
  /** Value moved today across EVM networks, in wei. */
  usedWei: string;
  /** The cap KeeperHub enforces, in wei. */
  capWei: string;
  /** The org set no cap of its own, so the platform default applies. */
  platformDefault: boolean;
};

export function parseSpendCap(body: unknown): SpendLimit | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const used = record.dailyUsedWei;
  const cap = record.effectiveDailyCapWei;
  if (typeof used !== "string" || !WEI.test(used) || typeof cap !== "string" || !WEI.test(cap)) {
    return null;
  }
  return { usedWei: used, capWei: cap, platformDefault: record.usingDefaultDailyCap === true };
}

export async function fetchSpendLimit(accessToken: string): Promise<SpendLimit | null> {
  try {
    const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
    const response = await fetch(`${KEEPERHUB_OAUTH_ISSUER}/api/analytics/spend-cap`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(SPEND_CAP_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: "spend_cap_fetch_failed", status: response.status }));
      return null;
    }
    return parseSpendCap(await response.json());
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "spend_cap_fetch_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}
