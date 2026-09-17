/*
 * The org wallet as the assistant hears it (decision 34), for the chat's and
 * voice's instructions alike. Pure, so both prompts and the tests share it.
 */

export type OrgWallet = {
  /** The org execution wallet on EVM networks (EIP-55), or null. */
  evm: string | null;
  /** The same wallet's Solana address, when the org has one. */
  solana: string | null;
};

export function walletPromptLine(wallet: OrgWallet | null): string {
  if (wallet === null || (wallet.evm === null && wallet.solana === null)) {
    return "The person's org wallet address could not be read just now. If a request needs it, ask for it; never guess one.";
  }
  const where = [
    wallet.evm !== null ? `${wallet.evm} on EVM networks` : null,
    wallet.solana !== null ? `${wallet.solana} on Solana` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" and ");
  return `The person's KeeperHub org wallet is ${where}. When they say "my wallet", "my org wallet", "me" or "myself", use this address. Never ask them for it. For what it holds, call get_org_wallet_balances.`;
}
