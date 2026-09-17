import { beforeEach, describe, expect, it, vi } from "vitest";

const { orgWallet, fetchOrgWalletHoldings } = vi.hoisted(() => ({
  orgWallet: vi.fn(),
  fetchOrgWalletHoldings: vi.fn(),
}));
vi.mock("@/lib/session/org-wallet", () => ({ orgWallet }));
vi.mock("@/lib/session/balance", () => ({ fetchOrgWalletHoldings }));

import { runOrgWalletBalances } from "@/lib/execution/holdings";
import { holdsSomething, readHoldings, shortAmount } from "@/lib/holdings";

const session = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read", accessToken: "tok" };
const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const chain = (chainId: string, nativeBalance: string, tokens: Array<[string, string]> = [], unavailable = false) => ({
  chainId,
  chainName: `Chain ${chainId}`,
  symbol: "ETH",
  isTestnet: true,
  nativeBalance,
  tokens: tokens.map(([symbol, balance]) => ({ symbol, name: symbol, tokenAddress: `0x${symbol}`, balance })),
  unavailable,
});

beforeEach(() => {
  orgWallet.mockReset().mockResolvedValue({ evm: EVM, solana: null });
  fetchOrgWalletHoldings.mockReset();
});

describe("get_org_wallet_balances (decision 34)", () => {
  it("one network: that network's native balance and every token, zeros included", async () => {
    fetchOrgWalletHoldings.mockResolvedValue([chain("1", "0"), chain("11155111", "0.5", [["USDC", "0"]])]);
    const out = await runOrgWalletBalances(session, { network: "11155111" });
    expect(out).toEqual({
      ok: true,
      tool: "get_org_wallet_balances",
      address: EVM,
      solanaAddress: null,
      network: "11155111",
      chains: [chain("11155111", "0.5", [["USDC", "0"]])],
    });
  });

  it("every network: only those holding something that KeeperHub could read", async () => {
    fetchOrgWalletHoldings.mockResolvedValue([
      chain("1", "0"),
      chain("8453", "0", [["USDC", "12.5"]]),
      chain("84532", "0.1", [], true),
      chain("11155111", "0.02"),
    ]);
    const out = await runOrgWalletBalances(session, {});
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.chains.map((c) => c.chainId)).toEqual(["8453", "11155111"]);
  });

  it("a network KeeperHub doesn't report is a plain failure the model can explain", async () => {
    fetchOrgWalletHoldings.mockResolvedValue([chain("1", "0")]);
    const out = await runOrgWalletBalances(session, { network: "101" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toContain("Solana is not included");
  });

  it("refuses a network that is not a chain id, before any read", async () => {
    const out = await runOrgWalletBalances(session, { network: "sepolia" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("validation_failed");
    expect(fetchOrgWalletHoldings).not.toHaveBeenCalled();
  });

  it("an unreadable balance list is honest, never zeros", async () => {
    fetchOrgWalletHoldings.mockResolvedValue(null);
    const out = await runOrgWalletBalances(session, {});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("tool_error");
  });
});

describe("holdings view rules", () => {
  it("shortens amounts without rounding", () => {
    expect(shortAmount("0.123456789")).toBe("0.123456");
    expect(shortAmount("12.500000")).toBe("12.5");
    expect(shortAmount("3")).toBe("3");
    expect(shortAmount("0.0000001")).toBe("0");
  });

  it("holds something when any amount is non-zero", () => {
    expect(holdsSomething(chain("1", "0.000", [["USDC", "0"]]))).toBe(false);
    expect(holdsSomething(chain("1", "0", [["USDC", "0.01"]]))).toBe(true);
  });

  it("reads a stored output back, dropping malformed rows", () => {
    const read = readHoldings({ address: EVM, network: null, chains: [chain("1", "1"), { nope: true }] });
    expect(read?.chains).toHaveLength(1);
    expect(readHoldings({ chains: "x" })).toBeNull();
  });
});
