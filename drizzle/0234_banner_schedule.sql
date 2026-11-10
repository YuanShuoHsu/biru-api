ALTER TABLE "banner" ADD COLUMN "alt" jsonb;--> statement-breakpoint
ALTER TABLE "banner" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "banner" ADD COLUMN "starts_at" timestamp;--> statement-breakpoint
ALTER TABLE "banner" ADD COLUMN "ends_at" timestamp;