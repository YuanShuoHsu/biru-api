ALTER TABLE "organization" ADD COLUMN "dine_in_table_count" integer;--> statement-breakpoint
UPDATE "organization" SET "dine_in_table_count" = "used"."max_table_number"
FROM (
	SELECT "seller_id", max("table_number") AS "max_table_number"
	FROM "order"
	WHERE "table_number" IS NOT NULL
	GROUP BY "seller_id"
) AS "used"
WHERE "used"."seller_id" = "organization"."id";
