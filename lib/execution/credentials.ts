import "server-only";

/*
 * Credential-binding resolver for the effect gate (Story 2.1, D8, spine AD-6).
 *
 * The SECOND gate axis. An operation's `needsCredential` is orthogonal to its
 * effect class: a read can be credential-gated (safe/get-pending-transactions
 * is effectClass:"read" + needsCredential:true). Before a gated op proceeds,
 * the gate asks THIS module whether the required integration is bound for the
 * org, via the KeeperHub `list_integrations` read.
 *
 * Verified shape (references/keeperhub/lib/mcp/tools.ts → GET /api/integrations,
 * 2026-08-12): the tool returns an array of integration records
 *   { id, name, type, address, isManaged?, createdAt, updatedAt, ... }
 * where `type` is the integration KEY we match against
 * `entry.credentialIntegrationType ?? entry.integration` (e.g. "web3", "safe").
 * The in-repo MCP return type is `unknown`, so the parse is defensive; the live
 * runtime payload is confirmed against a signed-in session at dev time.
 *
 * Session-stable: org integrations do not change within a turn, so one call is
 * memoized per org and amortizes across every gated op in the conversation. A
 * short TTL lets a binding made mid-conversation self-heal on the next turn past
 * the window (2.1 never re-checks on rehydration — the persisted pre-state
 * stands until the user re-asks; FR18 Re-propose is Story 2.4).
 *
 * Graceful degradation (NFR7 "a throttle never fails the conversation"): an
 * UNDETERMINABLE check (throttle / transport / session error) returns
 * `undefined`, never an empty set. For a READ the gate then PROCEEDS rather than
 * fabricate a false "needs credential" (a gated read surfaces the honest
 * downstream credential error instead). For a WRITE the gate now fails CLOSED on
 * an undeterminable check (Story 2.3, D17b) — lib/execution blocks the broadcast.
 * A successful-but-empty result ("[]" — the org genuinely has nothing bound) DOES
 * surface needs-credential.
 *
 * Single-flight fail direction (D17b): the shared `list_integrations` read is
 * NOT bound to any single caller's abort signal. Concurrent gated ops in one turn
 * share one read, so one caller aborting must never resolve the shared result to
 * `undefined` and silently relax another still-live caller's gate. The MCP
 * client's own request timeout bounds the shared read.
 */
import { callTool } from "@/lib/mcp";
import type { AuthenticatedSession } from "@/lib/session";

type BoundSet = ReadonlySet<string>;
type CacheEntry = { at: number; bound: BoundSet };

// Session-stable, so a modest window amortizes within a turn without stranding a
// mid-conversation binding behind a stale "unbound" for long.
const BINDING_TTL_MS = 60_000;

// A generous bound so a long-lived warm instance cannot accumulate one entry per
// org ever seen without limit (entries are tiny, but the map must stay bounded).
const MAX_CACHED_ORGS = 500;

// Keyed by orgId: integrations are org-scoped (any member's token lists the same
// set), so this maximizes the amortization the single call buys. Memory only.
const boundCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<BoundSet | undefined>>();

/** Test-only: clear the per-org binding memo between cases. */
export function __resetCredentialCache(): void {
  boundCache.clear();
  inFlight.clear();
}

/**
 * Drop the org's memoized binding set (Story 2.1 review, DN1). The gate calls
 * this when it returns a needs-credential pre-state, so a bind-then-ask recovery
 * re-checks live on the next turn instead of serving the stale "unbound" set for
 * up to the TTL.
 */
export function invalidateBoundIntegrations(orgId: string): void {
  boundCache.delete(orgId);
}

/**
 * Normalize an integration key for matching. The live `list_integrations` `type`
 * and the registry key must compare case- and whitespace-insensitively (Story
 * 2.1 review): a live "Web3" / " safe " still matches the registry "web3" /
 * "safe". Both sides of the membership test pass through here.
 */
export function normalizeIntegrationKey(key: string): string {
  return key.trim().toLowerCase();
}

export type ResolveBoundInput = {
  session: AuthenticatedSession;
  requestId: string;
  signal?: AbortSignal;
};

/**
 * The set of integration keys bound for the session's org, or `undefined` when
 * the binding state could not be determined (the gate proceeds on undefined).
 * Memoized per org (TTL) with a single-flight so concurrent gated ops in one
 * turn share one `list_integrations` read.
 */
export async function resolveBoundIntegrations(
  input: ResolveBoundInput,
): Promise<BoundSet | undefined> {
  const key = input.session.orgId;

  const cached = boundCache.get(key);
  if (cached !== undefined) {
    if (Date.now() - cached.at < BINDING_TTL_MS) {
      return cached.bound;
    }
    // Expired: drop it now so a re-queried stale org does not linger past its
    // window; the determinable refetch below re-adds it.
    boundCache.delete(key);
  }

  const existing = inFlight.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const pending = fetchBoundIntegrations(input)
    .then((bound) => {
      // Cache only a determinable result — an undeterminable check must be
      // retried next time, never memoized as "nothing bound".
      if (bound !== undefined) {
        setBoundCache(key, { at: Date.now(), bound });
      }
      return bound;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

/** Insertion-order eviction keeps the memo bounded on a warm multi-tenant
 *  instance: when at capacity and adding a NEW org, drop the oldest entry. */
function setBoundCache(key: string, entry: CacheEntry): void {
  if (!boundCache.has(key) && boundCache.size >= MAX_CACHED_ORGS) {
    const oldest = boundCache.keys().next().value;
    if (oldest !== undefined) {
      boundCache.delete(oldest);
    }
  }
  boundCache.set(key, entry);
}

async function fetchBoundIntegrations(
  input: ResolveBoundInput,
): Promise<BoundSet | undefined> {
  const { session, requestId } = input;
  const result = await callTool({
    accessToken: session.accessToken,
    orgId: session.orgId,
    userId: session.userId,
    name: "list_integrations",
    args: {},
    // A read: eligible for lib/mcp's one sanctioned rate-limit retry.
    idempotent: true,
    requestId,
    // D17b: the shared single-flight read is deliberately NOT bound to the
    // caller's `signal`. One caller aborting must not resolve the shared promise
    // to `undefined` for a still-live second caller (which for a write would
    // relax its fail-closed gate). The MCP client's own timeout bounds this read.
  });
  if (!result.ok) {
    // Undeterminable — degrade to proceeding (never a fabricated pre-state). Log
    // the outcome, never a silent catch (NFR2 correlation).
    console.error(
      JSON.stringify({
        event: "credential_binding_undeterminable",
        orgId: session.orgId,
        requestId,
        reason: result.error.code,
      }),
    );
    return undefined;
  }
  return extractBoundIntegrationTypes(result.data);
}

/**
 * Collect the bound integration KEYS from a list_integrations payload. Accepts
 * the verified bare array or a defensive `{ integrations: [...] }` envelope, and
 * reads each record's `type` string. Exported for direct unit testing (the
 * shape is the one live-verified fact this story leans on).
 */
export function extractBoundIntegrationTypes(data: unknown): ReadonlySet<string> {
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.integrations)
      ? data.integrations
      : [];
  const bound = new Set<string>();
  for (const item of list) {
    if (isRecord(item) && typeof item.type === "string" && item.type.trim() !== "") {
      bound.add(normalizeIntegrationKey(item.type));
    }
  }
  return bound;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
