ALTER TABLE "offer" ADD COLUMN "auto_sold_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "held_offer_stock" jsonb;