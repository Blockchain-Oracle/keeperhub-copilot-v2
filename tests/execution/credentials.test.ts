import { beforeEach, describe, expect, it, vi } from "vitest";

// The binding resolver reads list_integrations through the SAME mocked wire
// client as the gate; the parse of its payload is the one live-verified fact
// this story leans on, so it is unit-tested directly here.
const { callTool } = vi.hoisted(() => ({ callTool: vi.fn() }));
vi.mock("@/lib/mcp", () => ({ callTool }));

import {
  __resetCredentialCache,
  extractBoundIntegrationTypes,
  resolveBoundIntegrations,
} from "@/lib/execution/credentials";

const session = {
  id: "s1",
  userId: "u1",
  orgId: "org-1",
  scope: "mcp:read",
  accessToken: "tok",
};
const base = { session, requestId: "req-1" } as const;

beforeEach(() => {
  callTool.mockReset();
  __resetCredentialCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("extractBoundIntegrationTypes (the verified list_integrations shape)", () => {
  it("collects the `type` of each record in a bare array", () => {
    const set = extractBoundIntegrationTypes([
      { id: "a", name: "Wallet", type: "web3", address: "0x1" },
      { id: "b", name: "My Safe", type: "safe", address: null },
      { id: "c", name: "Notifier", type: "discord", address: null },
    ]);
    expect([...set].sort()).toEqual(["discord", "safe", "web3"]);
  });

  it("accepts a defensive { integrations: [...] } envelope", () => {
    const set = extractBoundIntegrationTypes({
      integrations: [{ type: "web3" }, { type: "safe" }],
    });
    expect(set.has("web3")).toBe(true);
    expect(set.has("safe")).toBe(true);
  });

  it("is empty for a genuinely empty org (successful []), and skips typeless items", () => {
    expect(extractBoundIntegrationTypes([]).size).toBe(0);
    expect(extractBoundIntegrationTypes([{ id: "x" }, { type: "" }]).size).toBe(0);
  });

  it("is empty for an unrecognized shape (never throws)", () => {
    expect(extractBoundIntegrationTypes(null).size).toBe(0);
    expect(extractBoundIntegrationTypes("nope").size).toBe(0);
    expect(extractBoundIntegrationTypes(42).size).toBe(0);
  });
});

describe("resolveBoundIntegrations (memoized, graceful-degrading)", () => {
  it("returns the bound integration keys from a successful list_integrations", async () => {
    callTool.mockResolvedValue({
      ok: true,
      data: [{ type: "web3" }, { type: "safe" }],
    });
    const bound = await resolveBoundIntegrations(base);
    expect(bound).toBeDefined();
    expect(bound?.has("web3")).toBe(true);
    expect(bound?.has("safe")).toBe(true);
    expect(callTool.mock.calls[0][0]).toMatchObject({
      name: "list_integrations",
      idempotent: true, // a read — eligible for the one sanctioned retry
      orgId: "org-1",
      userId: "u1",
    });
  });

  it("memoizes per org — a second resolve in the window makes no second call", async () => {
    callTool.mockResolvedValue({ ok: true, data: [{ type: "web3" }] });
    await resolveBoundIntegrations(base);
    await resolveBoundIntegrations(base);
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("does NOT bind the shared list_integrations read to a caller's abort signal (D17b)", async () => {
    callTool.mockResolvedValue({ ok: true, data: [{ type: "web3" }] });
    const controller = new AbortController();
    await resolveBoundIntegrations({ ...base, signal: controller.signal });
    // The single-flight read is shared across concurrent gated ops in a turn, so
    // it must never carry one caller's signal — one caller aborting could then
    // resolve the shared result to undefined and relax a still-live caller's gate.
    expect(callTool.mock.calls[0][0].signal).toBeUndefined();
  });

  it("two concurrent callers share ONE read and both see the determinable result (D17b)", async () => {
    let settle: (v: unknown) => void = () => {};
    callTool.mockImplementation(
      () => new Promise((resolve) => { settle = resolve; }),
    );
    const c1 = new AbortController();
    const p1 = resolveBoundIntegrations({ ...base, signal: c1.signal });
    const p2 = resolveBoundIntegrations({ ...base });
    // Single-flight: exactly one wire read for both callers.
    expect(callTool).toHaveBeenCalledTimes(1);
    settle({ ok: true, data: [{ type: "web3" }] });
    const [b1, b2] = await Promise.all([p1, p2]);
    // Neither caller is relaxed to undefined — both see the bound set.
    expect(b1?.has("web3")).toBe(true);
    expect(b2?.has("web3")).toBe(true);
  });

  it("returns undefined (undeterminable) on a throttle, and does NOT cache it", async () => {
    callTool.mockResolvedValue({
      ok: false,
      error: { code: "rate_limited", message: "limited", retryAfter: 30 },
    });
    const first = await resolveBoundIntegrations(base);
    expect(first).toBeUndefined();
    // An undeterminable check is retried next time, never memoized as "nothing bound".
    callTool.mockResolvedValue({ ok: true, data: [{ type: "web3" }] });
    const second = await resolveBoundIntegrations(base);
    expect(second?.has("web3")).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("returns undefined on a transport error (never fabricates a bound set)", async () => {
    callTool.mockResolvedValue({
      ok: false,
      error: { code: "transport", message: "boom" },
    });
    expect(await resolveBoundIntegrations(base)).toBeUndefined();
  });
});
