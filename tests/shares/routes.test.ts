import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The share link routes (decision 37), with the data layer mocked; the gate and envelope run for real.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

vi.mock("@/lib/config", () => ({ getAuthConfig: () => ({ APP_BASE_URL: "https://copilot.test" }) }));

const { shareStatus, createShare, revokeShare } = vi.hoisted(() => ({
  shareStatus: vi.fn(),
  createShare: vi.fn(),
  revokeShare: vi.fn(),
}));
vi.mock("@/lib/data/shares", () => ({ shareStatus, createShare, revokeShare }));

import { DELETE, GET, POST } from "@/app/api/receipts/share/route";

const SESSION = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read mcp:write", accessToken: "tok" };
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

function request(method: string, body?: unknown, query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/receipts/share${query}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION);
  shareStatus.mockReset();
  createShare.mockReset();
  revokeShare.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("/api/receipts/share", () => {
  it("turns away signed-out visitors without touching the data", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(request("GET", undefined, "?ledgerId=01L"))).status).toBe(401);
    expect((await POST(request("POST", { ledgerId: "01L" }))).status).toBe(401);
    expect((await DELETE(request("DELETE", { ledgerId: "01L" }))).status).toBe(401);
    expect(shareStatus).not.toHaveBeenCalled();
    expect(createShare).not.toHaveBeenCalled();
  });

  it("needs to know which receipt", async () => {
    expect((await GET(request("GET"))).status).toBe(400);
    expect((await POST(request("POST", { ledgerId: "../../etc" }))).status).toBe(400);
  });

  it("reports whether a receipt can be shared and its live link, scoped to the session", async () => {
    shareStatus.mockResolvedValue({ found: true, shareable: true, token: TOKEN });
    const response = await GET(request("GET", undefined, "?toolCallId=call_1"));
    expect(await response.json()).toEqual({ shareable: true, url: `https://copilot.test/r/${TOKEN}` });
    expect(shareStatus).toHaveBeenCalledWith(SESSION, { toolCallId: "call_1" });
  });

  it("makes the link, and hands back the same one when asked again", async () => {
    createShare.mockResolvedValue({ found: true, shareable: true, token: TOKEN });
    const first = await (await POST(request("POST", { ledgerId: "01L" }))).json();
    const second = await (await POST(request("POST", { ledgerId: "01L" }))).json();
    expect(first).toEqual({ shareable: true, url: `https://copilot.test/r/${TOKEN}` });
    expect(second).toEqual(first);
    expect(createShare).toHaveBeenCalledWith(SESSION, { ledgerId: "01L" });
  });

  it("refuses to share what never executed, and a receipt from elsewhere is simply not found", async () => {
    createShare.mockResolvedValue({ found: true, shareable: false, token: null });
    const refused = await POST(request("POST", { ledgerId: "01L" }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe("not_shareable");
    createShare.mockResolvedValue({ found: false });
    expect((await POST(request("POST", { ledgerId: "other-org" }))).status).toBe(404);
  });

  it("turns a link off", async () => {
    revokeShare.mockResolvedValue({ found: true, shareable: true, token: null });
    const response = await DELETE(request("DELETE", { ledgerId: "01L" }));
    expect(await response.json()).toEqual({ shareable: true, url: null });
    expect(revokeShare).toHaveBeenCalledWith(SESSION, { ledgerId: "01L" });
  });

  it("says so plainly when the data can't be reached", async () => {
    createShare.mockRejectedValue(new Error("neon down"));
    const response = await POST(request("POST", { ledgerId: "01L" }));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("server_error");
  });
});
