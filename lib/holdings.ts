/*
 * The org wallet's holdings as KeeperHub reports them (GET
 * /api/user/wallet/balances, lib/session/balance.ts): per EVM network, the
 * native balance and its tokens (the org's tracked tokens plus KeeperHub's
 * system stablecoins), human decimal strings. Free of React and the network, so
 * the tool, the card and the tests share it (decision 34).
 */

export type HeldToken = {
  symbol: string;
  name: string;
  tokenAddress: string;
  /** Human-readable decimal string, as the platform formats it. */
  balance: string;
};

export type HeldChain = {
  chainId: string;
  chainName: string;
  symbol: string;
  isTestnet: boolean;
  /** Human-readable decimal string of the native token. */
  nativeBalance: string;
  tokens: HeldToken[];
  /** KeeperHub could not read this network (it zero-fills and flags it). */
  unavailable: boolean;
};

export type Holdings = {
  address: string | null;
  solanaAddress: string | null;
  /** The one network asked about, or null for every network holding something. */
  network: string | null;
  chains: HeldChain[];
};

export function isZero(amount: string): boolean {
  return !/[1-9]/.test(amount);
}

export function holdsSomething(chain: Pick<HeldChain, "nativeBalance" | "tokens">): boolean {
  return !isZero(chain.nativeBalance) || chain.tokens.some((token) => !isZero(token.balance));
}

/** A decimal string cut to a few places without rounding, trailing zeros dropped. */
export function shortAmount(amount: string, places = 6): string {
  const [whole, fraction = ""] = amount.split(".");
  const cut = fraction.slice(0, places).replace(/0+$/, "");
  return cut === "" ? whole : `${whole}.${cut}`;
}

export function readHoldings(value: unknown): Holdings | null {
  if (!isRecord(value) || !Array.isArray(value.chains)) return null;
  return {
    address: typeof value.address === "string" ? value.address : null,
    solanaAddress: typeof value.solanaAddress === "string" ? value.solanaAddress : null,
    network: typeof value.network === "string" ? value.network : null,
    chains: value.chains.flatMap((chain): HeldChain[] => {
      if (!isRecord(chain) || typeof chain.chainId !== "string" || typeof chain.nativeBalance !== "string") return [];
      return [
        {
          chainId: chain.chainId,
          chainName: typeof chain.chainName === "string" ? chain.chainName : chain.chainId,
          symbol: typeof chain.symbol === "string" ? chain.symbol : "",
          isTestnet: chain.isTestnet === true,
          nativeBalance: chain.nativeBalance,
          unavailable: chain.unavailable === true,
          tokens: Array.isArray(chain.tokens)
            ? chain.tokens.flatMap((token): HeldToken[] =>
                isRecord(token) && typeof token.symbol === "string" && typeof token.balance === "string"
                  ? [
                      {
                        symbol: token.symbol,
                        name: typeof token.name === "string" ? token.name : token.symbol,
                        tokenAddress: typeof token.tokenAddress === "string" ? token.tokenAddress : "",
                        balance: token.balance,
                      },
                    ]
                  : [],
              )
            : [],
        },
      ];
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
