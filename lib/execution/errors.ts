import type { McpError } from "@/lib/mcp";
import { parseInsufficientScope } from "@/lib/session/insufficient-scope";

import type { ExecutionError } from "./index.ts";

/** A KeeperHub error in the shape the model reads and the cards draw. */
export function toExecutionError(error: McpError): ExecutionError {
  const base: ExecutionError = {
    code: error.code,
    message: error.message,
    decoded: error.decoded,
  };
  if (error.code === "insufficient_scope") {
    // Reuse 1.2's tested parser for field extraction (do not re-detect) — the
    // client already classified; here we normalize the payload for the UI.
    const scope =
      parseInsufficientScope({
        isError: true,
        content: [{ type: "text", text: JSON.stringify(error.decoded ?? {}) }],
      }) ?? undefined;
    return { ...base, scope };
  }
  if (error.code === "rate_limited") {
    return { ...base, retryAfter: error.retryAfter };
  }
  return base;
}
