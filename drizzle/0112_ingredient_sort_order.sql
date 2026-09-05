ALTER TABLE "ingredient" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- 既有資料一律 0，不補值的話改成依 sort_order 排序後畫面會變成沒有次序可言
UPDATE "ingredient" i SET "sort_order" = r."rn"
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "organization_id" ORDER BY "name"::text
  ) - 1 AS "rn"
  FROM "ingredient"
) r
WHERE r."id" = i."id";
