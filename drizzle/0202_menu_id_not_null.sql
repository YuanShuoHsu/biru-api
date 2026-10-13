UPDATE "menu_item" SET "menu_id" = "menu_section"."menu_id" FROM "menu_section" WHERE "menu_section"."id" = "menu_item"."menu_section_id" AND "menu_item"."menu_id" IS NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ALTER COLUMN "menu_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_section" ALTER COLUMN "menu_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "modifier_group" ALTER COLUMN "menu_id" SET NOT NULL;
