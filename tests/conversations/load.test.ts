import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UIMessage } from "ai";

/*
 * The reopen load path, ported from v1 tests/conversations/load.test.ts. The
 * page is a server component — an async function returning an element tree — so
 * it runs under node and the tree is walked as plain objects. What matters is
 * which props reach the chat: validated messages on the happy path, the honest
 * degraded fallback when validation rejects, and the 30-minute open rule.
 */
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));

const { getConversation } = vi.hoisted(() => ({ getConversation: vi.fn() }));
vi.mock("@/lib/data", () => ({ getConversation }));

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: vi.fn() }));

// The page reads its notice through next-intl on the server (decision 41); here it reads the English messages.
vi.mock("next-intl/server", async () => {
  const { englishTranslate } = await import("@/lib/i18n/translate");
  return {
    getTranslations: async (namespace: string) => (key: string, values?: Record<string, string | number>) =>
      englishTranslate(`${namespace}.${key}`, values),
  };
});

vi.mock("@/components/chat/chat-workspace", () => ({
  ChatWorkspace: function ChatWorkspace() {
    return null;
  },
}));

import ConversationPage from "@/app/(app)/app/c/[conversationId]/page";
import { ARCHIVE_AFTER_MS } from "@/components/chat/chat-rules";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

const FAKE_SESSION = { id: "s1", userId: "u1", orgId: "org-1", scope: "mcp:read", accessToken: "tok" };

function msg(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

function conversationRow(overrides?: Record<string, unknown>) {
  return {
    id: "conv-1",
    orgId: "org-1",
    title: "Balances",
    transcript: [] as unknown[],
    revision: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function pageProps(conversationId = "conv-1") {
  return { params: Promise.resolve({ conversationId }) };
}

type Element = { type?: unknown; key?: string | null; props: Record<string, unknown> };

function asWorkspace(tree: unknown): Element {
  const element = tree as Element;
  expect(element.type).toBe(ChatWorkspace);
  return element;
}

type Loaded = { id: string; title: string; messages: UIMessage[]; loadNotice?: string; archived: boolean };

beforeEach(() => {
  getSession.mockReset();
  getConversation.mockReset();
  notFound.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/app/c/[conversationId] load path", () => {
  it("renders the chat with no conversation (the identity card) when signed out", async () => {
    getSession.mockResolvedValue(null);
    const workspace = asWorkspace(await ConversationPage(pageProps()));
    expect(workspace.props.conversation).toBeUndefined();
    expect(getConversation).not.toHaveBeenCalled();
  });

  it("treats a failed session read as signed out, and logs it", async () => {
    getSession.mockRejectedValue(new Error("refresh 503"));
    const workspace = asWorkspace(await ConversationPage(pageProps()));
    expect(workspace.props.conversation).toBeUndefined();
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("session_read_failed"));
    expect(logged).toBeDefined();
  });

  it("notFound()s when the accessor resolves null — absent and another org's are the same null", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(null);
    await expect(ConversationPage(pageProps())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("passes the validated transcript into the chat, live when touched recently", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const transcript = [msg("u1", "user", "hi"), msg("a1", "assistant", "hello")];
    getConversation.mockResolvedValue(conversationRow({ transcript }));

    const workspace = asWorkspace(await ConversationPage(pageProps()));
    const loaded = workspace.props.conversation as Loaded;
    expect(loaded.id).toBe("conv-1");
    expect(loaded.title).toBe("Balances");
    expect(loaded.loadNotice).toBeUndefined();
    expect(loaded.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(loaded.archived).toBe(false);
    // Keyed by conversation so a client-side move between two never reuses a chat.
    expect(workspace.key).toBe("conv-1");
  });

  it("opens read-only when the conversation was last touched 30 minutes ago or more", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(conversationRow({ updatedAt: new Date(Date.now() - ARCHIVE_AFTER_MS - 1_000) }));
    const loaded = asWorkspace(await ConversationPage(pageProps())).props.conversation as Loaded;
    expect(loaded.archived).toBe(true);
  });

  it("degrades honestly when validateUIMessages rejects: empty chat + notice, never a throw", async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    getConversation.mockResolvedValue(
      conversationRow({ transcript: [{ id: "broken", role: "user", parts: "not-an-array" }] }),
    );

    const loaded = asWorkspace(await ConversationPage(pageProps())).props.conversation as Loaded;
    expect(loaded.messages).toEqual([]);
    expect(loaded.loadNotice).toBe(
      "This conversation could not be fully loaded. Its messages are kept but cannot be displayed.",
    );

    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => String(call[0]))
      .find((line) => line.includes("conversation_load_invalid"));
    expect(logged).toBeDefined();
    expect(JSON.parse(logged!)).toMatchObject({
      event: "conversation_load_invalid",
      conversationId: "conv-1",
      orgId: "org-1",
    });
  });
});
