-- 重複的加購只是保留列的副本，而 migration 共用一個交易，記進 deleted_record 會成為跨店且無法還原的同一批
SELECT set_config('app.skip_deleted_record', 'on', true);--> statement-breakpoint
DELETE FROM "menu_item_add_on" mia
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "menu_item_id", "add_on_menu_item_id" ORDER BY "sort_order", "created_at", "id"
  ) AS "rn"
  FROM "menu_item_add_on"
  WHERE "add_on_menu_item_id" IS NOT NULL
) d
WHERE mia."id" = d."id" AND d."rn" > 1;--> statement-breakpoint
DELETE FROM "menu_item_add_on" mia
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "menu_item_id", "add_on_menu_section_id" ORDER BY "sort_order", "created_at", "id"
  ) AS "rn"
  FROM "menu_item_add_on"
  WHERE "add_on_menu_section_id" IS NOT NULL
) d
WHERE mia."id" = d."id" AND d."rn" > 1;--> statement-breakpoint
SELECT set_config('app.skip_deleted_record', 'off', true);--> statement-breakpoint
CREATE UNIQUE INDEX "menuItemAddOn_menuItemId_addOnMenuItemId_uidx" ON "menu_item_add_on" USING btree ("menu_item_id","add_on_menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menuItemAddOn_menuItemId_addOnMenuSectionId_uidx" ON "menu_item_add_on" USING btree ("menu_item_id","add_on_menu_section_id");
