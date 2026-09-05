ALTER TABLE IF EXISTS "inventory_transaction_reason" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "inventory_transaction_reason" CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP CONSTRAINT IF EXISTS "inventory_transaction_reason_id_inventory_transaction_reason_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "resource" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."audit_resource";--> statement-breakpoint
CREATE TYPE "public"."audit_resource" AS ENUM('menu', 'menuSection', 'menuItem', 'menuItemAddOn', 'modifierGroup', 'modifier', 'menuItemModifierGroup', 'order', 'userCoupon', 'coupon', 'banner', 'invoice', 'supplier', 'ingredient', 'recipe');--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "resource" SET DATA TYPE "public"."audit_resource" USING "resource"::"public"."audit_resource";--> statement-breakpoint
DROP INDEX IF EXISTS "inventoryTransaction_reasonId_idx";--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP COLUMN "direction";--> statement-breakpoint
ALTER TABLE "inventory_transaction" DROP COLUMN "reason_id";--> statement-breakpoint
DROP TYPE "public"."inventory_direction";--> statement-breakpoint
DROP TYPE "public"."inventory_reason_code";--> statement-breakpoint
DROP TYPE "public"."inventory_transaction_type";