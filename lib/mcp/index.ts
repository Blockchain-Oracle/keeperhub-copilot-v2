import "server-only";

/*
 * The hand-rolled KeeperHub MCP client (Story 1.4, ratified D2). A
 * streamable-HTTP JSON-RPC client — NOT @ai-sdk/mcp, whose .tools() would
 * auto-execute around lib/execution (an AD-4 breach).
 *
 * Boundary (spine arrow EX → MCP): the access token arrives as an argument.
 * This module NEVER imports lib/session / lib/data / lib/db — it is a leaf that
 * talks to the wire and nothing else. Every fetch carries redirect:"error"
 * (SSRF guard, project-context:182). No retries by default; the single
 * sanctioned retry is a read-class (idempotent) call when the server's
 * retryAfter is <= 10s (NFR1 "enable deliberately").
 */
import { getAiConfig } from "@/lib/config";

import type { JsonRpcResponse, McpError, McpResult } from "./types.ts";
import {
  buildHeaders,
  extractRetryAfter,
  isRecoverableSessionCode,
  MCP_PROTOCOL_VERSION,
  parseJsonRpcBody,
  RATE_LIMITED,
  rateLimitMessage,
  unwrapToolResult,
} from "./wire.ts";

export type { McpError, McpErrorCode, McpResult } from "./types.ts";

const CLIENT_INFO = { name: "keeperhub-copilot", version: "0.1.0" };
const SANCTIONED_RETRY_CEILING_S = 10;
// Bound one MCP request so a hung read can't hold the turn to the function
// ceiling (maxDuration). Combined with the caller's abort signal per request.
const REQUEST_TIMEOUT_MS = 30_000;

// Per-USER in-process session id map + single-flight init (the shape of
// lib/session's inFlightRefreshes). The KeeperHub server binds each MCP session
// to the principal (oauth:<userId>), so the map MUST be keyed by userId: two
// users in the same org must never share — or adopt each other's — session id.
// Memory only; the Mcp-Session-Id (a server-minted JWT) is never persisted.
const sessionIds = new Map<string, string>();
const inFlightInits = new Map<string, Promise<string>>();

/** Test-only: reset the in-process session/init maps between cases. */
export function __resetMcpState(): void {
  sessionIds.clear();
  inFlightInits.clear();
}

let rpcCounter = 0;
function nextRpcId(): number {
  rpcCounter += 1;
  return rpcCounter;
}

/** A thrown MCP failure, unwrapped to an McpError by callTool's boundary. */
class McpFailure extends Error {
  constructor(readonly mcpError: McpError) {
    super(mcpError.message);
    this.name = "McpFailure";
  }
}

type RawResponse = {
  status: number;
  rpc: JsonRpcResponse | null;
  retryAfterHeader: string | null;
  sessionIdHeader: string | null;
};

async function postRpc(
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<RawResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined =
    signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(getAiConfig().keeperhubMcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    // SSRF guard: a 3xx to an attacker-chosen host must fail, not follow.
    redirect: "error",
    signal: combined,
  });
  const rawText = await response.text();
  return {
    status: response.status,
    rpc: parseJsonRpcBody(rawText, response.headers.get("content-type")),
    retryAfterHeader: response.headers.get("retry-after"),
    sessionIdHeader: response.headers.get("mcp-session-id"),
  };
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * The mandatory handshake: initialize → notifications/initialized. The server
 * mints Mcp-Session-Id on initialize; we adopt it for the org. Single-flighted
 * per org.
 */
function initSession(
  userId: string,
  accessToken: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const existing = inFlightInits.get(userId);
  if (existing !== undefined) {
    return existing;
  }
  const pending = (async () => {
    const initResponse = await postRpc(
      buildHeaders({ accessToken }),
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        },
      },
      signal,
    );
    if (!isOk(initResponse.status) || initResponse.rpc?.error !== undefined) {
      throw initHandshakeFailure(initResponse);
    }
    const sessionId = initResponse.sessionIdHeader;
    if (sessionId === null || sessionId === "") {
      throw new McpFailure({
        code: "session",
        message: "The MCP server did not mint a session id on initialize.",
      });
    }
    // The initialized notification carries no id and expects no result body.
    await postRpc(
      buildHeaders({ accessToken, sessionId }),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      signal,
    );
    sessionIds.set(userId, sessionId);
    return sessionId;
  })().finally(() => inFlightInits.delete(userId));
  inFlightInits.set(userId, pending);
  return pending;
}

function initHandshakeFailure(response: RawResponse): McpFailure {
  if (response.status === 429 || response.rpc?.error?.code === RATE_LIMITED) {
    const retryAfter = extractRetryAfter(
      response.rpc?.error,
      response.retryAfterHeader,
    );
    return new McpFailure({
      code: "rate_limited",
      message: rateLimitMessage(retryAfter),
      retryAfter,
    });
  }
  return new McpFailure({
    code: "session",
    message:
      response.rpc?.error?.message ??
      `MCP initialize failed (HTTP ${response.status}).`,
  });
}

