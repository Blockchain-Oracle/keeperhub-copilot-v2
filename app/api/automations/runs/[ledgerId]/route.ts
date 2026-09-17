import { settleWorkflowRun } from "@/lib/execution";

import { errorResponse, gateSession } from "../../_shared/gate";

/* Where a run started from this app stands. The page polls it; a finished run gets its ledger terminal here. */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ ledgerId: string }> }): Promise<Response> {
  const gate = await gateSession("automation_run_status_session_error");
  if (!gate.ok) return gate.response;
  const { ledgerId } = await params;
  try {
    const run = await settleWorkflowRun({ session: gate.session, ledgerId, requestId: gate.requestId });
    if (run === null) return errorResponse(404, "not_found", "This run is not in your activity.");
    return Response.json(run, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "automation_run_status_failed",
        requestId: gate.requestId,
        orgId: gate.session.orgId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return errorResponse(500, "server_error", "This run's status could not be read. Try again in a moment.");
  }
}
