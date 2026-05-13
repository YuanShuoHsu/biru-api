ALTER TABLE "menu" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "keywords" text[];--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "description" text;