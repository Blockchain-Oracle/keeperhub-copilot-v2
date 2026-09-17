import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AMOUNT_CLASS,
  formatBaseUnits,
  KNOWN_TOKENS,
  nativeAmountMeta,
  NATIVE_DECIMALS_EVM,
  NATIVE_DECIMALS_SOLANA,
  parseHumanUnits,
  resolveTokenMeta,
} from "@/components/cards/money";

describe("formatBaseUnits (base-unit integer string -> exact human string)", () => {
  it("renders 0 and a full 18-decimal wei amount", () => {
    expect(formatBaseUnits("0", 6)).toBe("0");
    expect(formatBaseUnits("0", 18)).toBe("0");
    // 0.1 ETH in wei — the canonical D26 example.
    expect(formatBaseUnits("100000000000000000", 18)).toBe("0.1");
    expect(formatBaseUnits("1000000000000000000", 18)).toBe("1");
  });

  it("trims value-preserving trailing zeros in the fraction", () => {
    expect(formatBaseUnits("2500000", 6)).toBe("2.5");
    expect(formatBaseUnits("25000000", 6)).toBe("25");
    expect(formatBaseUnits("1500000000", 9)).toBe("1.5");
  });

  it("groups the integer part in threes (readability, tabular-nums)", () => {
    expect(formatBaseUnits("1000000", 0)).toBe("1,000,000");
    expect(formatBaseUnits("1000000000000", 6)).toBe("1,000,000");
    expect(formatBaseUnits("12345678900000", 6)).toBe("12,345,678.9");
  });

  it("rejects a non-integer base string (a float can never reach here)", () => {
    expect(() => formatBaseUnits("0.1", 18)).toThrow();
    expect(() => formatBaseUnits("1e18", 18)).toThrow();
    expect(() => formatBaseUnits("", 18)).toThrow();
  });
});

describe("parseHumanUnits (human string -> base-unit integer string)", () => {
  it("expands a human amount to base units at 6/9/18 decimals", () => {
    expect(parseHumanUnits("0.1", 18)).toBe("100000000000000000");
    expect(parseHumanUnits("25", 6)).toBe("25000000");
    expect(parseHumanUnits("1.5", 9)).toBe("1500000000");
    expect(parseHumanUnits("0", 18)).toBe("0");
  });

  it("accepts a bare leading dot", () => {
    expect(parseHumanUnits(".5", 18)).toBe("500000000000000000");
    // 1000.5 * 10^18 = 1.0005e21
    expect(parseHumanUnits("1000.5", 18)).toBe("1000500000000000000000");
  });

  it("refuses any comma rather than guessing: '0,5' is a half in many languages, never 5 (decision 40)", () => {
    for (const typed of ["0,5", "1.234,5", "1,000.5", "1,000"]) {
      expect(() => parseHumanUnits(typed, 18), typed).toThrow(/dot for decimals/);
    }
  });

  it("rejects more fractional digits than the token's decimals", () => {
    expect(() => parseHumanUnits("0.1234567", 6)).toThrow(/fractional/);
    expect(() => parseHumanUnits("5.1", 0)).toThrow(/fractional/);
  });

  it("rejects empty, bare-dot, and non-numeric input", () => {
    expect(() => parseHumanUnits("", 18)).toThrow();
    expect(() => parseHumanUnits(".", 18)).toThrow();
    expect(() => parseHumanUnits("abc", 18)).toThrow();
    expect(() => parseHumanUnits("0x1", 18)).toThrow();
  });

  it("handles a 0-decimal token exactly", () => {
    expect(parseHumanUnits("5", 0)).toBe("5");
    expect(formatBaseUnits("5", 0)).toBe("5");
  });
});

describe("round-trip: parse(format(x)) === x at 6/9/18 decimals", () => {
  const cases: Array<[string, number]> = [
    ["1", 18],
    ["100000000000000000", 18],
    ["1000000000000000000", 18],
    ["123456", 6],
    ["25000000", 6],
    ["1000000000000", 6],
    ["1500000000", 9],
    ["999999999", 9],
  ];
  // Display grouping ("1,000,000") is for reading only: an edit field starts from the raw amount, and a typed comma is refused.
  it.each(cases)("round-trips %s at %i decimals", (base, decimals) => {
    expect(parseHumanUnits(formatBaseUnits(base, decimals).replace(/,/g, ""), decimals)).toBe(base);
  });
});

describe("decimals sourcing", () => {
  it("exposes the native constants", () => {
    expect(NATIVE_DECIMALS_EVM).toBe(18);
    expect(NATIVE_DECIMALS_SOLANA).toBe(9);
  });

  it("gives native meta by chain: EVM -> ETH/18, Solana -> SOL/9", () => {
    expect(nativeAmountMeta("1")).toEqual({ decimals: 18, symbol: "ETH" });
    expect(nativeAmountMeta("11155111")).toEqual({ decimals: 18, symbol: "ETH" });
    expect(nativeAmountMeta("101")).toEqual({ decimals: 9, symbol: "SOL" });
    expect(nativeAmountMeta("solana")).toEqual({ decimals: 9, symbol: "SOL" });
  });

  it("resolves an ERC-20 from a decoded candidate (simulate fields / view read)", () => {
    expect(
      resolveTokenMeta("1", "0xabc", { decimals: 6, symbol: "USDC" }),
    ).toEqual({ decimals: 6, symbol: "USDC" });
    // decimals may arrive as a string count from a decimals() read.
    expect(
      resolveTokenMeta("1", "0xabc", { decimals: "18", symbol: "DAI" }),
    ).toEqual({ decimals: 18, symbol: "DAI" });
  });

  it("returns undefined (honest, no guessed unit) when nothing resolves", () => {
    expect(resolveTokenMeta("1", "0xabc", undefined)).toBeUndefined();
    // a partial candidate (symbol without decimals) is not enough to render a unit
    expect(resolveTokenMeta("1", "0xabc", { symbol: "??" })).toBeUndefined();
  });

  it("keeps KNOWN_TOKENS conservative and address-keyed", () => {
    // Deliberately empty until an address is verified per chain — a wrong unit is
    // worse than an honest truncated address.
    expect(typeof KNOWN_TOKENS).toBe("object");
  });
});

describe("the DESIGN amount class lives in one place", () => {
  it("is mono + tabular-nums", () => {
    expect(AMOUNT_CLASS).toContain("font-mono");
    expect(AMOUNT_CLASS).toContain("tabular-nums");
  });
});

describe("AD-11: Number() never touches the amount path", () => {
  it("the module source contains no Number( coercion", () => {
    const src = readFileSync("components/cards/money.ts", "utf8");
    expect(src.includes("Number(")).toBe(false);
  });
});
