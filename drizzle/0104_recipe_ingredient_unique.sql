-- 唯一索引之前允許同一食材重複列，而 consume() 會照列數各扣一次；
-- 合併成一列並加總用量，維持與建索引前相同的扣帳量
UPDATE "recipe_ingredient" ri SET "required_quantity" = m."required_quantity"
FROM (
  SELECT DISTINCT ON ("recipe_id", "ingredient_id")
    "id",
    SUM("required_quantity") OVER (PARTITION BY "recipe_id", "ingredient_id") AS "required_quantity"
  FROM "recipe_ingredient"
  ORDER BY "recipe_id", "ingredient_id", "sort_order", "created_at", "id"
) m
WHERE ri."id" = m."id" AND ri."required_quantity" <> m."required_quantity";--> statement-breakpoint
DELETE FROM "recipe_ingredient" ri
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "recipe_id", "ingredient_id" ORDER BY "sort_order", "created_at", "id"
  ) AS "rn"
  FROM "recipe_ingredient"
) d
WHERE ri."id" = d."id" AND d."rn" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "recipeIngredient_recipeId_ingredientId_uidx" ON "recipe_ingredient" USING btree ("recipe_id","ingredient_id");
