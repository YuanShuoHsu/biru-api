ALTER TABLE "offer" ADD COLUMN "price_specification" jsonb;--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "valid_from";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "valid_through";