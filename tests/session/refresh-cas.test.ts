import { describe, expect, it } from "vitest";

import type { SessionRow } from "@/lib/data";
import { OAuthTokenError } from "@/lib/session/oauth";
import { refreshSessionTokens, SessionDeadError } from "@/lib/session/refresh";

const T0 = 1_000_000_000_000;
const FAR_FUTURE = new Date(2_000_000_000_000);

function makeRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "sess-1",
    userId: "user-1",
    orgId: "org-1",
    scope: "mcp:read mcp:write",
    accessTokenCiphertext: "enc(old-access)",
    refreshTokenCiphertext: "enc(old-refresh)",
    accessTokenExpiresAt: new Date(T0),
    refreshTokenExpiresAt: new Date(T0 + 30 * 86_400_000),
    createdAt: new Date(T0),
    lastSeenAt: new Date(T0),
    ...overrides,
  };
}

const encFake = (plaintext: string): string => `enc(${plaintext})`;
const decFake = (blob: string): string => blob.replace(/^enc\(|\)$/g, "");
const tokens = (accessToken: string, refreshToken: string) => ({
  accessToken,
  refreshToken,
  scope: "mcp:read mcp:write",
  expiresInSeconds: 3600,
});

describe("refreshSessionTokens (single-flight CAS)", () => {
  it("winner: stores and returns the freshly minted pair when the CAS matches", async () => {
    const captured: { expected?: string; refreshCipher?: string } = {};
    const result = await refreshSessionTokens(makeRow(), {
      refreshAccessToken: async () => tokens("new-access", "new-refresh"),
      rotate: async (id, expected, next) => {
        captured.expected = expected;
        captured.refreshCipher = next.refreshTokenCiphertext;
        return makeRow({
          id,
          accessTokenCiphertext: next.accessTokenCiphertext,
          refreshTokenCiphertext: next.refreshTokenCiphertext,
        });
      },
      reRead: async () => {
        throw new Error("must not re-read on a win");
      },
      encrypt: encFake,
      decrypt: decFake,
      now: () => T0,
    });

    expect(result.accessToken).toBe("new-access");
    expect(captured.expected).toBe("enc(old-refresh)");
    expect(captured.refreshCipher).toBe("enc(new-refresh)");
  });

  it("loser: re-reads and rides the concurrent winner's pair when the CAS misses", async () => {
    const concurrent = makeRow({
      accessTokenCiphertext: "enc(concurrent-access)",
      refreshTokenCiphertext: "enc(concurrent-refresh)",
      accessTokenExpiresAt: FAR_FUTURE,
    });
    const result = await refreshSessionTokens(makeRow(), {
      refreshAccessToken: async () => tokens("mine-access", "mine-refresh"),
      rotate: async () => null,
      reRead: async () => concurrent,
      encrypt: encFake,
      decrypt: decFake,
      now: () => T0,
    });

    expect(result.row).toBe(concurrent);
    expect(result.accessToken).toBe("concurrent-access");
  });

  it("recovers when our refresh call fails but a concurrent winner left a valid token", async () => {
    const concurrent = makeRow({
      refreshTokenCiphertext: "enc(rotated-refresh)",
      accessTokenCiphertext: "enc(fresh-access)",
      accessTokenExpiresAt: FAR_FUTURE,
    });
    const result = await refreshSessionTokens(makeRow(), {
      refreshAccessToken: async () => {
        throw new OAuthTokenError("rotated", 400, "");
      },
      rotate: async () => {
        throw new Error("must not rotate after a failed token call");
      },
      reRead: async () => concurrent,
      encrypt: encFake,
      decrypt: decFake,
      now: () => 1_500_000_000_000,
    });

    expect(result.accessToken).toBe("fresh-access");
  });

  it("marks the session dead when the refresh fails and no fresh row exists", async () => {
    await expect(
      refreshSessionTokens(makeRow(), {
        refreshAccessToken: async () => {
          throw new OAuthTokenError("expired", 400, "");
        },
        rotate: async () => {
          throw new Error("must not rotate");
        },
        reRead: async () => null,
        encrypt: encFake,
        decrypt: decFake,
        now: () => T0,
      }),
    ).rejects.toBeInstanceOf(SessionDeadError);
  });

  it("marks the session dead when re-read shows no concurrent rotation", async () => {
    await expect(
      refreshSessionTokens(makeRow(), {
        refreshAccessToken: async () => {
          throw new OAuthTokenError("revoked", 401, "");
        },
        rotate: async () => {
          throw new Error("must not rotate");
        },
        // same refresh ciphertext -> nobody rotated -> genuinely dead
        reRead: async () => makeRow(),
        encrypt: encFake,
        decrypt: decFake,
        now: () => T0,
      }),
    ).rejects.toBeInstanceOf(SessionDeadError);
  });
});
