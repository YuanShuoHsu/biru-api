ALTER TABLE "ingredient" DROP CONSTRAINT "ingredient_recipe_id_recipe_id_fk";
--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;