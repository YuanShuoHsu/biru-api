ALTER TABLE "audit_log" ADD COLUMN "resource_label" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ancestor_ids" text[];