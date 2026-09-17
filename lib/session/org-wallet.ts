import "server-only";

import { getAuthConfig } from "@/lib/config";

import { fetchOrgWalletAddress } from "./identity";
import type { OrgWallet } from "./org-wallet-prompt";

/*
 * The org execution wallet's addresses for the assistant's instructions
 * (decision 34). One call to KeeperHub's `GET /api/user/wallet`, which accepts
 * the OAuth token and returns the active wallet's EVM and Solana addresses
 * (fork app/api/user/wallet/route.ts:157-211); if that is refused, the two-call
 * integration lookup the account menu uses. Every chat turn and voice session
 * needs it, so it is kept per organisation for ten minutes (a miss for thirty
 * seconds, so a wallet made in KeeperHub shows up soon), one read at a time.
 * Never throws: an unreadable wallet is an honest null.
 */

const HIT_MS = 10 * 60_000;
const MISS_MS = 30_000;
const TIMEOUT_MS = 8_000;

const cached = new Map<string, { wallet: OrgWallet; expires: number }>();
const reading = new Map<string, Promise<OrgWallet>>();

export async function orgWallet(session: { orgId: string; accessToken: string }): Promise<OrgWallet> {
  const hit = cached.get(session.orgId);
  if (hit !== undefined && hit.expires > Date.now()) return hit.wallet;
  const running = reading.get(session.orgId);
  if (running !== undefined) return running;
  const read = readWallet(session.accessToken)
    .then((wallet) => {
      const found = wallet.evm !== null || wallet.solana !== null;
      cached.set(session.orgId, { wallet, expires: Date.now() + (found ? HIT_MS : MISS_MS) });
      return wallet;
    })
    .finally(() => reading.delete(session.orgId));
  reading.set(session.orgId, read);
  return read;
}

/** For tests: forget every kept wallet. */
export function forgetOrgWallets(): void {
  cached.clear();
  reading.clear();
}

async function readWallet(accessToken: string): Promise<OrgWallet> {
  try {
    const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
    const response = await fetch(`${KEEPERHUB_OAUTH_ISSUER}/api/user/wallet`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as { hasWallet?: unknown; walletAddress?: unknown; solanaAddress?: unknown };
      if (body.hasWallet === false) return { evm: null, solana: null };
      if (typeof body.walletAddress === "string" && body.walletAddress !== "") {
        return {
          evm: body.walletAddress,
          solana: typeof body.solanaAddress === "string" && body.solanaAddress !== "" ? body.solanaAddress : null,
        };
      }
    } else {
      console.error(JSON.stringify({ event: "org_wallet_read_refused", status: response.status }));
    }
  } catch (error) {
    console.error(
      JSON.stringify({ event: "org_wallet_read_failed", message: error instanceof Error ? error.message : String(error) }),
    );
  }
  return { evm: await fetchOrgWalletAddress(accessToken), solana: null };
}
