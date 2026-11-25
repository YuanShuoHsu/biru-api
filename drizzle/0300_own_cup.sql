ALTER TABLE "catalog_modifier" ADD COLUMN "customer_provided_cup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "cup_received_at" timestamp;