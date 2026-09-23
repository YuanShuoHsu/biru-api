ALTER TABLE "menu_item" ADD COLUMN "serving_temperatures" "serving_temperature"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "menu_item" SET "serving_temperatures" = "derived"."temperatures"
FROM (
  SELECT "menu_item_modifier_group"."menu_item_id",
    array_agg(DISTINCT "modifier"."serving_temperature" ORDER BY "modifier"."serving_temperature") AS "temperatures"
  FROM "menu_item_modifier_group"
  JOIN "modifier" ON "modifier"."modifier_group_id" = "menu_item_modifier_group"."modifier_group_id"
  WHERE "modifier"."serving_temperature" IS NOT NULL
  GROUP BY "menu_item_modifier_group"."menu_item_id"
) AS "derived"
WHERE "menu_item"."id" = "derived"."menu_item_id";--> statement-breakpoint
ALTER TABLE "modifier" DROP COLUMN "serving_temperature";
