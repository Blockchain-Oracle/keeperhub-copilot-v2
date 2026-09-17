import "server-only";

import { z } from "zod";

/*
 * The single typed gate over process.env (AD-1). Every config read in the app
 * goes through getConfig(); a raw process.env read anywhere else fails lint.
 * The envelope grows story by story — only what the current story needs.
 */
const configSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Config = z.infer<typeof configSchema>;

/*
 * The auth/session envelope (Story 1.2). Kept as a SEPARATE schema and
 * accessor from the DB config on purpose: the two subsystems fail
 * independently. A DB-only path (the singleton, scripts/verify-db.ts) must
 * not require the OAuth vars to be present, and vice versa — coupling them
 * into one required schema would make getDb() throw whenever OAuth is
 * unconfigured. Both accessors are lazy in the same 1.1 spirit.
 */
const authConfigSchema = z.object({
  KEEPERHUB_OAUTH_CLIENT_ID: z.string().min(1),
  KEEPERHUB_OAUTH_CLIENT_SECRET: z.string().min(1),
  // The issuer base URL (e.g. https://app.keeperhub.com). Trailing slash is
  // trimmed so `${issuer}/oauth/authorize` never doubles a slash.
  KEEPERHUB_OAUTH_ISSUER: z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, "")),
  // AES-256-GCM key material + cookie HMAC key. >=32 bytes for adequate
  // entropy (NFR3); distinct AES / cookie-sig keys are HKDF-derived from it,
  // never used raw.
  SESSION_SECRET: z.string().min(32),
  // The app's own public base URL (e.g. https://keeperhub-copilot.vercel.app).
  // When set, the OAuth redirect_uri, the post-auth redirects, and the session
  // cookie's Secure flag derive from it instead of trusting forwarded request
  // headers (only platform-trustworthy). Optional: absent (local dev) falls
  // back to the request headers.
  APP_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, ""))
    .optional(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

/*
 * The AI + MCP envelope (Story 1.4). A SEPARATE lazy schema and accessor, same
 * independent-failure rationale as the auth envelope: the chat subsystem must
 * fail on its own, so builds/CI pass with no env and a DB-only or OAuth-only
 * path never trips the OpenAI vars. OPENAI_API_KEY is server-only (AD-1/NFR3):
 * it never crosses to the browser. The MCP base URL derives from the OAuth
 * issuer as `${issuer}/mcp` when KEEPERHUB_MCP_URL is unset — the one field
 * that reads an auth var, resolved here so lib/mcp needs only getAiConfig().
 */
// The chat model id is env config, not a code constant (spine Deferred: exact
// model ids are OPENAI_CHAT_MODEL). This is the fallback when unset — the newest
// stable bare chat id in the installed @ai-sdk/openai model union at build time;
// set OPENAI_CHAT_MODEL to pin the deploy-time model.
const DEFAULT_CHAT_MODEL = "gpt-5.6";

const aiConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  // Preprocess "" -> undefined: a deploy platform that materializes an unset
  // override as an empty string must fall back to the default, not fail the
  // whole AI config (which would brick chat with a 500).
  OPENAI_CHAT_MODEL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(1).optional(),
  ),
  // The KeeperHub MCP endpoint. Optional: absent, it derives from the issuer.
  KEEPERHUB_MCP_URL: z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, ""))
    .optional(),
  // Read only to derive KEEPERHUB_MCP_URL when that is unset; trimmed like the
  // auth envelope's copy so `${issuer}/mcp` never doubles a slash.
  KEEPERHUB_OAUTH_ISSUER: z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, ""))
    .optional(),
  // Story 2.3: the confirm ceremony secret. The AI SDK HMAC-signs every write
  // approval over [tool, callId, input] with this key and verifies it fail-closed
  // on resume (AD-5) — so a forged or replayed client boolean approves nothing.
  // Server-only (AD-1/NFR3), >=32 bytes for entropy (mirrors SESSION_SECRET).
  // Lives on the AI envelope because it is consumed at the chat streamText seam.
  TOOL_APPROVAL_SECRET: z.string().min(32),
});

/*
 * The public platform envelope: KeeperHub's base URL for credential-free reads
 * (the chain list). Everything optional, so the landing page works with no env.
 */
const DEFAULT_KEEPERHUB_URL = "https://app.keeperhub.com";

const platformConfigSchema = z.object({
  KEEPERHUB_URL: z
    .url({ protocol: /^https?$/ })
    .transform((value) => value.replace(/\/+$/, ""))
    .optional(),
});

export type PlatformConfig = { keeperhubUrl: string };

