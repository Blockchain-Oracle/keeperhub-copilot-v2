import { describe, expect, it } from "vitest";

import { formatDecimalString } from "@/lib/format";

const FOUR = { maxDp: 4, minDp: 4 };

describe("formatDecimalString", () => {
  it("truncates the platform's decimal string, never rounds", () => {
    expect(formatDecimalString("0.042199999999999999", FOUR)).toBe("0.0421");
  });

  it("pads a whole number to the minimum places", () => {
    expect(formatDecimalString("1", FOUR)).toBe("1.0000");
  });

  it("groups thousands", () => {
    expect(formatDecimalString("12345.5", FOUR)).toBe("12,345.5000");
  });

  it("refuses anything that is not a plain decimal", () => {
    for (const value of ["", "abc", "1e18", "0x10", "1.2.3", "."]) {
      expect(formatDecimalString(value, FOUR)).toBeNull();
    }
  });
});
