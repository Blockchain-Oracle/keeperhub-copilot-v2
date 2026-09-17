import { simulateAutomation } from "@/lib/automations";

import { gateSession } from "../../_shared/gate";

/* The confirm card's dry run: KeeperHub's advisory workflow simulation. Never runs anything. */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_request: Request, { params }: { params: Promise<{ workflowId: string }> }): Promise<Response> {
  const gate = await gateSession("automation_simulate_session_error");
  if (!gate.ok) return gate.response;
  const { workflowId } = await params;
  const dryRun = await simulateAutomation(gate.session, workflowId);
  return Response.json({ dryRun }, { headers: { "cache-control": "no-store" } });
}
