ALTER TABLE "menu_item" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_section" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;