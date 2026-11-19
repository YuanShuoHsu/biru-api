-- 重複的加購只是保留列的副本，而 migration 共用一個交易，記進 deleted_record 會成為跨店且無法還原的同一批
SELECT set_config('app.skip_deleted_record', 'on', true);--> statement-breakpoint
DELETE FROM "catalog_item_add_on" cia
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "catalog_item_id", "add_on_catalog_item_id" ORDER BY "sort_order", "created_at", "id"
  ) AS "rn"
  FROM "catalog_item_add_on"
  WHERE "add_on_catalog_item_id" IS NOT NULL
) d
WHERE cia."id" = d."id" AND d."rn" > 1;--> statement-breakpoint
DELETE FROM "catalog_item_add_on" cia
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "catalog_item_id", "add_on_catalog_section_id" ORDER BY "sort_order", "created_at", "id"
  ) AS "rn"
  FROM "catalog_item_add_on"
  WHERE "add_on_catalog_section_id" IS NOT NULL
) d
WHERE cia."id" = d."id" AND d."rn" > 1;--> statement-breakpoint
SELECT set_config('app.skip_deleted_record', 'off', true);--> statement-breakpoint
CREATE UNIQUE INDEX "catalogItemAddOn_catalogItemId_addOnCatalogItemId_uidx" ON "catalog_item_add_on" USING btree ("catalog_item_id","add_on_catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogItemAddOn_catalogItemId_addOnCatalogSectionId_uidx" ON "catalog_item_add_on" USING btree ("catalog_item_id","add_on_catalog_section_id");