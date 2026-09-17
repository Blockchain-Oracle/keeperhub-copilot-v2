import { getAutomation } from "@/lib/automations";
import { automationStatus } from "@/lib/automations/shape";
import { switchAutomationFromCard } from "@/lib/execution";

import { errorResponse, gateSession, upstreamError } from "../../_shared/gate";

/*
 * Turn on (or off) from a saved automation's card (decision 19). Reached only
 * from the card's button after KeeperHub's check. The automation is read first,
 * so a deactivated, on-demand or foreign one is refused before anything is
 * recorded or sent, and one already in that state is answered as it is.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request, { params }: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const gate = await gateSession("automation_switch_session_error");
  if (!gate.ok) return gate.response;
  const { workflowId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const enabled = body !== null && typeof body === "object" ? (body as { enabled?: unknown }).enabled : undefined;
  if (typeof enabled !== "boolean") return errorResponse(400, "bad_request", "Say whether to turn the automation on or off.");

  const automation = await getAutomation(gate.session, workflowId, gate.requestId);
  if (!automation.ok) return upstreamError(automation.error);
  if (automation.data === null) return errorResponse(404, "not_found", "This automation is not available.");
  const status = automationStatus(automation.data);
  if (status === "deactivated") {
    return errorResponse(409, "deactivated", "This automation is deactivated in KeeperHub, so it can't be turned on or off.");
  }
  if (status === "manual") {
    return errorResponse(409, "on_demand", "This automation runs on demand, so there is nothing to turn on or off.");
  }
  if (automation.data.enabled === enabled) {
    return Response.json({
      receipt: { workflowId, name: automation.data.name, enabled, triggerType: automation.data.triggerType },
    });
  }

  const result = await switchAutomationFromCard({ session: gate.session, workflowId, enabled, requestId: gate.requestId });
  if (!result.ok) return upstreamError(result.error);
  return Response.json({ receipt: result.receipt });
}
