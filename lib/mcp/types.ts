/*
 * KeeperHub MCP client types (Story 1.4, ratified D2). One error envelope shape
 * shared with the execution layer: { code, message, decoded? } — decoded revert
 * reasons and structured payloads pass through untouched (spine error rule).
 */

export type McpErrorCode =
  | "rate_limited"
  | "insufficient_scope"
  | "unauthorized"
  | "session"
  | "tool_error"
  | "transport";

export type McpError = {
  code: McpErrorCode;
  message: string;
  /** Structured payload (insufficient_scope), decoded revert reasons — verbatim. */
  decoded?: unknown;
  /** Seconds, from the server, when code === "rate_limited". */
  retryAfter?: number;
};

export type McpResult =
  | { ok: true; data: unknown }
  | { ok: false; error: McpError };

/** The minimal JSON-RPC 2.0 response shape the client reads. */
export type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
    retryAfter?: number;
  };
};

/** A tools/call result envelope (reads return this synchronously). */
export type ToolResultEnvelope = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};
