import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  getAuthConfig: () => ({ KEEPERHUB_OAUTH_ISSUER: "https://kh.test" }),
}));
const { fetchOrgWalletAddress } = vi.hoisted(() => ({ fetchOrgWalletAddress: vi.fn() }));
vi.mock("@/lib/session/identity", () => ({ fetchOrgWalletAddress }));

import { instructionsFor } from "@/app/api/chat/route";
import { voiceInstructions } from "@/lib/voice/instructions";
import { forgetOrgWallets, orgWallet } from "@/lib/session/org-wallet";
import { walletPromptLine } from "@/lib/session/org-wallet-prompt";

const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
const session = { orgId: "org-1", accessToken: "tok" };
const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  forgetOrgWallets();
  fetchMock.mockReset();
  fetchOrgWalletAddress.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("orgWallet (decision 34)", () => {
  it("reads both addresses from KeeperHub's wallet route with the Bearer, once per org", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hasWallet: true, walletAddress: EVM, solanaAddress: SOL }));

    expect(await orgWallet(session)).toEqual({ evm: EVM, solana: SOL });
    expect(await orgWallet(session)).toEqual({ evm: EVM, solana: SOL });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://kh.test/api/user/wallet");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(fetchOrgWalletAddress).not.toHaveBeenCalled();
  });

  it("shares one read between calls that arrive together", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hasWallet: true, walletAddress: EVM, solanaAddress: null }));
    const [a, b] = await Promise.all([orgWallet(session), orgWallet(session)]);
    expect(a).toEqual({ evm: EVM, solana: null });
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the integration lookup when the wallet route refuses the token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
    fetchOrgWalletAddress.mockResolvedValue(EVM);
    expect(await orgWallet(session)).toEqual({ evm: EVM, solana: null });
    expect(fetchOrgWalletAddress).toHaveBeenCalledWith("tok");
  });

  it("an org with no wallet is an honest null, kept only briefly", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(jsonResponse({ hasWallet: false, message: "No wallet" }));
      expect(await orgWallet(session)).toEqual({ evm: null, solana: null });
      fetchMock.mockResolvedValue(jsonResponse({ hasWallet: true, walletAddress: EVM }));
      vi.advanceTimersByTime(31_000);
      expect(await orgWallet(session)).toEqual({ evm: EVM, solana: null });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never throws when KeeperHub is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    fetchOrgWalletAddress.mockResolvedValue(null);
    expect(await orgWallet(session)).toEqual({ evm: null, solana: null });
  });
});

describe("the assistant hears the org wallet", () => {
  it("names both addresses and says never to ask for them", () => {
    const line = walletPromptLine({ evm: EVM, solana: SOL });
    expect(line).toContain(EVM);
    expect(line).toContain(SOL);
    expect(line).toContain("Never ask them for it");
    expect(line).toContain("get_org_wallet_balances");
  });

  it("says so honestly when the wallet could not be read", () => {
    expect(walletPromptLine(null)).toContain("could not be read");
    expect(walletPromptLine({ evm: null, solana: null })).not.toContain("0x");
  });

  it("is in the chat's and voice's instructions", () => {
    const wallet = { evm: EVM, solana: null };
    expect(instructionsFor("84532", wallet)).toContain(EVM);
    expect(voiceInstructions("84532", wallet)).toContain(EVM);
    expect(voiceInstructions("84532", wallet)).toContain("Base Sepolia (chain id 84532)");
  });
});
