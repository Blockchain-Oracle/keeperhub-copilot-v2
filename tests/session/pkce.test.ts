import { describe, expect, it } from "vitest";

import {
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
} from "@/lib/session/pkce";

describe("PKCE (S256)", () => {
  it("matches the RFC 7636 Appendix B S256 test vector", () => {
    // verifier -> challenge from RFC 7636 §Appendix B. Proves the exact
    // base64url(SHA-256(verifier)) transform the token endpoint re-derives.
    expect(
      codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates verifiers within the RFC 7636 unreserved charset and length", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    }
  });

  it("generates unique verifiers and states", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
    expect(generateState()).not.toBe(generateState());
  });
});
