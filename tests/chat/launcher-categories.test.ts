import { describe, expect, it } from "vitest";

import { INTEGRATION_CARDS, launcherCategories } from "@/components/chat/home/categories";
import { STARTER_SUGGESTIONS, type StarterCategory } from "@/lib/registry/surface-suggestions";

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

/*
 * The launcher offered what the selected network cannot run: on Base Sepolia,
 * six of the eight starters 400 (Abu, hosted, 2026-09-17 — "How much is
 * deposited in the Sky savings vault?" on Sepolia). A starter now names a
 * network its action is actually deployed on.
 */
describe("a starter the selected network cannot run", () => {
  const sky: StarterCategory = {
    integration: "sky",
    label: "Sky",
    chips: [{ prompt: "How much is deposited in the Sky savings vault?", chains: ["1", "8453", "42161"] }],
  };

  it("names a network that can run it, inside the question", () => {
    const cards = launcherCategories({ suggestions: [sky], networkName: "Base Sepolia", symbol: "ETH", chainId: "84532" });
    expect(cards.find((card) => card.id === "sky")?.prompt).toBe(
      "How much is deposited in the Sky savings vault on Ethereum?",
    );
  });

  it("leaves the prompt alone when the selected network can run it", () => {
    const cards = launcherCategories({ suggestions: [sky], networkName: "Base", symbol: "ETH", chainId: "8453" });
    expect(cards.find((card) => card.id === "sky")?.prompt).toBe("How much is deposited in the Sky savings vault?");
  });

  it("leaves a starter with no declared networks alone — absent means any EVM network", () => {
    const anywhere: StarterCategory = {
      integration: "chainlink",
      label: "Chainlink",
      chips: [{ prompt: "What is ETH worth right now?" }],
    };
    const cards = launcherCategories({ suggestions: [anywhere], networkName: "Base Sepolia", symbol: "ETH", chainId: "84532" });
    expect(cards.find((card) => card.id === "chainlink")?.prompt).toBe("What is ETH worth right now?");
  });

  it("prefers a chip the network can run over one it cannot", () => {
    const mixed: StarterCategory = {
      integration: "lido",
      label: "Lido",
      chips: [
        { prompt: "Mainnet only please", chains: ["1"] },
        { prompt: "Works on Sepolia", chains: ["11155111"] },
      ],
    };
    const cards = launcherCategories({ suggestions: [mixed], networkName: "Ethereum Sepolia", symbol: "ETH", chainId: "11155111" });
    expect(cards.find((card) => card.id === "lido")?.prompt).toBe("Works on Sepolia");
  });
});