async function toolsCall(
  userId: string,
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<RawResponse> {
  const sessionId =
    sessionIds.get(userId) ?? (await initSession(userId, accessToken, signal));
  return postRpc(
    buildHeaders({ accessToken, sessionId }),
    {
      jsonrpc: "2.0",
      id: nextRpcId(),
      method: "tools/call",
      params: { name, arguments: args },
    },
    signal,
  );
}

export type CallToolOptions = {
  accessToken: string;
  /** KeeperHub org id — for log correlation (NFR2) only, never the session key. */
  orgId: string;
  /** KeeperHub user id — the MCP session key (the server binds sessions per user). */
  userId: string;
  name: string;
  args: Record<string, unknown>;
  signal?: AbortSignal;
  /** Read-class calls may take the one sanctioned rate-limit retry. Never a write. */
  idempotent?: boolean;
  /** NFR2 log correlation; never logged as a param value. */
  requestId?: string;
};

/**
 * Call one MCP tool. Reads are synchronous (result inline). Returns a mapped
 * McpResult; never throws (fetch/abort/parse failures map to a transport error
 * with their reason).
 */
export async function callTool(opts: CallToolOptions): Promise<McpResult> {
  const { name, orgId, args } = opts;
  const actionType =
    typeof args.actionType === "string" ? args.actionType : undefined;

  let result: McpResult;
  try {
    result = await run(opts);
  } catch (error) {
    result = { ok: false, error: toMcpError(error) };
  }

  const logFields = {
    event: result.ok ? "mcp_call" : "mcp_call_failed",
    tool: name,
    actionType,
    orgId,
    status: result.ok ? "ok" : result.error.code,
    requestId: opts.requestId,
  };
  if (result.ok) {
    console.log(JSON.stringify(logFields));
  } else {
    console.error(JSON.stringify(logFields));
  }
  return result;
}

async function run(opts: CallToolOptions): Promise<McpResult> {
  const { accessToken, userId, name, args, signal, idempotent = false } = opts;
  let reinitTried = false;
  let rateRetried = false;

  for (;;) {
    const response = await toolsCall(userId, accessToken, name, args, signal);

    // Adopt a renewed session id if the server rotated it on this response.
    if (
      response.sessionIdHeader !== null &&
      response.sessionIdHeader !== "" &&
      response.sessionIdHeader !== sessionIds.get(userId)
    ) {
      sessionIds.set(userId, response.sessionIdHeader);
    }

    const rpcErrorCode = response.rpc?.error?.code;

    // Rate limited: HTTP 429 or JSON-RPC -32029. The sole sanctioned retry is a
    // read-class call whose retryAfter is <= 10s — wait it out once, with jitter.
    if (response.status === 429 || rpcErrorCode === RATE_LIMITED) {
      const retryAfter = extractRetryAfter(
        response.rpc?.error,
        response.retryAfterHeader,
      );
      if (
        idempotent &&
        !rateRetried &&
        retryAfter !== undefined &&
        retryAfter <= SANCTIONED_RETRY_CEILING_S
      ) {
        rateRetried = true;
        await sleep(retryAfter * 1000 + jitterMs(), signal);
        continue;
      }
      return {
        ok: false,
        error: {
          code: "rate_limited",
          message: rateLimitMessage(retryAfter),
          retryAfter,
        },
      };
    }

    // Recoverable session error (-32003 not-initialized, -32001 not-found,
    // -32002 expired — all share the "re-initialize" recovery): drop the cached
    // session so the NEXT call re-handshakes.
    if (isRecoverableSessionCode(rpcErrorCode)) {
      sessionIds.delete(userId);
      // A non-idempotent (write) call must NEVER replay — not on a rate limit
      // (above) and not here (D17a, Story 2.3). A replay could re-broadcast a
      // write that already reached the server; the guard must hold across BOTH
      // retry paths. Only a read re-handshakes and replays, once.
      if (idempotent && !reinitTried) {
        reinitTried = true;
        await initSession(userId, accessToken, signal);
        continue;
      }
      return {
        ok: false,
        error: {
          code: "session",
          message: "The MCP session could not be initialized.",
        },
      };
    }

    // An expired/revoked token: surface a dedicated code so the UI routes to
    // reconnect rather than a dead-end generic transport error.
    if (response.status === 401) {
      return {
        ok: false,
        error: {
          code: "unauthorized",
          message:
            "Your KeeperHub session is no longer valid. Reconnect to continue.",
        },
      };
    }

    // A JSON-RPC protocol error surfaces its message + decoded data BEFORE the
    // status-only fallback, so a decoded reason on a 4xx/5xx is never dropped.
    if (response.rpc?.error !== undefined) {
      return {
        ok: false,
        error: {
          code: "transport",
          message: response.rpc.error.message ?? "MCP protocol error.",
          decoded: response.rpc.error.data,
        },
      };
    }

    // Any other non-2xx without a JSON-RPC error is a transport failure.
    if (!isOk(response.status)) {
      return {
        ok: false,
        error: {
          code: "transport",
          message: `MCP transport error (HTTP ${response.status}).`,
        },
      };
    }

    // Success: unwrap the tools/call result (tool-level errors mapped inside).
    if (response.rpc !== null && "result" in response.rpc) {
      return unwrapToolResult(response.rpc.result);
    }

    // 2xx but no parseable JSON-RPC payload — never a silent success.
    return {
      ok: false,
      error: {
        code: "transport",
        message: "MCP returned an unparseable response body.",
      },
    };
  }
}

function toMcpError(error: unknown): McpError {
  if (error instanceof McpFailure) {
    return error.mcpError;
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return { code: "transport", message: "The MCP request timed out." };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "transport", message: `MCP request failed: ${message}` };
}

// Abort-aware sleep: on the caller's abort during a backoff, resolve early so
// the loop's next fetch sees the aborted signal and fails fast (no dangling wait).
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function jitterMs(): number {
  return Math.floor(Math.random() * 250);
}
