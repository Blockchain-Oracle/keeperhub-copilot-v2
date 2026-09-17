/*
 * The chain registry behind the network switcher.
 *
 * Names and the Tempo ids are PORTED from
 * references/keeperhub-fork/lib/chain-utils.ts @ 946eeb5c9 — the authority on
 * what KeeperHub calls each network. Do not rename a chain here to something
 * prettier than what the platform calls it; a person reading a receipt has to
 * be able to match the two.
 *
 * The reference map is INCOMPLETE against the action registry: it names 12
 * chains, but 16 distinct ids appear in `allowedChainIds` across the 442
 * actions. The six it omits (BNB, Avalanche, and four testnets) are filled in
 * below and marked `extendsReference` so the gap stays visible rather than
 * being quietly absorbed. Same for explorers — the reference ships 5.
 *
 * Chain ids here are STRINGS. That is not a style choice: the generated
 * registry stores `allowedChainIds` as strings, and a number round-trip is
 * exactly where a chain-select silently stops matching.
 */

export type ChainId = string;

export type Chain = {
  id: ChainId;
  /** The name KeeperHub uses. Must match the platform's own label. */
  name: string;
  /** Compact label for a chip or a switcher row. */
  short: string;
  /** Native currency symbol, for amount rendering. */
  nativeSymbol: string;
  testnet: boolean;
  /** Address-page base. `null` when we have no explorer we can vouch for. */
  explorerAddress: string | null;
  /** Transaction-page base. `null` when we have no explorer we can vouch for. */
  explorerTx: string | null;
  /** Brand hue, used for the chain dot. Not a KeeperHub token — see note. */
  dot: string;
  /** True when this entry is not in the reference's own chain map. */
  extendsReference?: true;
};

/*
 * Chain dots are the one place this file invents colour. KeeperHub has no
 * per-chain colour token because it never renders a chain dot. These are each
 * network's own published brand hue, which is the honest source — a chain's
 * identity is not ours to restyle.
 */
export const CHAINS: Record<ChainId, Chain> = {
  "1": {
    id: "1",
    name: "Ethereum",
    short: "Ethereum",
    nativeSymbol: "ETH",
    testnet: false,
    explorerAddress: "https://etherscan.io/address/",
    explorerTx: "https://etherscan.io/tx/",
    dot: "#627eea",
  },
  "8453": {
    id: "8453",
    name: "Base",
    short: "Base",
    nativeSymbol: "ETH",
    testnet: false,
    explorerAddress: "https://basescan.org/address/",
    explorerTx: "https://basescan.org/tx/",
    dot: "#0052ff",
  },
  "42161": {
    id: "42161",
    name: "Arbitrum",
    short: "Arbitrum",
    nativeSymbol: "ETH",
    testnet: false,
    explorerAddress: "https://arbiscan.io/address/",
    explorerTx: "https://arbiscan.io/tx/",
    dot: "#28a0f0",
  },
  "10": {
    id: "10",
    name: "Optimism",
    short: "Optimism",
    nativeSymbol: "ETH",
    testnet: false,
    explorerAddress: "https://optimistic.etherscan.io/address/",
    explorerTx: "https://optimistic.etherscan.io/tx/",
    dot: "#ff0420",
  },
  "137": {
    id: "137",
    name: "Polygon",
    short: "Polygon",
    nativeSymbol: "POL",
    testnet: false,
    explorerAddress: "https://polygonscan.com/address/",
    explorerTx: "https://polygonscan.com/tx/",
    dot: "#8247e5",
  },
  "100": {
    id: "100",
    name: "Gnosis",
    short: "Gnosis",
    nativeSymbol: "xDAI",
    testnet: false,
    explorerAddress: "https://gnosisscan.io/address/",
    explorerTx: "https://gnosisscan.io/tx/",
    dot: "#04795b",
  },
  "56": {
    id: "56",
    name: "BNB Smart Chain",
    short: "BNB Chain",
    nativeSymbol: "BNB",
    testnet: false,
    explorerAddress: "https://bscscan.com/address/",
    explorerTx: "https://bscscan.com/tx/",
    dot: "#f0b90b",
    extendsReference: true,
  },
  "43114": {
    id: "43114",
    name: "Avalanche",
    short: "Avalanche",
    nativeSymbol: "AVAX",
    testnet: false,
    explorerAddress: "https://snowtrace.io/address/",
    explorerTx: "https://snowtrace.io/tx/",
    dot: "#e84142",
    extendsReference: true,
  },
  "4217": {
    id: "4217",
    name: "Tempo",
    short: "Tempo",
    nativeSymbol: "TEMPO",
    testnet: false,
    explorerAddress: null,
    explorerTx: null,
    dot: "#635bff",
  },

  // --- Testnets -------------------------------------------------------------
  "11155111": {
    id: "11155111",
    name: "Ethereum Sepolia",
    short: "Sepolia",
    nativeSymbol: "ETH",
    testnet: true,
    explorerAddress: "https://sepolia.etherscan.io/address/",
    explorerTx: "https://sepolia.etherscan.io/tx/",
    dot: "#627eea",
  },
  "84532": {
    id: "84532",
    name: "Base Sepolia",
    short: "Base Sepolia",
    nativeSymbol: "ETH",
    testnet: true,
    explorerAddress: "https://sepolia.basescan.org/address/",
    explorerTx: "https://sepolia.basescan.org/tx/",
    dot: "#0052ff",
  },
  "421614": {
    id: "421614",
    name: "Arbitrum Sepolia",
    short: "Arb Sepolia",
    nativeSymbol: "ETH",
    testnet: true,
    explorerAddress: "https://sepolia.arbiscan.io/address/",
    explorerTx: "https://sepolia.arbiscan.io/tx/",
    dot: "#28a0f0",
    extendsReference: true,
  },
  "80002": {
    id: "80002",
    name: "Polygon Amoy",
    short: "Amoy",
    nativeSymbol: "POL",
    testnet: true,
    explorerAddress: "https://amoy.polygonscan.com/address/",
    explorerTx: "https://amoy.polygonscan.com/tx/",
    dot: "#8247e5",
    extendsReference: true,
  },
  "97": {
    id: "97",
    name: "BNB Testnet",
    short: "BNB Testnet",
    nativeSymbol: "tBNB",
    testnet: true,
    explorerAddress: "https://testnet.bscscan.com/address/",
    explorerTx: "https://testnet.bscscan.com/tx/",
    dot: "#f0b90b",
    extendsReference: true,
  },
  "43113": {
    id: "43113",
    name: "Avalanche Fuji",
    short: "Fuji",
    nativeSymbol: "AVAX",
    testnet: true,
    explorerAddress: "https://testnet.snowtrace.io/address/",
    explorerTx: "https://testnet.snowtrace.io/tx/",
    dot: "#e84142",
    extendsReference: true,
  },
  "42431": {
    id: "42431",
    name: "Tempo Testnet",
    short: "Tempo Testnet",
    nativeSymbol: "TEMPO",
    testnet: true,
    explorerAddress: null,
    explorerTx: null,
    dot: "#635bff",
  },

  // --- Non-EVM --------------------------------------------------------------
  "101": {
    id: "101",
    name: "Solana",
    short: "Solana",
    nativeSymbol: "SOL",
    testnet: false,
    explorerAddress: "https://solscan.io/account/",
    explorerTx: "https://solscan.io/tx/",
    dot: "#14f195",
  },
  "103": {
    id: "103",
    name: "Solana Devnet",
    short: "Solana Devnet",
    nativeSymbol: "SOL",
    testnet: true,
    explorerAddress: "https://solscan.io/account/",
    explorerTx: "https://solscan.io/tx/",
    dot: "#14f195",
  },
};

