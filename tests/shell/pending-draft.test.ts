import { describe, expect, it } from "vitest";

import {
  draftFromSearch,
  PENDING_DRAFT_KEY,
  PENDING_DRAFT_MAX_AGE_MS,
  stashDraft,
  takeDraft,
} from "@/components/shell/sign-in/pending-draft";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("draft carried through sign-in", () => {
  it("reads the landing's ?prompt= handoff", () => {
    expect(draftFromSearch("?prompt=Send%200%20ETH%20to%20myself")).toBe("Send 0 ETH to myself");
    expect(draftFromSearch("?prompt=%20%20")).toBeNull();
    expect(draftFromSearch("")).toBeNull();
  });

  it("hands the question back exactly once", () => {
    const storage = memoryStorage();
    expect(stashDraft(storage, "  What is ETH at?  ", 1_000)).toBe(true);

    expect(takeDraft(storage, 2_000)).toBe("What is ETH at?");
    expect(takeDraft(storage, 2_000)).toBeNull();
  });

  it("drops a question left behind by an abandoned sign-in", () => {
    const storage = memoryStorage();
    stashDraft(storage, "hello", 0);

    expect(takeDraft(storage, PENDING_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });

  it("stores nothing for an empty question and survives a corrupt entry", () => {
    const storage = memoryStorage();
    expect(stashDraft(storage, "   ")).toBe(false);

    storage.setItem(PENDING_DRAFT_KEY, "{not json");
    expect(takeDraft(storage)).toBeNull();
  });

  it("degrades quietly when storage refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(stashDraft(refusing, "hi")).toBe(false);
    expect(takeDraft(refusing)).toBeNull();
  });
});
