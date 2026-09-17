import "server-only";

import { getAuthConfig } from "@/lib/config";
import type { HeldChain, HeldToken } from "@/lib/holdings";

/*
 * The org execution wallet's balances — the money pill, the account menu and
 * the assistant's holdings tool read them. Plain REST with the OAuth Bearer,
 * like identity.ts: KeeperHub's `GET /api/user/wallet/balances` accepts an
 * OAuth token, resolves the org from it, and reads native + ERC-20 balances for
 * every enabled EVM chain.
 *
 * Every failure degrades to null — an honest unavailable state, never a
 * fabricated number. That includes a per-chain RPC failure: the platform
 * zero-fills those entries and flags them with `error`, and a zero we cannot
 * trust must not be shown as a real balance.
 */

// The platform queries every enabled chain in parallel before answering.
const BALANCES_FETCH_TIMEOUT_MS = 15_000;

export type TokenBalance = HeldToken;
export type OrgWalletBalance = HeldChain;

function toTokens(raw: unknown, addressKey: "address" | "tokenAddress"): TokenBalance[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const tokens: TokenBalance[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const t = item as Record<string, unknown>;
    const tokenAddress = t[addressKey];
    if (
      typeof t.symbol === "string" &&
      typeof t.balance === "string" &&
      typeof tokenAddress === "string"
    ) {
      tokens.push({
        symbol: t.symbol,
        name: typeof t.name === "string" ? t.name : t.symbol,
        tokenAddress,
        balance: t.balance,
      });
    }
  }
  return tokens;
}

function toChain(entry: Record<string, unknown>): OrgWalletBalance | null {
  if (typeof entry.nativeBalance !== "string" || entry.chainId === undefined || entry.chainId === null) {
    return null;
  }
  const chainId = String(entry.chainId);
  return {
    chainId,
    chainName: typeof entry.chainName === "string" ? entry.chainName : chainId,
    symbol: typeof entry.symbol === "string" ? entry.symbol : "",
    isTestnet: entry.isTestnet === true,
    nativeBalance: entry.nativeBalance,
    tokens: [
      ...toTokens(entry.supportedTokens, "tokenAddress"),
      ...toTokens(entry.tokens, "address"),
    ],
    unavailable: typeof entry.error === "string",
  };
}

async function fetchBalanceEntries(accessToken: string): Promise<Record<string, unknown>[] | null> {
  try {
    const { KEEPERHUB_OAUTH_ISSUER } = getAuthConfig();
    const response = await fetch(
      `${KEEPERHUB_OAUTH_ISSUER}/api/user/wallet/balances`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(BALANCES_FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "org_wallet_balance_fetch_failed",
          status: response.status,
        }),
      );
      return null;
    }
    const body = (await response.json()) as { balances?: unknown };
    if (!Array.isArray(body.balances)) {
      return null;
    }
    return body.balances.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object",
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "org_wallet_balance_fetch_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

/** One network's balance, or null when it is absent or KeeperHub could not read it. */
export async function fetchOrgWalletBalance(
  accessToken: string,
  chainId: string,
): Promise<OrgWalletBalance | null> {
  const entries = await fetchBalanceEntries(accessToken);
  const entry = entries?.find((item) => String(item.chainId) === chainId);
  if (!entry || typeof entry.error === "string") {
    return null;
  }
  return toChain(entry);
}

/** Every network KeeperHub reports, each marked when it could not be read; null when the whole read failed. */
export async function fetchOrgWalletHoldings(accessToken: string): Promise<OrgWalletBalance[] | null> {
  const entries = await fetchBalanceEntries(accessToken);
  if (entries === null) {
    return null;
  }
  return entries.flatMap((entry) => toChain(entry) ?? []);
}
