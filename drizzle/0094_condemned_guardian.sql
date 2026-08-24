ALTER TABLE "invoice" ADD COLUMN "print_reset_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "print_reset_reason" text;