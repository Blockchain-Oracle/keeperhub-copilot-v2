import { describe, expect, it } from "vitest";

import { unbrokenRun } from "@/lib/price-feeds";

describe("price chart history", () => {
  it("keeps the unbroken run back from the newest round, oldest first", () => {
    expect(unbrokenRun([3, 2, 1])).toEqual([1, 2, 3]);
  });

  it("stops at the first round that did not answer, so the line never bridges a gap", () => {
    expect(unbrokenRun([5, 4, null, 2, 1])).toEqual([4, 5]);
    expect(unbrokenRun([null, 4, 3])).toEqual([]);
    expect(unbrokenRun([])).toEqual([]);
  });
});
