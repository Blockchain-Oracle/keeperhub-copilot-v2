import { describe, expect, it } from "vitest";

import { contractLink, readBalance, readDecimals, readResult, readRound } from "@/lib/read-results";

describe("readResult", () => {
  it("unwraps a protocol read's named outputs", () => {
    expect(readResult({ success: true, result: { answer: "1" }, addressLink: "https://etherscan.io/address/0x1" })).toEqual({
      answer: "1",
    });
  });

  it("drops the success flag and an empty error from a plugin step", () => {
    expect(readResult({ success: true, balance: "0.1", error: "" })).toEqual({ balance: "0.1" });
  });

  it("passes a scalar through", () => {
    expect(readResult("42")).toBe("42");
  });
});

describe("contractLink", () => {
  it("returns the explorer link of a protocol read", () => {
    expect(contractLink({ success: true, result: {}, addressLink: "https://etherscan.io/address/0x1" })).toBe(
      "https://etherscan.io/address/0x1",
    );
  });

  it("ignores anything that is not a web link", () => {
    expect(contractLink({ success: true, result: {}, addressLink: "javascript:alert(1)" })).toBeUndefined();
  });
});

describe("readRound", () => {
  const round = {
    roundId: "110680464442257320164",
    answer: "401234000000",
    startedAt: "1757750000",
    updatedAt: "1757750000",
    answeredInRound: "110680464442257320164",
  };

  it("reads a latestRoundData result", () => {
    expect(readRound({ success: true, result: round })).toEqual({
      roundId: 110680464442257320164n,
      answer: 401234000000n,
      updatedAt: 1757750000,
    });
  });

  it("rejects a round that never happened", () => {
    expect(readRound({ success: true, result: { ...round, updatedAt: "0" } })).toBeNull();
  });

  it("rejects an answer that is not a whole number", () => {
    expect(readRound({ success: true, result: { ...round, answer: "4012.34" } })).toBeNull();
  });
});

describe("readDecimals", () => {
  it("reads the named output or the bare value", () => {
    expect(readDecimals({ success: true, result: { decimals: "8" } })).toBe(8);
    expect(readDecimals({ success: true, result: 18 })).toBe(18);
  });

  it("returns null for a failed read", () => {
    expect(readDecimals({ success: false, error: "reverted" })).toBeNull();
  });
});

describe("readBalance", () => {
  const address = "0x1111111111111111111111111111111111111111";

  it("reads a native balance in raw units with the network's decimals", () => {
    const data = { success: true, balance: "0.1", balanceWei: "100000000000000000", address };
    expect(readBalance("web3/check-balance", data, 18)).toEqual({ address, raw: 100000000000000000n, decimals: 18 });
    expect(readBalance("web3/check-balance", data, undefined)).toBeNull();
  });

  it("reads a token balance with its own decimals and symbol", () => {
    const data = {
      success: true,
      balance: { balance: "1.5", balanceRaw: "1500000", symbol: "USDC", decimals: 6, name: "USD Coin" },
      address,
    };
    expect(readBalance("web3/check-token-balance", data, undefined)).toEqual({
      address,
      raw: 1500000n,
      decimals: 6,
      symbol: "USDC",
    });
  });

  it("returns null for any other operation or shape", () => {
    expect(readBalance("web3/check-balance", { success: true, address }, 18)).toBeNull();
    expect(readBalance("chainlink/eth-usd-latest-round-data", { success: true, address }, 18)).toBeNull();
  });
});
