import { describe, expect, it } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";

import { ledgerEntry } from "@/lib/db/schema";
// The row types must be reachable from the ACCESSOR boundary (AD-9), never from
// lib/db/schema directly — importing them here fails typecheck if 2.2 forgot the
// re-export in lib/data/index.ts.
import type { LedgerEntryRow, NewLedgerEntryRow } from "@/lib/data";

const config = getTableConfig(ledgerEntry);
const columnByName = new Map(config.columns.map((column) => [column.name, column]));

describe("ledger_entry schema shape (AC 1, 4)", () => {
  it("carries every dual-origin + provenance column from the ERD", () => {
    const expected = [
      "id",
      "tool_call_id",
      "keeperhub_execution_id",
      "workflow_id",
      "org_id",
      "conversation_id",
      "op_id",
      "state",
      "confirmed_inputs",
      "tx_hash",
      "receipt",
      "idempotency_key",
      "schema_fingerprint",
      "registry_snapshot_id",
      "created_at",
      "updated_at",
    ];
    for (const name of expected) {
      expect(columnByName.has(name)).toBe(true);
    }
  });

  it("makes org_id / op_id / state NOT NULL and leaves both origin keys nullable", () => {
    expect(columnByName.get("org_id")!.notNull).toBe(true);
    expect(columnByName.get("op_id")!.notNull).toBe(true);
    expect(columnByName.get("state")!.notNull).toBe(true);
    // Dual-origin: a tool-origin row has no execution id, a run-origin row has no
    // tool call id — both halves must be nullable or one origin can never write.
    expect(columnByName.get("tool_call_id")!.notNull).toBe(false);
    expect(columnByName.get("keeperhub_execution_id")!.notNull).toBe(false);
    expect(columnByName.get("workflow_id")!.notNull).toBe(false);
    expect(columnByName.get("conversation_id")!.notNull).toBe(false);
  });

  it("points conversation_id at conversation.id with ON DELETE SET NULL — evidence survives deletion (AC 4)", () => {
    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0];
    // SET NULL, never CASCADE / RESTRICT (AD-2: a conversation delete must never
    // remove or block on a ledger row).
    expect(fk.onDelete).toBe("set null");
    const reference = fk.reference();
    expect(reference.columns.map((column) => column.name)).toEqual([
      "conversation_id",
    ]);
    expect(reference.foreignColumns.map((column) => column.name)).toEqual(["id"]);
    expect(getTableName(reference.foreignTable)).toBe("conversation");
  });

  it("de-dupes each origin with a scoped unique index (AC 1 dual-origin keys)", () => {
    const uniqueNames = config.indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.name);
    expect(uniqueNames).toContain("ledger_entry_org_tool_call_idx");
    expect(uniqueNames).toContain("ledger_entry_org_execution_idx");

    const toolIdx = config.indexes.find(
      (index) => index.config.name === "ledger_entry_org_tool_call_idx",
    );
    expect(
      toolIdx!.config.columns.map((column) => (column as { name?: string }).name),
    ).toEqual(["org_id", "tool_call_id"]);

    const runIdx = config.indexes.find(
      (index) => index.config.name === "ledger_entry_org_execution_idx",
    );
    expect(
      runIdx!.config.columns.map((column) => (column as { name?: string }).name),
    ).toEqual(["org_id", "keeperhub_execution_id", "workflow_id"]);
  });

  it("carries a non-unique org/created index for the later FR14 record queries", () => {
    const created = config.indexes.find(
      (index) => index.config.name === "ledger_entry_org_created_idx",
    );
    expect(created).toBeDefined();
    expect(created!.config.unique).toBe(false);
  });

  it("exports the row types from the accessor boundary (compile-time proof)", () => {
    // A runtime no-op: the value is the point of interest at the TYPE level. If
    // LedgerEntryRow / NewLedgerEntryRow were not re-exported from lib/data, this
    // file would not typecheck.
    const select = null as unknown as LedgerEntryRow | null;
    const insert = null as unknown as NewLedgerEntryRow | null;
    expect(select).toBeNull();
    expect(insert).toBeNull();
  });
});
