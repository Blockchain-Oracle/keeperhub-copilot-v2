import { getAutomation } from "@/lib/automations";
import { startWorkflowRun } from "@/lib/execution";

import { errorResponse, gateSession, upstreamError } from "../../_shared/gate";

/*
 * Run now (decision 18). Reached only from the confirm card's Authorize. The
 * automation is read first, so a deactivated or foreign one is refused before
 * anything is recorded or sent.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_request: Request, { params }: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const gate = await gateSession("automation_run_session_error");
  if (!gate.ok) return gate.response;
  const { workflowId } = await params;

  const automation = await getAutomation(gate.session, workflowId, gate.requestId);
  if (!automation.ok) return upstreamError(automation.error);
  if (automation.data === null) return errorResponse(404, "not_found", "This automation is not available.");
  if (automation.data.deactivated) {
    return errorResponse(409, "deactivated", "This automation is deactivated in KeeperHub, so it cannot run.");
  }

  const run = await startWorkflowRun({
    session: gate.session,
    workflowId,
    name: automation.data.name,
    requestId: gate.requestId,
  });
  if (!run.ok) return upstreamError(run.error);
  return Response.json({ ledgerId: run.ledgerId, executionId: run.executionId });
}
