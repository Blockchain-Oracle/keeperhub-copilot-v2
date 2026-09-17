import { describe, expect, it } from "vitest";

import {
  DEFAULT_NETWORK_ID,
  parseNetworkCookie,
  readNetworkFromCookieHeader,
  serializeNetworkCookie,
} from "@/lib/network";

describe("network cookie", () => {
  it("defaults to Base Sepolia when nothing was picked", () => {
    expect(DEFAULT_NETWORK_ID).toBe("84532");
    expect(parseNetworkCookie(undefined)).toBe("84532");
    expect(readNetworkFromCookieHeader(null)).toBe("84532");
    expect(readNetworkFromCookieHeader("kh_session=abc")).toBe("84532");
  });

  it("reads the pick out of a cookie header among other cookies", () => {
    expect(readNetworkFromCookieHeader("kh_session=abc; kh_network=8453; theme=dark")).toBe("8453");
  });

  it("ignores a malformed value rather than trusting it", () => {
    expect(parseNetworkCookie("base")).toBe("84532");
    expect(parseNetworkCookie("8453 OR 1")).toBe("84532");
    expect(readNetworkFromCookieHeader("kh_network=")).toBe("84532");
  });

  it("keeps a network the platform lists that lib/chains does not name yet", () => {
    expect(parseNetworkCookie("999999")).toBe("999999");
  });

  it("round-trips through the cookie it writes", () => {
    const cookie = serializeNetworkCookie("42161");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(readNetworkFromCookieHeader(cookie.split(";")[0] ?? "")).toBe("42161");
  });
});
