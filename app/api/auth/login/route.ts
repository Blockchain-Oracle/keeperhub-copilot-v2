import type { NextRequest } from "next/server";

import { DEFAULT_SCOPE } from "@/lib/session/oauth";

import { startAuthorize } from "../_shared";

/*
 * Begin the KeeperHub OAuth dance. Write scopes are requested up front
 * (FR38) — the platform silently defaults to mcp:read otherwise, which would
 * make every later write tool call fail in-band.
 */
export function GET(request: NextRequest) {
  return startAuthorize(request, DEFAULT_SCOPE);
}
