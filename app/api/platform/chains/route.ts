import { NextResponse } from "next/server";

import { getPlatformConfig } from "@/lib/config";

/*
 * The networks KeeperHub can execute on right now.
 *
 * Proxied server-side rather than called from the browser: KeeperHub's chains
 * endpoint is public and needs no credential, but going through our own route
 * keeps the platform's base URL out of the client bundle and gives one place
 * to cache. The landing chip reads `count`; the network switcher reads `chains`.
 *
 * If the platform is unreachable this returns 502 and the UI degrades to
 * "connecting to keeperhub" rather than showing an invented list.
 */
export const revalidate = 300;

/** The subset of KeeperHub's ChainResponse the shell uses. Ids are strings,
 *  matching lib/chains.ts. */
export type PlatformChain = {
  chainId: string;
  name: string;
  symbol: string;
  chainType: string;
  isTestnet: boolean;
  explorerUrl: string | null;
  explorerAddressPath: string | null;
};

function toPlatformChain(raw: unknown): PlatformChain | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const c = raw as Record<string, unknown>;
  if (c.isEnabled === false) {
    return null;
  }
  if (typeof c.chainId !== "number" || typeof c.name !== "string") {
    return null;
  }
  return {
    chainId: String(c.chainId),
    name: c.name,
    symbol: typeof c.symbol === "string" ? c.symbol : "",
    chainType: typeof c.chainType === "string" ? c.chainType : "evm",
    isTestnet: c.isTestnet === true,
    explorerUrl: typeof c.explorerUrl === "string" ? c.explorerUrl : null,
    explorerAddressPath:
      typeof c.explorerAddressPath === "string" ? c.explorerAddressPath : null,
  };
}

export async function GET() {
  try {
    const { keeperhubUrl } = getPlatformConfig();
    const res = await fetch(`${keeperhubUrl}/api/chains`, {
      next: { revalidate: 300 },
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "platform_unavailable", status: res.status },
        { status: 502 },
      );
    }
    const body = (await res.json()) as unknown;
    const list = Array.isArray(body)
      ? body
      : Array.isArray((body as { chains?: unknown[] })?.chains)
        ? (body as { chains: unknown[] }).chains
        : [];
    const chains = list
      .map(toPlatformChain)
      .filter((chain): chain is PlatformChain => chain !== null)
      // Mainnets first, then by name — the order a switcher lists them in.
      .sort((a, b) =>
        a.isTestnet !== b.isTestnet
          ? a.isTestnet
            ? 1
            : -1
          : a.name.localeCompare(b.name),
      );
    return NextResponse.json({ count: chains.length, chains });
  } catch {
    return NextResponse.json({ error: "platform_unreachable" }, { status: 502 });
  }
}
