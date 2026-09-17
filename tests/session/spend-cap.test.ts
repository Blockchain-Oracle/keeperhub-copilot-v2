import { describe, expect, it } from "vitest";

import { parseSpendCap } from "@/lib/session/spend-cap";

describe("parseSpendCap", () => {
  it("reads the enforced EVM cap and today's usage", () => {
    expect(
      parseSpendCap({
        dailyCapWei: null,
        dailyUsedWei: "25000000000000000",
        effectiveDailyCapWei: "100000000000000000",
        usingDefaultDailyCap: true,
        dailySolanaUsedLamports: "0",
      }),
    ).toEqual({ usedWei: "25000000000000000", capWei: "100000000000000000", platformDefault: true });
  });

  it("uses the effective cap, not the org's own null cap", () => {
    expect(
      parseSpendCap({ dailyCapWei: null, dailyUsedWei: "0", effectiveDailyCapWei: "5", usingDefaultDailyCap: true }),
    ).toMatchObject({ capWei: "5" });
  });

  it("returns null rather than a figure it cannot trust", () => {
    expect(parseSpendCap(null)).toBeNull();
    expect(parseSpendCap({ dailyUsedWei: 5, effectiveDailyCapWei: "5" })).toBeNull();
    expect(parseSpendCap({ dailyUsedWei: "-1", effectiveDailyCapWei: "5" })).toBeNull();
    expect(parseSpendCap({ dailyUsedWei: "1.5", effectiveDailyCapWei: "5" })).toBeNull();
    expect(parseSpendCap({ error: "Unauthorized" })).toBeNull();
  });
});
