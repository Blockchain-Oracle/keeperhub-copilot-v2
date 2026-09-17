import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { UIMessage } from "ai";

/*
 * Drizzle schema. Tables land with the story that first needs them; DB naming
 * is snake_case, timestamps are timestamptz. `session` (Story 1.2) is the
 * FIRST real table. `conversation` (1.5), `ledger_entry` (2.2), and cursors
 * (5.7) arrive with their owning stories.
 */

/*
 * A signed-in KeeperHub session. The httpOnly cookie carries only a signed
 * copy of `id` (a server-minted ULID) — never token material (AD-1). The
 * access and refresh tokens live here encrypted at rest with AES-256-GCM
 * keyed from SESSION_SECRET (NFR3); the ciphertext columns each hold one
 * self-describing "iv:authTag:ciphertext" blob produced by lib/session.
 */
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  // KeeperHub token claims captured at consent. `sub` is the user, `org` the
  // organization the token is scoped to (one session = one org, FR38/FR41).
  userId: text("user_id").notNull(),
  orgId: text("org_id").notNull(),
  // The granted OAuth scope string (e.g. "mcp:read mcp:write").
  scope: text("scope").notNull(),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }).notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SessionRow = typeof session.$inferSelect;
export type NewSessionRow = typeof session.$inferInsert;

/*
 * A persisted conversation (Story 1.5): one jsonb UIMessage transcript per
 * conversation (AD-12), org-scoped (FR39 — conversations belong to the org,
 * not the user). `id` is a server-minted ULID; a client-supplied id is never
 * persisted as a key. `revision` is the CAS token: neon-http has no
 * interactive transactions, so every atomic transcript write is a
 * single-statement compare-and-set on it (the 1.2 rotation pattern).
 *
 * No FK from ledger_entry yet, deliberately: Story 2.2 owns the SET NULL /
 * RESTRICT design (AD-2 — conversation deletion must never cascade to ledger
 * rows). Do not add a cascading reference here.
 */
export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    transcript: jsonb("transcript")
      .$type<UIMessage[]>()
      .notNull()
      .default([]),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The thread switcher lists an org's conversations newest-first.
    index("conversation_org_updated_idx").on(
      table.orgId,
      table.updatedAt.desc(),
    ),
  ],
);

export type ConversationRow = typeof conversation.$inferSelect;
export type NewConversationRow = typeof conversation.$inferInsert;

/*
 * The outcome ledger (Story 2.2, AD-2): one durable row per platform execution,
 * so what happened is never a matter of UI memory. Org-scoped (FR39); `id` is a
 * server ULID minted in the accessor. Written ONLY by lib/execution/ through
 * lib/ledger → lib/data/ledger (AD-2 single writer); reading rows back is a
 * later story (Epic 3 overlay / FR14 record queries) — this table only WRITES.
 *
 * Dual-origin identity (AD-2, "one platform execution is one row"): a row keys
 * EITHER by `tool_call_id` (a chat/voice-driven execution) OR by
 * `keeperhub_execution_id` + `workflow_id` (a KeeperHub run ingested by the 5.7
 * poller). The two scoped unique indexes below de-dupe each origin; Postgres'
 * default NULLS DISTINCT keeps the null half of one origin from ever colliding
 * with the other. The run-origin WRITER is Story 5.7 — only the COLUMNS +
 * constraints land now (the DB rejects a duplicate execution id when it does).
 *
 * The `state` column is the durable EXECUTION lifecycle, NOT the FR7 card-visual
 * vocabulary (that rides the transcript tool-part state, a renderer's concern):
 * `read` (an ungated read, D12), `intent` (the pre-execution WRITE row, AD-2),
 * and the AC-3 terminals `receipt | failure | declined | paid-but-failed |
 * expired`. Terminal transitions are write-once (a single-statement CAS on
 * `state`, lib/data/ledger.ts). Two-leg paid-listing columns do NOT land here —
 * the vocabulary merely INCLUDES `paid-but-failed`; the mechanism is Story 6.4.
 */
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    // Server-minted ULID (lib/data/ledger); a client id is never a DB key.
    id: text("id").primaryKey(),
    // Origin A — a chat/voice tool call. Null on a run-origin (5.7) row.
    toolCallId: text("tool_call_id"),
    // Origin B — an ingested KeeperHub run. Null on a tool-origin row.
    keeperhubExecutionId: text("keeperhub_execution_id"),
    workflowId: text("workflow_id"),
    orgId: text("org_id").notNull(),
    // AD-2: conversation deletion must NEVER cascade to a ledger row — the row
    // survives with conversation_id nulled (AC 4). SET NULL, never RESTRICT, so
    // deleting the conversation still succeeds; never CASCADE.
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    // KeeperHub's own action slug ("plugin/action") — one id everywhere (AD-3).
    opId: text("op_id").notNull(),
    state: text("state").notNull(),
    // The validated + passthrough-merged wire params. Any amount inside travels
    // as an integer base-unit string (money law) — stored verbatim, no floats.
    confirmedInputs: jsonb("confirmed_inputs").$type<Record<string, unknown>>(),
    txHash: text("tx_hash"),
    // The verification result + block data (AD-2). Null on reads and intents.
    receipt: jsonb("receipt").$type<Record<string, unknown>>(),
    // Derives from tool_call_id (AD-5): Copilot's ledger, not KeeperHub's 24h
    // key, is the long-horizon re-execution guard (NFR1). Null on reads.
    idempotencyKey: text("idempotency_key"),
    // AD-3 drift provenance (NFR8): the per-op fingerprint AND the whole-snapshot
    // id, stored verbatim, never recomputed.
    schemaFingerprint: text("schema_fingerprint"),
    registrySnapshotId: text("registry_snapshot_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Dual-origin de-dup (AC 1). Default NULLS DISTINCT: a run-origin row (null
    // tool_call_id) never collides on the tool key, and a tool-origin row (null
    // execution id) never collides on the run key.
    uniqueIndex("ledger_entry_org_tool_call_idx").on(
      table.orgId,
      table.toolCallId,
    ),
    uniqueIndex("ledger_entry_org_execution_idx").on(
      table.orgId,
      table.keeperhubExecutionId,
      table.workflowId,
    ),
    // Support for Epic 3's FR14 record queries (newest-first, org-scoped). A
    // deliberate convention addition, not AC-mandated — cheap to carry now.
    index("ledger_entry_org_created_idx").on(
      table.orgId,
      table.createdAt.desc(),
    ),
  ],
);

export type LedgerEntryRow = typeof ledgerEntry.$inferSelect;
export type NewLedgerEntryRow = typeof ledgerEntry.$inferInsert;

/*
 * A shared receipt link (decision 37). The id is the link's token (16 random
 * bytes, base64url). One live link per ledger row: sharing again returns it,
 * Stop sharing stamps revoked_at for good, and a later Share mints a new token.
 * Deleting a ledger row (never done today) takes its links with it.
 */
export const receiptShare = pgTable(
  "receipt_share",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ledgerEntryId: text("ledger_entry_id")
      .notNull()
      .references(() => ledgerEntry.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("receipt_share_live_idx")
      .on(table.ledgerEntryId)
      .where(sql`${table.revokedAt} is null`),
    index("receipt_share_org_idx").on(table.orgId),
  ],
);

export type ReceiptShareRow = typeof receiptShare.$inferSelect;
