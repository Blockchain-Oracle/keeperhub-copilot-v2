import "server-only";

/*
 * Pure wire helpers for the KeeperHub MCP client (Story 1.4). No fetch, no
 * module state — everything here is a total function over inputs, unit-tested
 * directly in tests/mcp/. The orchestration (session map, single-flight init,
 * backoff) lives in ./index.ts.
 *
 * Verified wire contract (references/keeperhub-docs, 2026-08-11):
 * - Mcp-Protocol-Version is the SERVER's advertised 2025-06-18 (not the AI
 *   SDK client's 2025-11-25 default).
 * - Accept MUST list both application/json and text/event-stream or the server
 *   406s; responses are plain JSON on the happy path (enableJsonResponse) with
 *   a defensive SSE branch.
 */
import type {
  JsonRpcResponse,
  McpResult,
  ToolResultEnvelope,
} from "./types.ts";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** JSON-RPC error codes the client acts on. */
export const SESSION_NOT_INITIALIZED = -32003;
/**
 * Session errors that all carry the same "re-initialize the MCP session"
 * recovery (KEEP-474): not-found (-32001) and expired (-32002) arrive as HTTP
 * 404, not-initialized (-32003) as 400. The client treats all three alike.
 */
export const SESSION_NOT_FOUND = -32001;
export const SESSION_EXPIRED = -32002;
export const RATE_LIMITED = -32029;

const RECOVERABLE_SESSION_CODES: ReadonlySet<number> = new Set([
  SESSION_NOT_INITIALIZED,
  SESSION_NOT_FOUND,
  SESSION_EXPIRED,
]);

/** True for a session error the client can recover by re-handshaking once. */
export function isRecoverableSessionCode(code: number | undefined): boolean {
  return code !== undefined && RECOVERABLE_SESSION_CODES.has(code);
}

export function buildHeaders(opts: {
  accessToken: string;
  sessionId?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    "Content-Type": "application/json",
    // BOTH are required — the server 406s otherwise (route.ts:46-70).
    Accept: "application/json, text/event-stream",
    "Mcp-Protocol-Version": MCP_PROTOCOL_VERSION,
  };
  if (opts.sessionId !== undefined) {
    headers["Mcp-Session-Id"] = opts.sessionId;
  }
  return headers;
}

/**
 * Parse a POST body that is either plain JSON (enableJsonResponse, the happy
 * path) or an SSE stream carrying one or more `data:` frames (defensive
 * branch). Returns the JSON-RPC message, or null when the body is empty (a
 * notification's 202) or unparseable (caller maps null on a 2xx to transport).
 */
export function parseJsonRpcBody(
  rawText: string,
  contentType: string | null,
): JsonRpcResponse | null {
  const text = rawText.trim();
  if (text === "") {
    return null;
  }
  const looksLikeSse =
    (contentType?.includes("text/event-stream") ?? false) ||
    /^(event|data):/m.test(text);
  if (looksLikeSse) {
    const payload = lastSseDataFrame(text);
    if (payload === undefined) {
      return null;
    }
    return safeJsonParse(payload) as JsonRpcResponse | null;
  }
  return safeJsonParse(text) as JsonRpcResponse | null;
}

function lastSseDataFrame(text: string): string | undefined {
  const frames = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line !== "" && line !== "[DONE]");
  return frames.at(-1);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Turn a successful tools/call `result` into the client's McpResult. Reads
 * return their data inline as content[0].text (JSON). insufficient_scope is a
 * tool-level error (isError:true) whose text carries error === "insufficient_scope"
 * — classified here so the orchestrator can stamp the code; lib/execution reuses
 * 1.2's parseInsufficientScope for field extraction. No silent catch: an error
 * envelope always carries its reason.
 */
export function unwrapToolResult(result: unknown): McpResult {
  if (result === null || typeof result !== "object") {
    return {
      ok: false,
      error: {
        code: "tool_error",
        message: "The tool returned no result envelope.",
      },
    };
  }
  const envelope = result as ToolResultEnvelope;
  const firstText = Array.isArray(envelope.content)
    ? envelope.content.find((part) => typeof part?.text === "string")?.text
    : undefined;

  let payload: unknown;
  if (typeof firstText === "string") {
    const parsed = safeJsonParse(firstText);
    payload = parsed === null ? firstText : parsed;
  }

  if (envelope.isError === true) {
    return {
      ok: false,
      error: {
        code: isInsufficientScopePayload(payload)
          ? "insufficient_scope"
          : "tool_error",
        message:
          extractPayloadMessage(payload) ??
          (typeof firstText === "string" && firstText !== ""
            ? firstText
            : "The tool reported an error."),
        decoded: payload ?? firstText,
      },
    };
  }

  // Success. Prefer server structuredContent, else the parsed text payload; if
  // neither exists, surface the envelope rather than a silent empty (honesty).
  const data =
    envelope.structuredContent !== undefined
      ? envelope.structuredContent
      : payload !== undefined
        ? payload
        : envelope;
  return { ok: true, data };
}

function isInsufficientScopePayload(payload: unknown): boolean {
  return (
    payload !== null &&
    typeof payload === "object" &&
    (payload as Record<string, unknown>).error === "insufficient_scope"
  );
}

function extractPayloadMessage(payload: unknown): string | undefined {
  if (payload !== null && typeof payload === "object") {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === "string" && message !== "") {
      return message;
    }
  }
  return undefined;
}

/** Retry-after seconds from a JSON-RPC -32029 error body or the HTTP header. */
export function extractRetryAfter(
  rpcError: JsonRpcResponse["error"] | undefined,
  header: string | null,
): number | undefined {
  if (rpcError !== undefined) {
    const fromData = pickNumber(
      (rpcError.data as Record<string, unknown> | undefined)?.retryAfter,
    );
    if (fromData !== undefined) {
      return fromData;
    }
    const fromError = pickNumber(rpcError.retryAfter);
    if (fromError !== undefined) {
      return fromError;
    }
  }
  if (header !== null) {
    const parsed = Number(header);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** UI/model-facing throttle copy (EXPERIENCE copy law: sentence case, period). */
export function rateLimitMessage(retryAfter?: number): string {
  return retryAfter !== undefined
    ? `KeeperHub is limiting requests right now. Try again in about ${retryAfter} seconds.`
    : "KeeperHub is limiting requests right now. Try again shortly.";
}
