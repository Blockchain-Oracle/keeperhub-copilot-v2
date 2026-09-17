import { listAutomations } from "@/lib/automations";

import { gateSession, upstreamError } from "./_shared/gate";

/* This org's KeeperHub automations for the Automations board. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const gate = await gateSession("automations_session_error");
  if (!gate.ok) return gate.response;
  const result = await listAutomations(gate.session, gate.requestId);
  if (!result.ok) return upstreamError(result.error);
  return Response.json({ automations: result.data }, { headers: { "cache-control": "no-store" } });
}
