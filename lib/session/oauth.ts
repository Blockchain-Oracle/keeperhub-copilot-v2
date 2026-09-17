import "server-only";

import { z } from "zod";

import { getAuthConfig } from "@/lib/config";

/*
 * The KeeperHub OAuth 2.1 protocol, hand-rolled (no arctic/jose/next-auth).
 * The platform is standards-compliant and the dance is small; hand-rolling
 * keeps the AD-1/AD-9 boundaries exact and uses only node:crypto + fetch.
 *
 * Verified against references/keeperhub @ 9d510a1:
 *  - authorize = {ISSUER}/oauth/authorize, token = {ISSUER}/api/oauth/token
 *  - S256 mandatory; plain is rejected
 *  - confidential client via client_secret_post (client_id + client_secret in body)
 *  - access token = HS256 JWT {sub, org, scope, iat, exp}; refresh rotates on use
 */

export const DEFAULT_SCOPE = "mcp:read mcp:write";

// Bound the token-endpoint round-trip so a hung endpoint fails fast rather
// than stalling the request (and, transitively, an SSR render) indefinitely.
const TOKEN_FETCH_TIMEOUT_MS = 10_000;

/** The token endpoint rejected the grant (bad/rotated refresh token, etc.). */
export class OAuthTokenError extends Error {
  readonly status: number;
  readonly detail: string;
  constructor(message: string, status: number, detail: string) {
    super(message);
    this.name = "OAuthTokenError";
    this.status = status;
    this.detail = detail;
  }
}

/*
 * A 2xx token response we could not use — non-JSON, or a body that fails the
 * schema (a renamed/absent field). Distinct from OAuthTokenError (a non-2xx
 * rejection): the grant "succeeded" but yielded no usable tokens, so callers
 * treat it as terminal, never as a transient blip to retry forever.
 */
export class OAuthResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthResponseError";
  }
}

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresInSeconds: number;
};

export type AccessTokenClaims = {
  sub: string;
  org: string;
  scope: string;
  exp: number;
};

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string(),
});

const claimsSchema = z.object({
  sub: z.string().min(1),
  org: z.string().min(1),
  scope: z.string(),
  exp: z.number(),
});

/*
 * Build the authorize redirect. WRITE SCOPES UP FRONT: the platform silently
 * normalizes an absent/invalid scope to mcp:read, which would make every later
 * write tool call fail in-band — so scope is always sent explicitly.
 */
export function buildAuthorizeUrl(params: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
}): string {
  const config = getAuthConfig();
  const url = new URL(`${config.KEEPERHUB_OAUTH_ISSUER}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.KEEPERHUB_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scope ?? DEFAULT_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const config = getAuthConfig();
  const form = new URLSearchParams({
    ...body,
    // client_secret_post: both id and secret ride in the form body.
    client_id: config.KEEPERHUB_OAUTH_CLIENT_ID,
    client_secret: config.KEEPERHUB_OAUTH_CLIENT_SECRET,
  });

  const response = await fetch(`${config.KEEPERHUB_OAUTH_ISSUER}/api/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: form.toString(),
    // SSRF guard (MCP-hardening convention): the token endpoint must not
    // redirect; a redirect is treated as a hard failure, never followed.
    redirect: "error",
    // Bound the round-trip so a hung endpoint can never stall SSR indefinitely.
    signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new OAuthTokenError(
      `Token endpoint returned ${response.status}`,
      response.status,
      detail,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthResponseError(
      "Token endpoint returned a non-JSON success response",
    );
  }
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    // A 2xx with a missing/renamed field is not a transient blip — the grant
    // succeeded but yielded no usable tokens. Callers treat this as terminal.
    throw new OAuthResponseError(
      "Token endpoint returned a malformed success response",
    );
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    scope: parsed.data.scope,
    expiresInSeconds: parsed.data.expires_in,
  };
}

export function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  return postToken({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/*
 * Decode the access JWT payload WITHOUT verifying: it arrived over TLS straight
 * from the token endpoint, and Copilot does not hold KeeperHub's HS256 signing
 * secret. We read sub/org/scope/exp only — never trust it for authorization,
 * only to identify the session and know when to refresh.
 */
export function decodeAccessTokenClaims(accessToken: string): AccessTokenClaims {
  const segment = accessToken.split(".")[1];
  if (!segment) {
    throw new Error("Malformed access token: missing payload segment");
  }
  const json = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  return claimsSchema.parse(json);
}
