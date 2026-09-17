CREATE TABLE "receipt_share" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"ledger_entry_id" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "receipt_share" ADD CONSTRAINT "receipt_share_ledger_entry_id_ledger_entry_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_share_live_idx" ON "receipt_share" USING btree ("ledger_entry_id") WHERE "receipt_share"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "receipt_share_org_idx" ON "receipt_share" USING btree ("org_id");