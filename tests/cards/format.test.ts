import { describe, expect, it } from "vitest";

import {
  addressAnnouncement,
  classifyScalar,
  hashAnnouncement,
  humanizeKey,
  shortMiddle,
} from "@/components/cards/format";

const ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const HASH = "0x" + "a".repeat(64);

describe("classifyScalar", () => {
  it("recognizes a 20-byte hex address", () => {
    expect(classifyScalar(ADDRESS)).toBe("address");
  });

  it("recognizes a 32-byte hex hash", () => {
    expect(classifyScalar(HASH)).toBe("hash");
  });

  it("treats long integer strings (base-unit amounts) as numbers", () => {
    expect(classifyScalar("1000000000000000000")).toBe("number");
    expect(classifyScalar(42)).toBe("number");
  });

  it("classifies booleans and plain text", () => {
    expect(classifyScalar(true)).toBe("boolean");
    expect(classifyScalar("bob.eth")).toBe("text");
    // A short 0x string is not a full address — plain text.
    expect(classifyScalar("0x123")).toBe("text");
  });
});

describe("shortMiddle", () => {
  it("truncates the middle of a long value and keeps a short one intact", () => {
    expect(shortMiddle(ADDRESS)).toBe("0x1c7D…7238");
    expect(shortMiddle("short")).toBe("short");
  });
});

describe("humanizeKey", () => {
  it("turns snake_case, camelCase, and kebab-case into sentence-case words", () => {
    expect(humanizeKey("required_scope")).toBe("Required scope");
    // camelCase words each keep their capital: a nicer label than "Upgrade url".
    expect(humanizeKey("upgradeUrl")).toBe("Upgrade Url");
    expect(humanizeKey("eth-usd")).toBe("Eth usd");
    expect(humanizeKey("value")).toBe("Value");
  });

  it("drops a leading underscore (hidden-field convention)", () => {
    expect(humanizeKey("_protocolMeta")).toBe("Protocol Meta");
  });
});

describe("announcements never spell hex", () => {
  it("announces an address / hash by its last four", () => {
    expect(addressAnnouncement(ADDRESS)).toBe("address ending 7238");
    expect(hashAnnouncement(HASH)).toBe("hash ending aaaa");
  });
});
