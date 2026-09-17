import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getAuthConfig: () => ({ KEEPERHUB_OAUTH_ISSUER: "https://kh.test" }),
}));

import { fetchOrgWalletBalance } from "@/lib/session/balance";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const BASE_SEPOLIA = {
  chainId: 84532,
  chainName: "Base Sepolia",
  symbol: "ETH",
  isTestnet: true,
  nativeBalance: "0.0421",
  nativeBalanceRaw: "42100000000000000",
  tokens: [
    { address: "0xTracked", symbol: "DAI", name: "Dai", decimals: 18, balance: "3", balanceRaw: "3" },
  ],
  supportedTokens: [
    { tokenAddress: "0xUsdc", symbol: "USDC", name: "USD Coin", decimals: 6, balance: "12.5", balanceRaw: "12500000", logoUrl: null, explorerUrl: null },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchOrgWalletBalance", () => {
  it("returns the asked-for chain with native and token balances, sent with the Bearer", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ walletAddress: "0xabc", balances: [{ ...BASE_SEPOLIA, chainId: 1, chainName: "Ethereum" }, BASE_SEPOLIA] }),
    );

    const result = await fetchOrgWalletBalance("tok", "84532");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://kh.test/api/user/wallet/balances");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(result).toEqual({
      chainId: "84532",
      chainName: "Base Sepolia",
      symbol: "ETH",
      isTestnet: true,
      nativeBalance: "0.0421",
      tokens: [
        { symbol: "USDC", name: "USD Coin", tokenAddress: "0xUsdc", balance: "12.5" },
        { symbol: "DAI", name: "Dai", tokenAddress: "0xTracked", balance: "3" },
      ],
      unavailable: false,
    });
  });

  it("returns null for a chain the platform zero-filled after an RPC failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ balances: [{ ...BASE_SEPOLIA, nativeBalance: "0", error: "rpc down" }] }),
    );
    expect(await fetchOrgWalletBalance("tok", "84532")).toBeNull();
  });

  it("returns null when the chain is not in the list", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ balances: [BASE_SEPOLIA] }));
    expect(await fetchOrgWalletBalance("tok", "1")).toBeNull();
  });

  it("returns null on a non-ok response or a network failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "No wallet" }, 404));
    expect(await fetchOrgWalletBalance("tok", "84532")).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await fetchOrgWalletBalance("tok", "84532")).toBeNull();
  });
});
