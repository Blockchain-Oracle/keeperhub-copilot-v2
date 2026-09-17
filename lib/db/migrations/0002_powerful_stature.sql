CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_call_id" text,
	"keeperhub_execution_id" text,
	"workflow_id" text,
	"org_id" text NOT NULL,
	"conversation_id" text,
	"op_id" text NOT NULL,
	"state" text NOT NULL,
	"confirmed_inputs" jsonb,
	"tx_hash" text,
	"receipt" jsonb,
	"idempotency_key" text,
	"schema_fingerprint" text,
	"registry_snapshot_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entry_org_tool_call_idx" ON "ledger_entry" USING btree ("org_id","tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entry_org_execution_idx" ON "ledger_entry" USING btree ("org_id","keeperhub_execution_id","workflow_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_org_created_idx" ON "ledger_entry" USING btree ("org_id","created_at" DESC NULLS LAST);