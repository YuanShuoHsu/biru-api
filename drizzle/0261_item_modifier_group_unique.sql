-- 重複的掛載只是保留列的副本，而 migration 共用一個交易，記進 deleted_record 會成為跨店且無法還原的同一批
SELECT set_config('app.skip_deleted_record', 'on', true);--> statement-breakpoint
DELETE FROM "menu_item_modifier_group" mimg
USING (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "menu_item_id", "modifier_group_id" ORDER BY "sort_order", "created_at", "id"
  ) AS "rn"
  FROM "menu_item_modifier_group"
) d
WHERE mimg."id" = d."id" AND d."rn" > 1;--> statement-breakpoint
SELECT set_config('app.skip_deleted_record', 'off', true);--> statement-breakpoint
CREATE UNIQUE INDEX "menuItemModifierGroup_menuItemId_modifierGroupId_uidx" ON "menu_item_modifier_group" USING btree ("menu_item_id","modifier_group_id");
