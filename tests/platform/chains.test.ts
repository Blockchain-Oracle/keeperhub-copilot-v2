import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getPlatformConfig: () => ({ keeperhubUrl: "https://kh.test" }),
}));

import { GET } from "@/app/api/platform/chains/route";

const fetchMock = vi.fn();

function chain(overrides: Record<string, unknown>) {
  return {
    id: "row",
    chainId: 1,
    name: "Ethereum",
    symbol: "ETH",
    chainType: "evm",
    explorerUrl: "https://etherscan.io",
    explorerAddressPath: "/address/{address}",
    explorerApiUrl: null,
    explorerApiType: null,
    isTestnet: false,
    isEnabled: true,
    usePrivateMempoolRpc: false,
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/platform/chains", () => {
  it("returns enabled chains, mainnets first then by name, with the count", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          chain({ chainId: 84532, name: "Base Sepolia", isTestnet: true }),
          chain({ chainId: 8453, name: "Base" }),
          chain({ chainId: 56, name: "BNB Chain", isEnabled: false }),
          chain({ chainId: 1, name: "Ethereum" }),
        ]),
      ),
    );

    const res = await GET();
    const json = await res.json();

    expect(fetchMock.mock.calls[0][0]).toBe("https://kh.test/api/chains");
    expect(json.count).toBe(3);
    expect(json.chains.map((c: { chainId: string }) => c.chainId)).toEqual([
      "8453",
      "1",
      "84532",
    ]);
    expect(json.chains[0]).toEqual({
      chainId: "8453",
      name: "Base",
      symbol: "ETH",
      chainType: "evm",
      isTestnet: false,
      explorerUrl: "https://etherscan.io",
      explorerAddressPath: "/address/{address}",
    });
  });

  it("502s platform_unavailable on a non-ok response", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("platform_unavailable");
  });

  it("502s platform_unreachable when the fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));
    const res = await GET();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("platform_unreachable");
  });
});
