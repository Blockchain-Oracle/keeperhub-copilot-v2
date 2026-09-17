"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { ChainId } from "@/lib/chains";
import { serializeNetworkCookie } from "@/lib/network";

/*
 * The selected network, shared by the network pill, the money pill and (later)
 * the chat and write cards. Additive — no reference has a network chip. The
 * server layout seeds it from the cookie so the first paint already agrees.
 */

type NetworkContextValue = {
  chainId: ChainId;
  setChainId: (chainId: ChainId) => void;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ initialChainId, children }: { initialChainId: ChainId; children: ReactNode }) {
  const [chainId, setSelected] = useState(initialChainId);

  const setChainId = useCallback((next: ChainId) => {
    document.cookie = serializeNetworkCookie(next);
    setSelected(next);
  }, []);

  const value = useMemo(() => ({ chainId, setChainId }), [chainId, setChainId]);
  return <NetworkContext value={value}>{children}</NetworkContext>;
}

export function useNetwork(): NetworkContextValue {
  const value = useContext(NetworkContext);
  if (!value) throw new Error("useNetwork must be used inside NetworkProvider");
  return value;
}
