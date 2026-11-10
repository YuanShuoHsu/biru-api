ALTER TABLE "ingredient" ADD COLUMN "recipe_id" text;--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN "recipe_yield_quantity" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN "recipe_yield_unit_code" "unit_code";--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_recipeId_idx" ON "ingredient" USING btree ("recipe_id");