/** Mainnets first, then testnets; each group in the reference's own order. */
export const MAINNET_IDS: readonly ChainId[] = [
  "1",
  "8453",
  "42161",
  "10",
  "137",
  "56",
  "43114",
  "100",
  "4217",
  "101",
];

export const TESTNET_IDS: readonly ChainId[] = [
  "11155111",
  "84532",
  "421614",
  "80002",
  "97",
  "43113",
  "42431",
  "103",
];

/**
 * Resolve a chain. Never throws and never invents a name: an id the registry
 * knows but this map does not still renders as "Chain <id>", the same
 * fallback the reference uses, so a new upstream network degrades to a
 * readable label instead of a blank chip.
 */
export function getChain(chainId: ChainId | number | undefined | null): Chain {
  const id = chainId == null ? "" : String(chainId);
  return (
    CHAINS[id] ?? {
      id,
      name: id ? `Chain ${id}` : "Unknown network",
      short: id ? `Chain ${id}` : "Unknown",
      nativeSymbol: "",
      testnet: false,
      explorerAddress: null,
      explorerTx: null,
      dot: "oklch(0.5544 0.0407 257.42)",
    }
  );
}

export function getChainName(chainId: ChainId | number): string {
  return getChain(chainId).name;
}

/** `null` rather than a dead link when we have no explorer for the chain. */
export function explorerAddressUrl(
  chainId: ChainId | number,
  address: string,
): string | null {
  const base = getChain(chainId).explorerAddress;
  return base ? `${base}${address}` : null;
}

export function explorerTxUrl(
  chainId: ChainId | number,
  hash: string,
): string | null {
  const base = getChain(chainId).explorerTx;
  return base ? `${base}${hash}` : null;
}

/** Order a set of ids for display: mainnets first, unknowns last. */
export function sortChainIds(ids: readonly ChainId[]): ChainId[] {
  const rank = (id: ChainId) => {
    const m = MAINNET_IDS.indexOf(id);
    if (m !== -1) return m;
    const t = TESTNET_IDS.indexOf(id);
    if (t !== -1) return 100 + t;
    return 1000;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
