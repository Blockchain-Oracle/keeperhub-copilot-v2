"use client";

import { useEffect, useState } from "react";

import type { PlatformChain } from "@/app/api/platform/chains/route";

/*
 * KeeperHub's live network list, fetched once per page load and shared by the
 * network pill and the ticker. A failure is reported as such — never replaced
 * with the static list in lib/chains.
 */

export type PlatformChainsState =
  | { status: "loading" }
  | { status: "ready"; chains: PlatformChain[] }
  | { status: "error" };

let pending: Promise<PlatformChain[]> | null = null;

function loadChains(): Promise<PlatformChain[]> {
  pending ??= fetch("/api/platform/chains", { headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) throw new Error(`chains ${res.status}`);
      return ((await res.json()) as { chains: PlatformChain[] }).chains;
    })
    .catch((error: unknown) => {
      pending = null; // let the next mount try again
      throw error;
    });
  return pending;
}

export function usePlatformChains(): PlatformChainsState {
  const [state, setState] = useState<PlatformChainsState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    loadChains().then(
      (chains) => live && setState({ status: "ready", chains }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, []);

  return state;
}
