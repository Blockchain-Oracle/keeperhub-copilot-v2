"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AccountBalance, AccountResponse } from "@/app/api/account/route";
import type { ChainId } from "@/lib/chains";

import { useNetwork } from "./network-context";

/*
 * Who is signed in and what the org wallet holds on the selected network, read
 * once for the whole header (money pill, account pill, ticker). Masayume reads
 * its wallet on the client after hydration and keeps the controls inert until
 * it knows; this does the same against /api/account.
 *
 * Two requests on purpose: identity answers fast, while the balance waits on
 * KeeperHub reading every chain — the account pill should not wait for that.
 */

export type IdentityState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unavailable" }
  | { status: "signed-in"; orgId: string; walletAddress: string | null };

export type BalanceState = { status: "loading" } | AccountBalance;

type AccountContextValue = {
  identity: IdentityState;
  balance: BalanceState;
  refresh: () => void;
};

// Masayume's balances "update on their own"; returning to the tab re-reads them,
// at most this often, since each balance read makes KeeperHub query every chain.
const REFOCUS_MIN_INTERVAL_MS = 30_000;

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { chainId } = useNetwork();
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [reading, setReading] = useState<{ chainId: ChainId; balance: AccountBalance } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastReadAt = useRef(0);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    lastReadAt.current = Date.now();
    fetch("/api/account", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return setIdentity({ status: "signed-out" });
        if (!res.ok) return setIdentity({ status: "unavailable" });
        const body = (await res.json()) as AccountResponse;
        setIdentity({ status: "signed-in", orgId: body.orgId, walletAddress: body.walletAddress });
      })
      .catch(() => {
        if (!controller.signal.aborted) setIdentity({ status: "unavailable" });
      });
    return () => controller.abort();
  }, [attempt]);

  const signedIn = identity.status === "signed-in";

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch(`/api/account?chainId=${encodeURIComponent(chainId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const balance: AccountBalance = res.ok
          ? ((await res.json()) as AccountResponse).balance
          : { status: "unavailable" };
        setReading({ chainId, balance });
      })
      .catch(() => {
        if (!controller.signal.aborted) setReading({ chainId, balance: { status: "unavailable" } });
      });
    return () => controller.abort();
  }, [signedIn, chainId, attempt]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastReadAt.current >= REFOCUS_MIN_INTERVAL_MS) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // A reading for another network is not this network's balance: until it lands, loading.
  const value = useMemo(() => {
    const balance: BalanceState = reading?.chainId === chainId ? reading.balance : { status: "loading" };
    return { identity, balance, refresh };
  }, [identity, reading, chainId, refresh]);
  return <AccountContext value={value}>{children}</AccountContext>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
