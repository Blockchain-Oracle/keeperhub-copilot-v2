import { describe, expect, it } from "vitest";

import { INTEGRATION_CARDS, launcherCategories } from "@/components/chat/home/categories";
import { STARTER_SUGGESTIONS } from "@/lib/registry/surface-suggestions";

/*
 * The launcher only offers prompts the chat can answer: its registry cards carry
 * the drift-guarded starter prompts (tests/registry/surface-suggestions.test.ts),
 * and a card whose prompt drifted out of the registry disappears.
 */

const context = { suggestions: STARTER_SUGGESTIONS, networkName: "Base Sepolia", symbol: "ETH" };

describe("launcher cards", () => {
  it("has a starter prompt behind every registry card it knows how to draw", () => {
    const withPrompts = new Set(STARTER_SUGGESTIONS.map((suggestion) => suggestion.integration));
    for (const integration of Object.keys(INTEGRATION_CARDS)) {
      expect(withPrompts.has(integration)).toBe(true);
    }
  });

  it("carries the registry's own prompt and label on each registry card", () => {
    const cards = launcherCategories(context);
    for (const suggestion of STARTER_SUGGESTIONS) {
      if (!INTEGRATION_CARDS[suggestion.integration]) continue;
      const card = cards.find((item) => item.id === suggestion.integration);
      expect(card?.prompt).toBe(suggestion.chips[0]?.prompt);
      expect(card?.familyLabel).toBe(suggestion.label);
    }
  });

  it("drops a card whose registry prompt is gone instead of inventing one", () => {
    const cards = launcherCategories({
      ...context,
      suggestions: STARTER_SUGGESTIONS.filter((suggestion) => suggestion.integration !== "lido"),
    });
    expect(cards.some((card) => card.id === "lido")).toBe(false);
  });

  it("names the selected network in the wallet and send prompts", () => {
    const cards = launcherCategories(context);
    expect(cards.find((card) => card.id === "org-wallet")?.prompt).toBe("What does my org wallet hold on Base Sepolia?");
    expect(cards.find((card) => card.id === "send-to-self")?.prompt).toBe(
      "Send 0 ETH from my org wallet to itself on Base Sepolia.",
    );
    expect(launcherCategories({ ...context, symbol: "" }).find((card) => card.id === "send-to-self")?.prompt).toBe(
      "Send 0 from my org wallet to itself on Base Sepolia.",
    );
  });

  it("links History rather than sending a prompt", () => {
    const history = launcherCategories(context).find((card) => card.id === "history");
    expect(history?.href).toBe("/app/history");
    expect(history?.prompt).toBeUndefined();
  });
});
