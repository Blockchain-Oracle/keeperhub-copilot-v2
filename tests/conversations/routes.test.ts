import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session gate and the accessor seam — never the DB driver (AD-9:
// the routes must be structurally unable to pass an org id of their own).
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const {
  createConversation,
  listConversations,
  listConversationSummaries,
  renameConversation,
  deleteConversation,
} = vi.hoisted(() => ({
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  listConversationSummaries: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  createConversation,
  listConversations,
  listConversationSummaries,
  renameConversation,
  deleteConversation,
}));

function listRequest(query = ""): Request {
  return new Request(`http://localhost/api/conversations${query}`);
}

import { GET, POST } from "@/app/api/conversations/route";
import { DELETE, PATCH } from "@/app/api/conversations/[conversationId]/route";

const FAKE_SESSION = {
  id: "s1",
  userId: "u1",
  orgId: "org-1",
  scope: "mcp:read",
  accessToken: "tok",
};

function jsonRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/conversations", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function idParams(conversationId: string) {
  return { params: Promise.resolve({ conversationId }) };
}

beforeEach(() => {
  getSession.mockReset();
  createConversation.mockReset();
  listConversations.mockReset();
  renameConversation.mockReset();
  deleteConversation.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("session gate on every verb", () => {
  it("401s signed out with the envelope on POST, GET, PATCH, DELETE", async () => {
    getSession.mockResolvedValue(null);
    const responses = [
      await POST(),
      await GET(listRequest()),
      await PATCH(jsonRequest("PATCH", { title: "x" }), idParams("c1")),
      await DELETE(jsonRequest("DELETE"), idParams("c1")),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("unauthorized");
      expect(json.error.message).toContain("Connect KeeperHub");
    }
    expect(createConversation).not.toHaveBeenCalled();
    expect(listConversations).not.toHaveBeenCalled();
    expect(renameConversation).not.toHaveBeenCalled();
    expect(deleteConversation).not.toHaveBeenCalled();
  });

  it("503s with the envelope when the session read fails transiently", async () => {
    getSession.mockRejectedValue(new Error("refresh 503"));
    const res = await POST();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("server_error");
  });
});

describe("thrown accessors answer in the envelope (review patch, 2026-08-11)", () => {
  it("500s with server_error and a structured log on every verb — never an opaque framework 500", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    createConversation.mockRejectedValue(new Error("neon down"));
    listConversations.mockRejectedValue(new Error("neon down"));
    renameConversation.mockRejectedValue(new Error("neon down"));
    deleteConversation.mockRejectedValue(new Error("neon down"));

    const responses = [
      await POST(),
      await GET(listRequest()),
      await PATCH(jsonRequest("PATCH", { title: "x" }), idParams("c1")),
      await DELETE(jsonRequest("DELETE"), idParams("c1")),
    ];
    for (const res of responses) {
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error.code).toBe("server_error");
    }
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .filter((line) => line.includes("conversations_data_error"));
    expect(logged.length).toBe(4);
    expect(JSON.parse(logged[0]!)).toMatchObject({
      event: "conversations_data_error",
      orgId: "org-1",
    });
  });
});

describe("POST /api/conversations", () => {
  it("mints the id server-side; a body-supplied id is structurally ignored", async () => {
    // The handler takes NO request parameter — it cannot read a forged body
    // id even in principle; the accessor takes the session only.
    getSession.mockResolvedValue(FAKE_SESSION);
    createConversation.mockResolvedValue({
      id: "01SERVERULID",
      orgId: "org-1",
      title: "New conversation",
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: "01SERVERULID", title: "New conversation" });
    expect(createConversation).toHaveBeenCalledWith(FAKE_SESSION);
  });
});

describe("GET /api/conversations", () => {
  it("returns the accessor's list order and never transcript payloads", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const newer = new Date("2026-08-11T10:00:00Z");
    const older = new Date("2026-08-10T10:00:00Z");
    listConversations.mockResolvedValue([
      { id: "b", title: "Newer", updatedAt: newer },
      { id: "a", title: "Older", updatedAt: older },
    ]);
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversations.map((c: { id: string }) => c.id)).toEqual([
      "b",
      "a",
    ]);
    for (const item of json.conversations) {
      expect(Object.keys(item).sort()).toEqual(["id", "title", "updatedAt"]);
    }
    expect(listConversations).toHaveBeenCalledWith(FAKE_SESSION);
    expect(listConversationSummaries).not.toHaveBeenCalled();
  });

  it("?summary=1 answers History's gallery with each conversation's executed count", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    listConversationSummaries.mockResolvedValue([
      { id: "b", title: "Sent some ETH", updatedAt: new Date("2026-09-13T10:00:00Z"), executed: 2 },
    ]);
    const res = await GET(listRequest("?summary=1"));
    expect(res.status).toBe(200);
    expect((await res.json()).conversations).toEqual([
      { id: "b", title: "Sent some ETH", updatedAt: "2026-09-13T10:00:00.000Z", executed: 2 },
    ]);
    expect(listConversationSummaries).toHaveBeenCalledWith(FAKE_SESSION);
    expect(listConversations).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/conversations/[conversationId]", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(FAKE_SESSION);
  });

  it("trims the title and renames", async () => {
    renameConversation.mockResolvedValue({
      id: "c1",
      title: "Renamed",
      orgId: "org-1",
    });
    const res = await PATCH(
      jsonRequest("PATCH", { title: "  Renamed  " }),
      idParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(renameConversation).toHaveBeenCalledWith(
      FAKE_SESSION,
      "c1",
      "Renamed",
    );
  });

  it("400s on an empty title after trim", async () => {
    const res = await PATCH(jsonRequest("PATCH", { title: "   " }), idParams("c1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("bad_request");
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it("400s on a title over 120 chars", async () => {
    const res = await PATCH(
      jsonRequest("PATCH", { title: "x".repeat(121) }),
      idParams("c1"),
    );
    expect(res.status).toBe(400);
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it("400s on an unreadable body", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/conversations/c1", {
        method: "PATCH",
        body: "not-json",
      }),
      idParams("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("404s with the honest envelope when the accessor resolves null (absent or another org's)", async () => {
    renameConversation.mockResolvedValue(null);
    const res = await PATCH(jsonRequest("PATCH", { title: "x" }), idParams("c1"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not_found");
    expect(json.error.message).toBe("This conversation is not available.");
  });
});

describe("DELETE /api/conversations/[conversationId]", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(FAKE_SESSION);
  });

  it("deletes and returns 200", async () => {
    deleteConversation.mockResolvedValue(true);
    const res = await DELETE(jsonRequest("DELETE"), idParams("c1"));
    expect(res.status).toBe(200);
    expect(deleteConversation).toHaveBeenCalledWith(FAKE_SESSION, "c1");
  });

  it("404s on a foreign org's conversation — the accessor already resolved it to absent", async () => {
    // AC 4 structurally: the route hands the session to the accessor and gets
    // back a boolean; another org's row never reaches the route at all.
    deleteConversation.mockResolvedValue(false);
    const res = await DELETE(jsonRequest("DELETE"), idParams("other-orgs-conv"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not_found");
  });
});
