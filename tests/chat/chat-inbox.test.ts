import { describe, expect, it, vi } from "vitest";

import { postToChat, registerChatInbox } from "@/components/chat/chat-inbox";

/* How the ⌘K palette reaches the open chat (decision 36). */

describe("the chat inbox", () => {
  it("says no when no chat is on screen", () => {
    expect(postToChat("Use Supply.")).toBe(false);
  });

  it("hands the text to the chat on screen, until it unmounts", () => {
    const handler = vi.fn();
    const release = registerChatInbox(handler);
    expect(postToChat("Use Supply.")).toBe(true);
    expect(handler).toHaveBeenCalledWith("Use Supply.");
    release();
    expect(postToChat("Again.")).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps the newer chat when an older one lets go late", () => {
    const older = vi.fn();
    const newer = vi.fn();
    const releaseOlder = registerChatInbox(older);
    const releaseNewer = registerChatInbox(newer);
    releaseOlder();
    expect(postToChat("Hi.")).toBe(true);
    expect(newer).toHaveBeenCalledWith("Hi.");
    expect(older).not.toHaveBeenCalled();
    releaseNewer();
  });
});
