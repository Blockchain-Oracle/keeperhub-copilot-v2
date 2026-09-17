/*
 * Deterministic hashing for the registry (Story 1.3, spine ledger columns).
 *
 * - Per-op fingerprint: hash over the op's canonicalized configFields +
 *   resolved effect class - the exact shape this op uses. Later stored in the
 *   ledger's schema_fingerprint column (Story 2.2); drift detection compares
 *   a persisted fingerprint against the live registry's.
 * - Snapshot id: hash over the whole canonicalized snapshot body (including
 *   source_commit + extracted_at) - the ledger's registry_snapshot_id,
 *   used for reconciliation.
 *
 * The canonical serialization (recursively sorted keys, arrays in order,
 * undefined dropped) MUST match the vendoring dump script's - the generator
 * recomputes the committed snapshot's id and fails loud on any mismatch, so
 * the two copies cannot silently diverge.
 *
 * Generator/test-side only: runtime drift checks compare already-baked
 * fingerprint strings and never import this module (keeps node:crypto out of
 * client bundles).
 */
import { createHash } from "node:crypto";

import type { EffectClass } from "./types.ts";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = canonicalize(entry);
      }
    }
    return sorted;
  }
  if (typeof value === "function") {
    throw new Error("Refusing to hash a function - non-data value leaked in");
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function computeFingerprint(op: {
  configFields: unknown;
  effectClass: EffectClass;
  /**
   * The 5 control-flow primitives carry an empty configFields and hold their
   * real shape in systemFields; fold it in so their drift hash tracks the shape
   * they actually use. Undefined for plugin ops -> omitted -> their fingerprint
   * is unchanged.
   */
  systemFields?: unknown;
}): string {
  return sha256(
    canonicalStringify({
      configFields: op.configFields,
      effectClass: op.effectClass,
      ...(op.systemFields !== undefined ? { systemFields: op.systemFields } : {}),
    }),
  );
}

export function computeSnapshotId(body: {
  source_commit: string;
  extracted_at: string;
  integrations: unknown;
  actions: unknown;
}): string {
  return sha256(
    canonicalStringify({
      source_commit: body.source_commit,
      extracted_at: body.extracted_at,
      integrations: body.integrations,
      actions: body.actions,
    }),
  );
}
