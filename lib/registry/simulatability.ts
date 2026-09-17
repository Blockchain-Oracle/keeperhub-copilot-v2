/*
 * The write-simulatability classification (Story 2.4, D20 / AD-6). A PURE, tiny,
 * client-safe predicate — the SINGLE source both the client write card and the
 * server execution path derive from, so the data-derived `simulated | no-preview`
 * chip identity can NEVER diverge from the server's actual dry-run behavior.
 *
 * It lives here (not in lib/execution, which is `server-only`) precisely so the
 * client can import it. `lib/execution` imports `isSolanaChainId` from here too,
 * so the Solana refusal and the simulatability classification share ONE
 * definition — the anti-divergence guarantee AC1/AD-6 rest on.
 *
 * The classification is a function of the OPERATION IDENTITY (verb + chain),
 * never a byproduct of the /api/chat/simulate fetch (that would be the "UI-derived
 * state" AC1 forbids): only a simulable EVM contract call can be dry-run
 * simulated; a protocol action, a Solana call, or an off-chain send has no
 * simulate path and coerces to no-preview (D15). A silent pass to `simulated` is
 * forbidden — the decoded VALUES still ride the fetch, but the STATE identity is
 * data.
 */

// Solana networks cannot be simulated (KeeperHub rejects `simulate` on chains
// 101/102/103 and their aliases before the API call), so a Solana contract call
// can never be given the no-broadcast dry-run guarantee the ceremony rests on.
const SOLANA_CHAIN_IDS: ReadonlySet<string> = new Set(["101", "102", "103"]);

export function isSolanaChainId(chainId: string | undefined): boolean {
  if (chainId === undefined) {
    return false;
  }
  return SOLANA_CHAIN_IDS.has(chainId) || chainId.toLowerCase().includes("solana");
}

// The tools whose EVM path dry-run simulates: a direct contract call and (2.5 D28)
// a transfer. Both route through KeeperHub's SIMULATING path on a non-Solana chain;
// a protocol action, a Solana call/transfer, or an off-chain send does not.
const SIMULATING_TOOLS: ReadonlySet<string> = new Set([
  "execute_contract_call",
  "execute_transfer",
]);

/**
 * Whether a proposed write can be dry-run SIMULATED (→ `proposed` then `simulated`
 * as decoded effects arrive) or coerces to `no-preview` (the card shows the exact
 * instruction to confirm). A pure function of the operation identity:
 * `execute_contract_call` or `execute_transfer` on a simulable EVM chain →
 * simulatable; a protocol action, a Solana call/transfer, or any off-chain send →
 * NOT simulatable. This MIRRORS the server's routeToolCall branching exactly (a
 * protocol action's simulate phase returns no-preview; a non-Solana contract call
 * or transfer returns the decoded simulate preview) — the shared source that keeps
 * the client chip and the server route from drifting.
 */
export function isSimulatable(toolName: string, input: unknown): boolean {
  if (!SIMULATING_TOOLS.has(toolName)) {
    return false;
  }
  return !isSolanaChainId(readChainId(input));
}

/**
 * Whether a proposed write cannot run from chat AT ALL this release, so the card
 * must never offer a Confirm the server will reject (AD-6). This MIRRORS the
 * server's hard refusal — today exactly a Solana `execute_contract_call`:
 * KeeperHub cannot dry-run simulate it and this release does not broadcast it, so
 * `lib/execution` refuses it in both phases with `write_not_available` (the Solana
 * bespoke card lands in Story 2.5). Deriving the client's non-confirmability from
 * the SAME `isSolanaChainId` source keeps the card honest: a `no-preview` op is
 * normally confirmable, but a write-unavailable one is not — no confirmable
 * dead-end (restores the pre-2.4 disabled-Confirm behavior via the data path).
 *
 * Deliberately NOT extended to `execute_transfer` (2.5 D28): a Solana TRANSFER
 * broadcasts (KeeperHub's transfer route has a Solana branch), so it is a
 * `no-preview`-CONFIRMABLE money-mover, never unavailable. Only a Solana CONTRACT
 * CALL stays unavailable this release.
 */
export function isWriteUnavailable(toolName: string, input: unknown): boolean {
  return toolName === "execute_contract_call" && isSolanaChainId(readChainId(input));
}

function readChainId(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") {
    return undefined;
  }
  const chainId = (input as { chain_id?: unknown }).chain_id;
  return typeof chainId === "string" ? chainId : undefined;
}
