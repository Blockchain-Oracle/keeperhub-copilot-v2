import { ulid } from "ulid";

import { createConversation, listConversations, listConversationSummaries } from "@/lib/data";
import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * Conversation collection routes (Story 1.5). POST creates (the id is minted
 * server-side inside lib/data — any client-supplied id in the body is
 * ignored; the body is never even read); GET lists id/title/updatedAt only,
 * never transcript payloads. Session gate first on every verb (AD-9: the
 * accessor takes the session; no code path accepts an org id from the
 * client). Error envelope { code, message } on every failure, no silent
 * catch, structured logs correlated by requestId (NFR2).
 */
export const dynamic = "force-dynamic";

type Gate =
  | { ok: true; session: AuthenticatedSession }
  | { ok: false; response: Response };

async function gateSession(requestId: string): Promise<Gate> {
  let session: AuthenticatedSession | null;
  try {
    session = await getSession();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "conversations_session_error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return {
      ok: false,
      response: Response.json(
        {
          error: {
            code: "server_error",
            message:
              "We could not reach KeeperHub just now. Try again in a moment.",
          },
        },
        { status: 503 },
      ),
    };
  }
  if (session === null) {
    return {
      ok: false,
      response: Response.json(
        {
          error: {
            code: "unauthorized",
            message: "Connect KeeperHub to continue.",
          },
        },
        { status: 401 },
      ),
    };
  }
  return { ok: true, session };
}

function dataError(
  requestId: string,
  orgId: string,
  error: unknown,
): Response {
  // A thrown accessor (transient Neon failure) still answers in the envelope,
  // structured and correlated — never an opaque framework 500.
  console.error(
    JSON.stringify({
      event: "conversations_data_error",
      requestId,
      orgId,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return Response.json(
    {
      error: {
        code: "server_error",
        message: "Something went wrong on our side. Try again in a moment.",
      },
    },
    { status: 500 },
  );
}

// No request parameter at all: the strongest form of "any client-supplied id
// in the body is ignored" — the handler never holds a reference to read.
export async function POST(): Promise<Response> {
  const requestId = ulid();
  const gate = await gateSession(requestId);
  if (!gate.ok) {
    return gate.response;
  }
  let row;
  try {
    row = await createConversation(gate.session);
  } catch (error) {
    return dataError(requestId, gate.session.orgId, error);
  }
  console.log(
    JSON.stringify({
      event: "conversation_created",
      conversationId: row.id,
      orgId: gate.session.orgId,
      requestId,
    }),
  );
  return Response.json({ id: row.id, title: row.title });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = ulid();
  const gate = await gateSession(requestId);
  if (!gate.ok) {
    return gate.response;
  }
  // `?summary=1` is History's gallery: conversations with a transcript, each with its executed count.
  if (new URL(request.url).searchParams.get("summary") === "1") {
    let summaries;
    try {
      summaries = await listConversationSummaries(gate.session);
    } catch (error) {
      return dataError(requestId, gate.session.orgId, error);
    }
    return Response.json({
      conversations: summaries.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt,
        executed: item.executed,
      })),
    });
  }
  let conversations;
  try {
    conversations = await listConversations(gate.session);
  } catch (error) {
    return dataError(requestId, gate.session.orgId, error);
  }
  return Response.json({
    conversations: conversations.map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
    })),
  });
}
