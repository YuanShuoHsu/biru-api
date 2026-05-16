ALTER TABLE "offer" ADD COLUMN "eligible_quantity" jsonb;--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "eligible_quantity_min";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "eligible_quantity_max";