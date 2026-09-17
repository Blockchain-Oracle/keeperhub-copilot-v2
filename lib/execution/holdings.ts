import "server-only";

import { holdsSomething, type HeldChain } from "@/lib/holdings";
import type { AuthenticatedSession } from "@/lib/session";
import { fetchOrgWalletHoldings } from "@/lib/session/balance";
import { orgWallet } from "@/lib/session/org-wallet";

import type { ExecutionError } from "./index.ts";

/*
 * get_org_wallet_balances (decision 34): what the org wallet holds, the way
 * KeeperHub's own wallet page reads it (GET /api/user/wallet/balances), because
 * KeeperHub runs the web3 balance actions only inside automations (decision
 * 35). One network when asked, else every network holding something. A read:
 * it runs straight away and records nothing.
 */

const CHAIN_ID = /^\d{1,12}$/;

export type HoldingsOutput = {
  ok: true;
  tool: "get_org_wallet_balances";
  address: string | null;
  solanaAddress: string | null;
  network: string | null;
  chains: HeldChain[];
};

type HoldingsFailure = { ok: false; tool: "get_org_wallet_balances"; error: ExecutionError };

export async function runOrgWalletBalances(session: AuthenticatedSession, args: unknown): Promise<HoldingsOutput | HoldingsFailure> {
  const tool = "get_org_wallet_balances" as const;
  const raw = args !== null && typeof args === "object" ? (args as { network?: unknown }).network : undefined;
  const network = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  if (network !== null && !CHAIN_ID.test(network)) {
    return {
      ok: false,
      tool,
      error: {
        code: "validation_failed",
        message: "Give the network as a chain id, like 11155111.",
        issues: [{ path: "network", message: "Expected digits." }],
      },
    };
  }

  const [wallet, chains] = await Promise.all([orgWallet(session), fetchOrgWalletHoldings(session.accessToken)]);
  if (chains === null) {
    return {
      ok: false,
      tool,
      error: { code: "tool_error", message: "KeeperHub couldn't read the org wallet's balances just now. Try again in a moment." },
    };
  }

  if (network !== null) {
    const one = chains.filter((chain) => chain.chainId === network);
    if (one.length === 0) {
      return {
        ok: false,
        tool,
        error: {
          code: "validation_failed",
          message: `KeeperHub doesn't report the org wallet's balances on network ${network}. It covers the EVM networks it supports; Solana is not included.`,
        },
      };
    }
    return { ok: true, tool, address: wallet.evm, solanaAddress: wallet.solana, network, chains: one };
  }

  return {
    ok: true,
    tool,
    address: wallet.evm,
    solanaAddress: wallet.solana,
    network: null,
    chains: chains.filter((chain) => !chain.unavailable && holdsSomething(chain)),
  };
}
