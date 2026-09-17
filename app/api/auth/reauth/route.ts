import type { NextRequest } from "next/server";

import { sanitizeScope, startAuthorize } from "../_shared";

/*
 * Re-authorization is a FRESH consent run requesting the needed scope — there
 * is no scope-elevation endpoint on this platform. Used by dead-session
 * re-auth routing and, from 1.4, by the insufficient_scope surface (which
 * passes the required scope). Defaults to mcp:read mcp:write.
 */
export function GET(request: NextRequest) {
  const scope = sanitizeScope(request.nextUrl.searchParams.get("scope"));
  return startAuthorize(request, scope);
}
