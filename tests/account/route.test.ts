import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { fetchOrgWalletAddress } = vi.hoisted(() => ({
  fetchOrgWalletAddress: vi.fn(),
}));
vi.mock("@/lib/session/identity", () => ({ fetchOrgWalletAddress }));

const { fetchOrgWalletBalance } = vi.hoisted(() => ({
  fetchOrgWalletBalance: vi.fn(),
}));
vi.mock("@/lib/session/balance", () => ({ fetchOrgWalletBalance }));

import { GET } from "@/app/api/account/route";

const FAKE_SESSION = {
  id: "s1",
  userId: "u1",
  orgId: "org-1",
  scope: "mcp:read mcp:write",
  accessToken: "tok",
};

const BALANCE = {
  chainId: "84532",
  chainName: "Base Sepolia",
  symbol: "ETH",
  isTestnet: true,
  nativeBalance: "0.0421",
  tokens: [],
};

function request(query = ""): Request {
  return new Request(`http://localhost/api/account${query}`);
}

beforeEach(() => {
  getSession.mockReset();
  fetchOrgWalletAddress.mockReset();
  fetchOrgWalletBalance.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/account", () => {
  it("401s signed out without touching KeeperHub", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(request("?chainId=84532"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(fetchOrgWalletAddress).not.toHaveBeenCalled();
  });

  it("503s when the session cannot be resolved", async () => {
    getSession.mockRejectedValue(new Error("refresh 502"));
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("server_error");
  });

  it("400s a malformed chain id", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const res = await GET(request("?chainId=base"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_chain");
  });

  it("returns identity with no balance when no network is asked for", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    fetchOrgWalletAddress.mockResolvedValue("0xAbC");
    const res = await GET(request());
    expect(await res.json()).toEqual({
      userId: "u1",
      orgId: "org-1",
      walletAddress: "0xAbC",
      balance: { status: "no-network" },
    });
    expect(fetchOrgWalletBalance).not.toHaveBeenCalled();
  });

  it("reports no-wallet without asking for a balance", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    fetchOrgWalletAddress.mockResolvedValue(null);
    const json = await (await GET(request("?chainId=84532"))).json();
    expect(json.balance).toEqual({ status: "no-wallet" });
    expect(fetchOrgWalletBalance).not.toHaveBeenCalled();
  });

  it("returns the balance on the selected network, and unavailable when it cannot be read", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    fetchOrgWalletAddress.mockResolvedValue("0xAbC");

    fetchOrgWalletBalance.mockResolvedValueOnce(BALANCE);
    const ok = await (await GET(request("?chainId=84532"))).json();
    expect(ok.balance).toEqual({ status: "ok", balance: BALANCE });
    expect(fetchOrgWalletBalance).toHaveBeenCalledWith("tok", "84532");

    fetchOrgWalletBalance.mockResolvedValueOnce(null);
    const down = await (await GET(request("?chainId=84532"))).json();
    expect(down.balance).toEqual({ status: "unavailable" });
  });

  it("never returns the access token", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    fetchOrgWalletAddress.mockResolvedValue("0xAbC");
    const text = await (await GET(request())).text();
    expect(text).not.toContain("tok");
  });
});
