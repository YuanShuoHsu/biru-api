ALTER TABLE "ingredient" ADD COLUMN "eligible_quantity" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "eligible_quantity_unit_code" "unit_code";--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "price_currency" text DEFAULT 'TWD' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "url" text;--> statement-breakpoint
-- 一個食材一組採購規格；取排序第一筆，那也是原本成本採用的那一筆
UPDATE "ingredient" i SET
  "eligible_quantity" = o."eligible_quantity",
  "eligible_quantity_unit_code" = o."eligible_quantity_unit_code",
  "price" = o."price",
  "price_currency" = o."price_currency",
  "url" = o."url"
FROM (
  SELECT DISTINCT ON ("ingredient_id") *
  FROM "ingredient_offer"
  ORDER BY "ingredient_id", "sort_order", "created_at"
) o
WHERE o."ingredient_id" = i."id";--> statement-breakpoint
DROP TABLE "ingredient_offer" CASCADE;
