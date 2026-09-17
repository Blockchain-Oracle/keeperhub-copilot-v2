import { getAutomation, listAutomationRuns } from "@/lib/automations";

import { errorResponse, gateSession, upstreamError } from "../_shared/gate";

/* One automation with its steps, and its recent runs (null when KeeperHub's run history cannot be read). */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const gate = await gateSession("automation_session_error");
  if (!gate.ok) return gate.response;
  const { workflowId } = await params;
  const [automation, runs] = await Promise.all([
    getAutomation(gate.session, workflowId, gate.requestId),
    listAutomationRuns(gate.session, workflowId),
  ]);
  if (!automation.ok) return upstreamError(automation.error);
  if (automation.data === null) return errorResponse(404, "not_found", "This automation is not available.");
  return Response.json({ automation: automation.data, runs }, { headers: { "cache-control": "no-store" } });
}
