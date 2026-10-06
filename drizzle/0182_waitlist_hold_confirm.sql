ALTER TABLE "waitlist_setting" ADD COLUMN "hold_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_ticket" ADD COLUMN "confirmed_at" timestamp;