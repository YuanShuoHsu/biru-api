ALTER TABLE "offer" ADD COLUMN "available_hours" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "pickup_time" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "pickup_scheduling_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "pickup_lead_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "pickup_max_advance_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "pickup_cutoff_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
CREATE INDEX "order_sellerId_pickupAt_idx" ON "order" USING btree ("seller_id",COALESCE("pickup_time", "created_at"));