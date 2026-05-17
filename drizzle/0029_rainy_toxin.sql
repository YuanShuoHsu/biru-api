ALTER TABLE "offer" DROP COLUMN "sku";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "eligible_customer_type";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "available_delivery_method";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "accepted_payment_method";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "eligible_transaction_volume";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "shipping_details";--> statement-breakpoint
DROP TYPE "public"."accepted_payment_method";--> statement-breakpoint
DROP TYPE "public"."available_delivery_method";--> statement-breakpoint
DROP TYPE "public"."business_entity_type";