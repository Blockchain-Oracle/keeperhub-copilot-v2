import "server-only";

import { cache } from "react";

import { getAuthConfig } from "@/lib/config";

/*
 * Identity display data (Task 6 / AC 2). "Who is signed in" has no whoami tool
 * on this platform — identity is the token's sub/org claims plus what the REST
 * surface verifiably returns. The one enrichment we fetch is the ORG EXECUTION
 * WALLET address (Turnkey-backed; executes workflows, receives creator
 * payouts) — never the x402 agentic payer wallet (6.3's separate plumbing),
 * and never a balance (that is the Inspector's job in a later story).
 *
 * This lives in the session layer, NOT lib/mcp/: it is plain REST with the
 * OAuth Bearer, and the MCP client (1.4) does not exist yet.
 */

// Bound each REST call so a slow/hung KeeperHub cannot stall the SSR render.
const IDENTITY_FETCH_TIMEOUT_MS = 8_000;

async function keeperhubGet(path: string, accessToken: string): Promise<Response> {
  const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
  return fetch(`${KEEPERHUB_OAUTH_ISSUER}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
    // SSRF guard (MCP-hardening convention) + always live for identity.
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(IDENTITY_FETCH_TIMEOUT_MS),
  });
}

/*
 * The org's active execution wallet address (canonical EIP-55) or null. Two
 * steps: list web3 integrations, then read the chosen one's authoritative
 * `walletAddress` (the active organization_wallets row). A throttle or outage
 * degrades to null — an honest absent state, never a fabricated address and
 * never a blocking error (settings must still render). mcp:read suffices.
 *
 * Wrapped in React cache() so repeated calls within one server request share
 * a single round-trip.
 */
export const fetchOrgWalletAddress = cache(
  async (accessToken: string): Promise<string | null> => {
    try {
      const listResponse = await keeperhubGet(
        "/api/integrations?type=web3",
        accessToken,
      );
      if (!listResponse.ok) {
        return null;
      }
      const rows: unknown = await listResponse.json();
      if (!Array.isArray(rows)) {
        return null;
      }
      // The list is already filtered by ?type=web3, so take the first
      // well-formed row rather than re-checking a `type` field the filtered
      // response may not echo back — requiring it would hide a present wallet.
      const web3 = rows.find(
        (row): row is { id?: unknown; address?: unknown } =>
          !!row && typeof row === "object",
      );
      if (!web3) {
        return null;
      }

      // Prefer the detail endpoint's authoritative active execution wallet.
      if (typeof web3.id === "string") {
        const detailResponse = await keeperhubGet(
          `/api/integrations/${encodeURIComponent(web3.id)}`,
          accessToken,
        );
        if (detailResponse.ok) {
          const detail = (await detailResponse.json()) as {
            walletAddress?: unknown;
          };
          if (typeof detail.walletAddress === "string") {
            return detail.walletAddress;
          }
        }
      }

      // Fall back to the list row's address (also canonical EIP-55).
      return typeof web3.address === "string" ? web3.address : null;
    } catch (error) {
      // Degrade to an honest absent state — but never silently. Surface the
      // reason so an outage/throttle is distinguishable from a genuinely absent
      // wallet in the logs (no-silent-catch / NFR2).
      console.error(
        JSON.stringify({
          event: "org_wallet_fetch_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  },
);
