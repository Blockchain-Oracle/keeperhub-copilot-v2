import { describe, expect, it } from "vitest";

import { groupParts, lookupIsAnswer, showsCard } from "@/components/chat/chat-rules";

const text = (value: string) => ({ type: "text", text: value });
const tool = (name: string, state = "output-available") => ({ type: `tool-${name}`, state });

describe("groupParts", () => {
  it("collapses consecutive tool calls into one run across step markers and blank text", () => {
    const parts = [
      text("Checking."),
      { type: "step-start" },
      tool("search_actions"),
      { type: "step-start" },
      text("  "),
      tool("execute_protocol_action"),
      text("Done."),
    ];
    expect(groupParts(parts)).toEqual([
      { kind: "part", index: 0 },
      { kind: "tools", indices: [2, 5] },
      { kind: "part", index: 6 },
    ]);
  });

  it("starts a new run after written text", () => {
    expect(groupParts([tool("a"), text("between"), tool("b")])).toEqual([
      { kind: "tools", indices: [0] },
      { kind: "part", index: 1 },
      { kind: "tools", indices: [2] },
    ]);
  });
});

describe("lookupIsAnswer (decision 12)", () => {
  it("keeps a lookup followed by a read inside the line", () => {
    const parts = [tool("search_actions"), tool("execute_protocol_action"), text("ETH is at 4,012 USD.")];
    expect(lookupIsAnswer(parts, 0, true)).toBe(false);
    expect(showsCard(parts, 0, true)).toBe(false);
    expect(showsCard(parts, 1, true)).toBe(true);
  });

  it("gives the lookup a card once the assistant writes after it", () => {
    expect(lookupIsAnswer([tool("search_actions"), text("Aave V3 offers these.")], 0, false)).toBe(true);
  });

  it("waits while the turn is still running with nothing after it", () => {
    expect(lookupIsAnswer([tool("search_actions")], 0, false)).toBe(false);
    expect(lookupIsAnswer([tool("search_actions")], 0, true)).toBe(true);
  });

  it("only applies to lookups", () => {
    expect(lookupIsAnswer([tool("execute_transfer")], 0, true)).toBe(false);
    expect(showsCard([tool("execute_transfer", "approval-requested")], 0, false)).toBe(true);
  });
});