/*
 * The voice envelope (slice 9). Its own lazy schema like the others, so chat
 * keeps working when voice is not configured. The realtime model and voice have
 * defaults; VOICE_SESSION_SECONDS shortens the ten-minute session (decision 29)
 * for a test.
 */
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
export const DEFAULT_VOICE_SESSION_SECONDS = 600;

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const voiceConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_REALTIME_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_REALTIME_VOICE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  VOICE_SESSION_SECONDS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(60).max(3600).optional()),
});

export type VoiceConfig = {
  /** Server-side only: mints the browser's short-lived realtime key. */
  openaiApiKey: string;
  realtimeModel: string;
  /** An OpenAI voice name, or null for the model's default. */
  realtimeVoice: string | null;
  sessionSeconds: number;
};

export function parseVoiceConfig(env: Record<string, string | undefined>): VoiceConfig {
  const result = voiceConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid voice configuration. ${formatIssues(result.error)}`);
  }
  return {
    openaiApiKey: result.data.OPENAI_API_KEY,
    realtimeModel: result.data.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
    realtimeVoice: result.data.OPENAI_REALTIME_VOICE ?? null,
    sessionSeconds: result.data.VOICE_SESSION_SECONDS ?? DEFAULT_VOICE_SESSION_SECONDS,
  };
}

/** The resolved AI config: defaults applied, MCP URL derived. */
export type AiConfig = {
  /** Server-side only; passed explicitly to the OpenAI provider factory. */
  openaiApiKey: string;
  chatModel: string;
  keeperhubMcpUrl: string;
  /** Server-only (AD-1). The AI SDK's `experimental_toolApprovalSecret`: the
   *  HMAC key that makes the confirm ceremony unforgeable (Story 2.3, AD-5). */
  toolApprovalSecret: string;
};

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid server configuration. ${formatIssues(result.error)}`);
  }
  return result.data;
}

export function parseAuthConfig(
  env: Record<string, string | undefined>,
): AuthConfig {
  const result = authConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid auth configuration. ${formatIssues(result.error)}`);
  }
  return result.data;
}

export function parseAiConfig(
  env: Record<string, string | undefined>,
): AiConfig {
  const result = aiConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid AI configuration. ${formatIssues(result.error)}`);
  }
  const data = result.data;
  const keeperhubMcpUrl =
    data.KEEPERHUB_MCP_URL ??
    (data.KEEPERHUB_OAUTH_ISSUER !== undefined
      ? `${data.KEEPERHUB_OAUTH_ISSUER}/mcp`
      : undefined);
  if (keeperhubMcpUrl === undefined) {
    throw new Error(
      "Invalid AI configuration. Set KEEPERHUB_MCP_URL, or KEEPERHUB_OAUTH_ISSUER to derive it.",
    );
  }
  return {
    openaiApiKey: data.OPENAI_API_KEY,
    chatModel: data.OPENAI_CHAT_MODEL ?? DEFAULT_CHAT_MODEL,
    keeperhubMcpUrl,
    toolApprovalSecret: data.TOOL_APPROVAL_SECRET,
  };
}

export function parsePlatformConfig(
  env: Record<string, string | undefined>,
): PlatformConfig {
  const result = platformConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid platform configuration. ${formatIssues(result.error)}`);
  }
  return { keeperhubUrl: result.data.KEEPERHUB_URL ?? DEFAULT_KEEPERHUB_URL };
}

let cached: Config | undefined;
let cachedAuth: AuthConfig | undefined;
let cachedAi: AiConfig | undefined;
let cachedPlatform: PlatformConfig | undefined;
let cachedVoice: VoiceConfig | undefined;

/* The voice envelope, resolved lazily when a voice session starts. */
export function getVoiceConfig(): VoiceConfig {
  cachedVoice ??= parseVoiceConfig(process.env);
  return cachedVoice;
}

export function getPlatformConfig(): PlatformConfig {
  cachedPlatform ??= parsePlatformConfig(process.env);
  return cachedPlatform;
}

/*
 * Validation is lazy: builds and CI must pass with no env vars set. Only code
 * that actually needs configuration (the DB singleton, scripts/verify-db.ts)
 * triggers it on first access.
 */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}

/*
 * The auth envelope, resolved lazily on first use by the session layer. Absent
 * until Story 1.2's OAuth client is registered — so it is never read at import
 * time, only inside request handlers that actually sign in or refresh.
 */
export function getAuthConfig(): AuthConfig {
  cachedAuth ??= parseAuthConfig(process.env);
  return cachedAuth;
}

/*
 * The AI envelope, resolved lazily on first use by the chat route and the MCP
 * client. Absent until Story 1.4's chat path runs — never read at import time.
 */
export function getAiConfig(): AiConfig {
  cachedAi ??= parseAiConfig(process.env);
  return cachedAi;
}
