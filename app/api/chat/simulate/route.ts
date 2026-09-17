import { ulid } from "ulid";

import { routeToolCall } from "@/lib/execution";
import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * The confirm-ceremony PRE-confirm dry-run (Story 2.3, AC 1/2). The write card
 * calls this on mount for a write proposal to learn, server-authoritatively,
 * whether the platform can simulate it — and, if so, the decoded effects + gas —
 * BEFORE Confirm is possible (AD-6: simulatability is decided server-side, never
 * the model; a silent pass to `simulated` is forbidden).
 *
 * It routes through the ONE door (routeToolCall) with `write: "simulate"`, which
 * for a contract call forces `simulate:true` (a non-broadcasting dry-run) and for
 * a protocol action coerces to `no-preview`. It NEVER broadcasts, never writes a
 * ledger row, never persists a transcript message — the confirm/broadcast is a
 * separate, AI-SDK-verified step. The returned JSON is card-local state.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SIMULATE_TOOLS = new Set([
  "execute_protocol_action",
  "execute_contract_call",
  "execute_transfer",
  // Automation changes: the card's facts, warnings and blockers before Authorize.
  "create_automation",
  "set_automation_enabled",
  "update_automation",
  "run_automation",
  "delete_automation",
]);

export async function POST(req: Request): Promise<Response> {
  const requestId = ulid();

  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "simulate_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return json(503, {
      ok: false,
      error: {
        code: "server_error",
        message: "We could not reach KeeperHub just now. Try again in a moment.",
      },
    });
  }
  if (session === null) {
    return json(401, {
      ok: false,
      error: { code: "unauthorized", message: "Connect KeeperHub to continue." },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, badRequest());
  }
  const parsed = parseSimulateBody(body);
  if (parsed === null) {
    return json(400, badRequest());
  }

  // The one door, in the simulate phase: a dry-run only. It can never broadcast
  // (a write only broadcasts through the confirmed execute, which threads
  // "broadcast" — never reachable from here).
  const output = await routeToolCall({
    session,
    toolName: parsed.tool,
    args: parsed.args,
    requestId,
    conversationId: parsed.conversationId,
    // The proposal's tool call id when supplied (log correlation, NFR2); an
    // ephemeral id otherwise. The simulate writes no ledger row, so this id is
    // never persisted as a key.
    toolCallId: parsed.toolCallId ?? ulid(),
    write: "simulate",
  });

  return json(200, toSimulateResponse(output));
}

type SimulateBody = {
  conversationId: string;
  tool: string;
  args: Record<string, unknown>;
  toolCallId?: string;
};

function parseSimulateBody(body: unknown): SimulateBody | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const conversationId = record.conversationId;
  const tool = record.tool;
  const args = record.args;
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return null;
  }
  if (typeof tool !== "string" || !SIMULATE_TOOLS.has(tool)) {
    return null;
  }
  if (args === null || typeof args !== "object") {
    return null;
  }
  const toolCallId = record.toolCallId;
  return {
    conversationId,
    tool,
    args: args as Record<string, unknown>,
    ...(typeof toolCallId === "string" ? { toolCallId } : {}),
  };
}

/** Project a simulate-phase ToolOutput onto the card's JSON contract. */
function toSimulateResponse(
  output: Awaited<ReturnType<typeof routeToolCall>>,
): Record<string, unknown> {
  if (output.ok === false) {
    return { ok: false, error: output.error };
  }
  if ("state" in output) {
    if (output.state === "simulated") {
      return { ok: true, kind: "simulated", preview: output.preview };
    }
    if (output.state === "no-preview") {
      return { ok: true, kind: "no-preview" };
    }
    if (output.state === "needs-credential") {
      return {
        ok: true,
        kind: "needs-credential",
        integration: output.integration,
        message: output.message,
      };
    }
  }
  // Any other ok:true shape (e.g. a read routed here) has no preview to show; the
  // card shows the exact instruction to confirm rather than invent a preview.
  return { ok: true, kind: "no-preview" };
}

function badRequest(): Record<string, unknown> {
  return {
    ok: false,
    error: { code: "bad_request", message: "The simulate request could not be read." },
  };
}

function json(status: number, payload: Record<string, unknown>): Response {
  return Response.json(payload, { status });
}
