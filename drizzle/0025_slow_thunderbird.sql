CREATE TYPE "public"."available_delivery_method" AS ENUM('DeliveryModePickUp', 'DeliveryModeOwnFleet', 'ParcelService');--> statement-breakpoint
CREATE TYPE "public"."business_entity_type" AS ENUM('Business', 'Enduser', 'PublicInstitution', 'Reseller');--> statement-breakpoint
ALTER TABLE "offer" DROP CONSTRAINT "offer_seller_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "eligible_customer_type" "business_entity_type"[];--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "valid_for_member_tier" text[];--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "available_delivery_method" "available_delivery_method"[];--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "delivery_lead_time" jsonb;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "inventory_level" jsonb;--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "seller_id";--> statement-breakpoint
ALTER TABLE "offer" DROP COLUMN "eligible_region";