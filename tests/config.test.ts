import { describe, expect, it } from "vitest";

import { parseAiConfig, parseAuthConfig, parseConfig } from "@/lib/config";

const VALID_AUTH_ENV = {
  KEEPERHUB_OAUTH_CLIENT_ID: "client-abc",
  KEEPERHUB_OAUTH_CLIENT_SECRET: "a".repeat(32),
  KEEPERHUB_OAUTH_ISSUER: "https://app.keeperhub.com",
  SESSION_SECRET: "s".repeat(32),
};

describe("parseConfig", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() =>
      parseConfig({ DATABASE_URL: "not-a-connection-string" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    expect(() => parseConfig({ DATABASE_URL: "https://example.com" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("accepts a Neon pooled connection string", () => {
    const url =
      "postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    expect(parseConfig({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("ignores the OAuth vars — DB config is a separate concern", () => {
    // Absent OAuth vars must NOT break DATABASE_URL validation: the two
    // subsystems validate independently so a DB-only script never needs the
    // auth envelope set.
    const url =
      "postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    expect(() => parseConfig({ DATABASE_URL: url })).not.toThrow();
  });
});

describe("parseAuthConfig", () => {
  it("accepts a fully-populated auth envelope", () => {
    const config = parseAuthConfig(VALID_AUTH_ENV);
    expect(config.KEEPERHUB_OAUTH_CLIENT_ID).toBe("client-abc");
    expect(config.KEEPERHUB_OAUTH_ISSUER).toBe("https://app.keeperhub.com");
  });

  it("strips a trailing slash from the issuer so endpoint joins are exact", () => {
    const config = parseAuthConfig({
      ...VALID_AUTH_ENV,
      KEEPERHUB_OAUTH_ISSUER: "https://app.keeperhub.com/",
    });
    expect(config.KEEPERHUB_OAUTH_ISSUER).toBe("https://app.keeperhub.com");
  });

  it("rejects a missing client id", () => {
    const incomplete: Partial<typeof VALID_AUTH_ENV> = { ...VALID_AUTH_ENV };
    delete incomplete.KEEPERHUB_OAUTH_CLIENT_ID;
    expect(() => parseAuthConfig(incomplete)).toThrow(/KEEPERHUB_OAUTH_CLIENT_ID/);
  });

  it("rejects a non-url issuer", () => {
    expect(() =>
      parseAuthConfig({ ...VALID_AUTH_ENV, KEEPERHUB_OAUTH_ISSUER: "app.keeperhub.com" }),
    ).toThrow(/KEEPERHUB_OAUTH_ISSUER/);
  });

  it("rejects a SESSION_SECRET shorter than 32 bytes", () => {
    expect(() =>
      parseAuthConfig({ ...VALID_AUTH_ENV, SESSION_SECRET: "tooshort" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("treats APP_BASE_URL as optional (absent is fine)", () => {
    expect(parseAuthConfig(VALID_AUTH_ENV).APP_BASE_URL).toBeUndefined();
  });

  it("accepts APP_BASE_URL and strips its trailing slash", () => {
    const config = parseAuthConfig({
      ...VALID_AUTH_ENV,
      APP_BASE_URL: "https://keeperhub-copilot.vercel.app/",
    });
    expect(config.APP_BASE_URL).toBe("https://keeperhub-copilot.vercel.app");
  });

  it("rejects a non-url APP_BASE_URL", () => {
    expect(() =>
      parseAuthConfig({ ...VALID_AUTH_ENV, APP_BASE_URL: "not-a-url" }),
    ).toThrow(/APP_BASE_URL/);
  });
});

describe("parseAiConfig", () => {
  const VALID_AI_ENV = {
    OPENAI_API_KEY: "sk-test-key",
    KEEPERHUB_MCP_URL: "https://app.keeperhub.com/mcp",
    // Story 2.3: the confirm ceremony's HMAC secret (>=32 bytes). Required from
    // the moment writes can run — a missing secret means the AI SDK cannot sign
    // approvals and every confirm would fail closed, so the config refuses to load.
    TOOL_APPROVAL_SECRET: "t".repeat(32),
  };

  it("accepts a minimal envelope and applies the default chat model", () => {
    const config = parseAiConfig(VALID_AI_ENV);
    expect(config.openaiApiKey).toBe("sk-test-key");
    expect(config.keeperhubMcpUrl).toBe("https://app.keeperhub.com/mcp");
    // A non-empty default is applied; the exact id is env config (Deferred).
    expect(config.chatModel).toMatch(/\S/);
  });

  it("exposes TOOL_APPROVAL_SECRET as toolApprovalSecret (Story 2.3)", () => {
    const config = parseAiConfig(VALID_AI_ENV);
    expect(config.toolApprovalSecret).toBe("t".repeat(32));
  });

  it("rejects a missing TOOL_APPROVAL_SECRET (writes cannot sign approvals without it)", () => {
    const incomplete: Partial<typeof VALID_AI_ENV> = { ...VALID_AI_ENV };
    delete incomplete.TOOL_APPROVAL_SECRET;
    expect(() => parseAiConfig(incomplete)).toThrow(/TOOL_APPROVAL_SECRET/);
  });

  it("rejects a TOOL_APPROVAL_SECRET shorter than 32 bytes", () => {
    expect(() =>
      parseAiConfig({ ...VALID_AI_ENV, TOOL_APPROVAL_SECRET: "tooshort" }),
    ).toThrow(/TOOL_APPROVAL_SECRET/);
  });

  it("lets OPENAI_CHAT_MODEL override the default", () => {
    const config = parseAiConfig({ ...VALID_AI_ENV, OPENAI_CHAT_MODEL: "gpt-4.1" });
    expect(config.chatModel).toBe("gpt-4.1");
  });

  it("derives the MCP url from the OAuth issuer when KEEPERHUB_MCP_URL is unset", () => {
    const config = parseAiConfig({
      OPENAI_API_KEY: "sk-test-key",
      KEEPERHUB_OAUTH_ISSUER: "https://app.keeperhub.com",
      TOOL_APPROVAL_SECRET: "t".repeat(32),
    });
    expect(config.keeperhubMcpUrl).toBe("https://app.keeperhub.com/mcp");
  });

  it("derives the MCP url even when the issuer carries a trailing slash", () => {
    const config = parseAiConfig({
      OPENAI_API_KEY: "sk-test-key",
      KEEPERHUB_OAUTH_ISSUER: "https://app.keeperhub.com/",
      TOOL_APPROVAL_SECRET: "t".repeat(32),
    });
    expect(config.keeperhubMcpUrl).toBe("https://app.keeperhub.com/mcp");
  });

  it("prefers an explicit KEEPERHUB_MCP_URL over issuer derivation and trims it", () => {
    const config = parseAiConfig({
      OPENAI_API_KEY: "sk-test-key",
      KEEPERHUB_MCP_URL: "https://mcp.internal.example.com/mcp/",
      KEEPERHUB_OAUTH_ISSUER: "https://app.keeperhub.com",
      TOOL_APPROVAL_SECRET: "t".repeat(32),
    });
    expect(config.keeperhubMcpUrl).toBe("https://mcp.internal.example.com/mcp");
  });

  it("rejects a missing OPENAI_API_KEY", () => {
    expect(() =>
      parseAiConfig({ KEEPERHUB_MCP_URL: "https://app.keeperhub.com/mcp" }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("throws when neither an explicit MCP url nor an issuer is present", () => {
    expect(() =>
      parseAiConfig({
        OPENAI_API_KEY: "sk-test-key",
        TOOL_APPROVAL_SECRET: "t".repeat(32),
      }),
    ).toThrow(/KEEPERHUB_MCP_URL|KEEPERHUB_OAUTH_ISSUER/);
  });

  it("rejects a non-url KEEPERHUB_MCP_URL", () => {
    expect(() =>
      parseAiConfig({ OPENAI_API_KEY: "sk-test-key", KEEPERHUB_MCP_URL: "not-a-url" }),
    ).toThrow(/KEEPERHUB_MCP_URL/);
  });
});
