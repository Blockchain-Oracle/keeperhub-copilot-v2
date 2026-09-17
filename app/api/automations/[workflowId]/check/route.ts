import { automationSwitchPreview } from "@/lib/execution";

import { gateSession, upstreamError } from "../../_shared/gate";

/*
 * Before Turn on or Turn off, from a saved automation's chat card (decision 19)
 * or its page: the automation as it stands, KeeperHub's own check and dry run
 * when turning on, and what would block it or need a tick. The body's
 * `enabled` says which way; absent means on. Reads only: nothing is recorded
 * or changed.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const gate = await gateSession("automation_check_session_error");
  if (!gate.ok) return gate.response;
  const { workflowId } = await params;
  let enabled = true;
  try {
    const body = (await request.json()) as { enabled?: unknown } | null;
    if (typeof body?.enabled === "boolean") enabled = body.enabled;
  } catch {
    // no body: turning on
  }
  const result = await automationSwitchPreview({
    session: gate.session,
    workflowId,
    enabled,
    requestId: gate.requestId,
    signal: request.signal,
  });
  if (!result.ok) return upstreamError(result.error);
  return Response.json(result.data, { headers: { "cache-control": "no-store" } });
}
