import { describe, expect, it } from "vitest";

import { HISTORY_ROUNDS, PRICE_FEEDS, previousRoundIds, priceFeedFor } from "@/lib/price-feeds";
import { getOperationEntry } from "@/lib/registry";

describe("PRICE_FEEDS", () => {
  const feeds = Object.entries(PRICE_FEEDS);

  it("covers the eight named Chainlink feeds", () => {
    expect(feeds).toHaveLength(8);
  });

  it("names only real read actions and their decimals actions", () => {
    for (const [opId, feed] of feeds) {
      expect(getOperationEntry(opId)?.effectClass, opId).toBe("read");
      expect(getOperationEntry(feed.decimalsOpId)?.effectClass, feed.decimalsOpId).toBe("read");
    }
    expect(getOperationEntry("chainlink/get-round-data")?.effectClass).toBe("read");
  });

  it("lists only networks the action accepts, each with a well-formed contract", () => {
    for (const [opId, feed] of feeds) {
      const allowed = getOperationEntry(opId)?.fields.find((field) => field.key === "network")?.allowedChainIds ?? [];
      for (const [network, address] of Object.entries(feed.addresses)) {
        expect(allowed, `${opId} on ${network}`).toContain(network);
        expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
    }
  });

  it("finds a feed by its action id only", () => {
    expect(priceFeedFor("chainlink/eth-usd-latest-round-data")?.base).toBe("ETH");
    expect(priceFeedFor("chainlink/latest-round-data")).toBeUndefined();
    expect(priceFeedFor(undefined)).toBeUndefined();
  });
});

describe("previousRoundIds", () => {
  const phase = 6n << 64n;

  it("counts back within the phase, newest first", () => {
    expect(previousRoundIds(phase + 100n, 3)).toEqual([phase + 99n, phase + 98n, phase + 97n]);
  });

  it("never crosses into an earlier phase", () => {
    expect(previousRoundIds(phase + 2n, HISTORY_ROUNDS - 1)).toEqual([phase + 1n]);
    expect(previousRoundIds(phase + 1n, HISTORY_ROUNDS - 1)).toEqual([]);
  });
});
