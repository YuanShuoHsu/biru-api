ALTER TABLE "menu" ALTER COLUMN "name" SET DATA TYPE jsonb USING jsonb_build_object('zh-TW', "name");--> statement-breakpoint
ALTER TABLE "menu" ALTER COLUMN "description" SET DATA TYPE jsonb USING CASE WHEN "description" IS NOT NULL THEN jsonb_build_object('zh-TW', "description") ELSE NULL END;--> statement-breakpoint
ALTER TABLE "menu_item" ALTER COLUMN "name" SET DATA TYPE jsonb USING jsonb_build_object('zh-TW', "name");--> statement-breakpoint
ALTER TABLE "menu_item" ALTER COLUMN "description" SET DATA TYPE jsonb USING CASE WHEN "description" IS NOT NULL THEN jsonb_build_object('zh-TW', "description") ELSE NULL END;--> statement-breakpoint
ALTER TABLE "menu_section" ALTER COLUMN "name" SET DATA TYPE jsonb USING jsonb_build_object('zh-TW', "name");--> statement-breakpoint
ALTER TABLE "menu_section" ALTER COLUMN "description" SET DATA TYPE jsonb USING CASE WHEN "description" IS NOT NULL THEN jsonb_build_object('zh-TW', "description") ELSE NULL END;--> statement-breakpoint
ALTER TABLE "modifier" ALTER COLUMN "display_name" SET DATA TYPE jsonb USING jsonb_build_object('zh-TW', "display_name");--> statement-breakpoint
ALTER TABLE "modifier_group" ALTER COLUMN "display_name" SET DATA TYPE jsonb USING jsonb_build_object('zh-TW', "display_name");--> statement-breakpoint
ALTER TABLE "menu" DROP COLUMN "in_language";--> statement-breakpoint
DROP TYPE "public"."language";