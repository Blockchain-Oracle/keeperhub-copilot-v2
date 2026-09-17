import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { listLedgerRows } = vi.hoisted(() => ({ listLedgerRows: vi.fn() }));
vi.mock("@/lib/data/ledger", () => ({ listLedgerRows }));

import { GET } from "@/app/api/ledger/route";

const FAKE_SESSION = {
  id: "s1",
  userId: "u1",
  orgId: "org-1",
  scope: "mcp:read mcp:write",
  accessToken: "tok",
};

const ROW = {
  id: "01JLEDGER",
  toolCallId: "tc-1",
  keeperhubExecutionId: null,
  workflowId: null,
  orgId: "org-1",
  conversationId: "conv-1",
  opId: "web3/transfer-funds",
  state: "receipt",
  confirmedInputs: { recipientAddress: "0xabc", amount: "0" },
  txHash: "0xfeed",
  receipt: { blockNumber: 1 },
  idempotencyKey: "k",
  schemaFingerprint: "f",
  registrySnapshotId: "r",
  createdAt: new Date("2026-09-12T10:00:00.000Z"),
  updatedAt: new Date("2026-09-12T10:00:05.000Z"),
};

function request(query = ""): Request {
  return new Request(`http://localhost/api/ledger${query}`);
}

beforeEach(() => {
  getSession.mockReset();
  listLedgerRows.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/ledger", () => {
  it("401s signed out without reading the ledger", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(listLedgerRows).not.toHaveBeenCalled();
  });

  it("503s when the session cannot be resolved", async () => {
    getSession.mockRejectedValue(new Error("refresh 502"));
    const res = await GET(request());
    expect(res.status).toBe(503);
  });

  it("lists the session's org rows as a token-free projection", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    listLedgerRows.mockResolvedValue([ROW]);

    const res = await GET(request("?limit=8"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(listLedgerRows).toHaveBeenCalledWith(FAKE_SESSION, { limit: 8, before: undefined, kind: "all" });

    const body = await res.json();
    expect(body.rows).toEqual([
      {
        id: "01JLEDGER",
        opId: "web3/transfer-funds",
        label: "Transfer Native Token",
        integration: "web3",
        network: null,
        state: "receipt",
        txHash: "0xfeed",
        conversationId: "conv-1",
        workflowId: null,
        createdAt: "2026-09-12T10:00:00.000Z",
      },
    ]);
    expect(body.rows[0]).not.toHaveProperty("confirmedInputs");
    expect(body.rows[0]).not.toHaveProperty("orgId");
  });

  it("passes a before cursor through as a date", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    listLedgerRows.mockResolvedValue([]);
    await GET(request("?before=2026-09-12T10:00:00.000Z"));
    expect(listLedgerRows).toHaveBeenCalledWith(FAKE_SESSION, {
      limit: undefined,
      before: new Date("2026-09-12T10:00:00.000Z"),
      kind: "all",
    });
  });

  it("filters to actions or reads (decision 17) and names each row's network", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    listLedgerRows.mockResolvedValue([
      { ...ROW, opId: "execute_transfer", confirmedInputs: { chain_id: "84532", to_address: "0xabc", amount: "0" } },
    ]);
    const res = await GET(request("?kind=actions"));
    expect(listLedgerRows).toHaveBeenCalledWith(FAKE_SESSION, { limit: undefined, before: undefined, kind: "actions" });
    expect((await res.json()).rows[0]).toMatchObject({ label: "Send", integration: "web3", network: "84532" });

    await GET(request("?kind=reads"));
    expect(listLedgerRows).toHaveBeenLastCalledWith(FAKE_SESSION, { limit: undefined, before: undefined, kind: "reads" });
  });

  it("400s on a malformed limit, cursor or filter", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    expect((await GET(request("?limit=ten"))).status).toBe(400);
    expect((await GET(request("?limit=-1"))).status).toBe(400);
    expect((await GET(request("?before=yesterday"))).status).toBe(400);
    expect((await GET(request("?kind=everything"))).status).toBe(400);
    expect(listLedgerRows).not.toHaveBeenCalled();
  });

  it("500s when the ledger cannot be read", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    listLedgerRows.mockRejectedValue(new Error("neon down"));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("server_error");
  });
});
