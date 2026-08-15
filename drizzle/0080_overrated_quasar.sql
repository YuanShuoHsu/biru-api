ALTER TABLE "audit_log" ALTER COLUMN "resource" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."audit_resource";--> statement-breakpoint
CREATE TYPE "public"."audit_resource" AS ENUM('menu', 'menuSection', 'menuItem', 'menuItemAddOn', 'modifierGroup', 'modifier', 'menuItemModifierGroup', 'order', 'userCoupon');--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "resource" SET DATA TYPE "public"."audit_resource" USING "resource"::"public"."audit_resource";