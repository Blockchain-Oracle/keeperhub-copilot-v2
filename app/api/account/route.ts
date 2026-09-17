import { ulid } from "ulid";

import { getSession, type AuthenticatedSession } from "@/lib/session";
import {
  fetchOrgWalletBalance,
  type OrgWalletBalance,
} from "@/lib/session/balance";
import { fetchOrgWalletAddress } from "@/lib/session/identity";

/*
 * Who is signed in, the org execution wallet, and its balance on the network
 * the shell has selected (`?chainId=84532`). The header's money pill and the
 * account menu read this. The access token never leaves the server.
 *
 * Same envelope as the conversation routes: { error: { code, message } }.
 */
export const dynamic = "force-dynamic";

const CHAIN_ID = /^\d{1,12}$/;

export type AccountBalance =
  | { status: "ok"; balance: OrgWalletBalance }
  /** No network was asked for. */
  | { status: "no-network" }
  /** No wallet address — the org has none, or KeeperHub could not say. */
  | { status: "no-wallet" }
  /** The platform or the network's RPC could not answer. */
  | { status: "unavailable" };

export type AccountResponse = {
  userId: string;
  orgId: string;
  walletAddress: string | null;
  balance: AccountBalance;
};

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = ulid();
  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "account_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(
      503,
      "server_error",
      "We could not reach KeeperHub just now. Try again in a moment.",
    );
  }
  if (session === null) {
    return errorResponse(401, "unauthorized", "Connect KeeperHub to continue.");
  }

  const chainId = new URL(request.url).searchParams.get("chainId");
  if (chainId !== null && !CHAIN_ID.test(chainId)) {
    return errorResponse(400, "invalid_chain", "That network id is not valid.");
  }

  const walletAddress = await fetchOrgWalletAddress(session.accessToken);

  let balance: AccountBalance;
  if (chainId === null) {
    balance = { status: "no-network" };
  } else if (walletAddress === null) {
    balance = { status: "no-wallet" };
  } else {
    const result = await fetchOrgWalletBalance(session.accessToken, chainId);
    balance = result ? { status: "ok", balance: result } : { status: "unavailable" };
  }

  const body: AccountResponse = {
    userId: session.userId,
    orgId: session.orgId,
    walletAddress,
    balance,
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
