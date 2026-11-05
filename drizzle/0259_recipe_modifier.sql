ALTER TABLE "recipe" ADD COLUMN "modifier_id" text;--> statement-breakpoint
ALTER TABLE "modifier" ADD COLUMN "auto_sold_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_modifier_id_modifier_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifierId_uidx" ON "recipe" USING btree ("modifier_id");--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_menuItemId_modifierId_check" CHECK ("recipe"."menu_item_id" is null or "recipe"."modifier_id" is null);