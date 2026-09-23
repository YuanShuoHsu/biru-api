CREATE TYPE "public"."sweetness" AS ENUM('NotApplicable', 'Fixed', 'Adjustable');--> statement-breakpoint
CREATE TYPE "public"."sweetness_level" AS ENUM('FullSugar', 'LessSugar', 'HalfSugar', 'LightSugar', 'MinimalSugar', 'NoSugar');--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "sweetness" "sweetness" DEFAULT 'NotApplicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "fixed_sweetness_level" "sweetness_level";--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "sweetness_level" "sweetness_level";--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menuItem_fixed_sweetness_level" CHECK (("menu_item"."sweetness" = 'Fixed') = ("menu_item"."fixed_sweetness_level" IS NOT NULL));