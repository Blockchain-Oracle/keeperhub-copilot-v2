import { ulid } from "ulid";

import { deleteConversation, renameConversation } from "@/lib/data";
import { getSession, type AuthenticatedSession } from "@/lib/session";

/*
 * Single-conversation routes (Story 1.5): PATCH renames, DELETE deletes.
 * Session gate first; the accessor resolves rows exclusively through the
 * session's org scope (AD-9), so an absent id and another org's id are the
 * same 404 — structurally indistinguishable. Envelope on every failure,
 * structured logs correlated by requestId (NFR2).
 */
export const dynamic = "force-dynamic";

// Route files may export only handlers/config; this stays module-local. The
// title auto-generation in the chat route applies the same trim/cap.
const TITLE_MAX_LENGTH = 120;

function notFound(): Response {
  return Response.json(
    {
      error: {
        code: "not_found",
        message: "This conversation is not available.",
      },
    },
    { status: 404 },
  );
}

type Params = { params: Promise<{ conversationId: string }> };

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

function badRequest(message: string): Response {
  return Response.json(
    { error: { code: "bad_request", message } },
    { status: 400 },
  );
}

function dataError(
  requestId: string,
  conversationId: string,
  orgId: string,
  error: unknown,
): Response {
  // A thrown accessor (transient Neon failure) still answers in the envelope,
  // structured and correlated — never an opaque framework 500.
  console.error(
    JSON.stringify({
      event: "conversations_data_error",
      conversationId,
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

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  const requestId = ulid();
  const { conversationId } = await params;
  const gate = await gateSession(requestId);
  if (!gate.ok) {
    return gate.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("The request body could not be read.");
  }
  const rawTitle =
    body !== null && typeof body === "object" && "title" in body
      ? (body as { title: unknown }).title
      : undefined;
  if (typeof rawTitle !== "string") {
    return badRequest("A title is required.");
  }
  const title = rawTitle.trim();
  if (title.length === 0) {
    return badRequest("A title is required.");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return badRequest("Titles are limited to 120 characters.");
  }

  let row;
  try {
    row = await renameConversation(gate.session, conversationId, title);
  } catch (error) {
    return dataError(requestId, conversationId, gate.session.orgId, error);
  }
  if (row === null) {
    return notFound();
  }
  console.log(
    JSON.stringify({
      event: "conversation_renamed",
      conversationId,
      orgId: gate.session.orgId,
      requestId,
    }),
  );
  return Response.json({ id: row.id, title: row.title });
}

export async function DELETE(
  _req: Request,
  { params }: Params,
): Promise<Response> {
  const requestId = ulid();
  const { conversationId } = await params;
  const gate = await gateSession(requestId);
  if (!gate.ok) {
    return gate.response;
  }

  let deleted: boolean;
  try {
    deleted = await deleteConversation(gate.session, conversationId);
  } catch (error) {
    return dataError(requestId, conversationId, gate.session.orgId, error);
  }
  if (!deleted) {
    return notFound();
  }
  console.log(
    JSON.stringify({
      event: "conversation_deleted",
      conversationId,
      orgId: gate.session.orgId,
      requestId,
    }),
  );
  return Response.json({ ok: true });
}
