# 品牌商品目錄與門市上架

本文是 #461 的 PR 0：把「每間門市一份獨立菜單」改成「全品牌一份商品目錄＋各門市的上架與覆寫」的完整設計。
方向、設計原則、權限與 PR 拆分已在 #461 決定，本文只把它落到現有程式上，並列出寫 migration 前需要開發者確認的事。
文中的 `path:line` 指 `develop` 在撰寫當下的程式。

## 總覽

核心決定只有三個，其餘細節都由它們推出。

1. **既有的 `menu_section`、`menu_item`、`modifier` 原地演變成門市層級的資料表**，表名不改；品項內容搬到新的 `catalog_*` 資料表。
   門市層級的東西（`offer`、食譜、出單機、自動售完、`order.held_offer_stock`）本來就掛在這幾張表的 id 上，原地演變就不必改任何外鍵或快照。
2. **搬移時目錄列沿用來源列的 id**：`catalog_item.id = menu_item.id`、`catalog_section.id = menu_section.id`、`catalog_modifier.id = modifier.id`，其餘依此類推。
   既有的優惠券指定品項、訂單快照、共享購物車、前台 localStorage 購物車與圖片 id 因此不必轉換。
3. **點餐菜單裡的品項 id 一律是門市上架列（`menu_item.id`）**，分類、客製群組、客製選項的 id 一律是目錄 id。
   搬移過的資料兩者相同，所以切換前後 `order-menu` 的回應完全一樣，可以直接做新舊比對測試。

## 現況盤點

### 菜單資料表（`src/db/schema/menus.ts`）

每間門市只有一份菜單：`menu` 以 `organization_id` 唯一（`menus.ts:74`），由 better-auth 的 `afterCreateOrganization` 在建立門市時寫入（`src/auth/index.ts:342-357`）。
下表的「歸屬」是本設計對每個欄位的判定：**品牌**＝搬到目錄，**門市**＝留在門市層級，**結構**＝由目錄的關聯取代。

| 表（定義位置）                                   | 欄位                                                                                                                                                                                                                                 | 歸屬                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `menu`（`menus.ts:60-76`）                       | `organization_id`、`name`、`description`、`image`                                                                                                                                                                                    | 門市（整份菜單的外殼）     |
| `menu_section`（`menus.ts:81-110`）              | `name`、`description`、`image`、`sort_order`、`parent_section_id`                                                                                                                                                                    | 品牌                       |
|                                                  | `menu_id`、`order_ticket_printer_id`（`menus.ts:96-99`，null 沿用上層）                                                                                                                                                              | 門市                       |
| `menu_item`（`menus.ts:131-187`）                | `name`、`description`、`image`、`suitable_for_diet`、`serving_temperatures`、`recommended_serving_temperature_level`、`sweetness`、`fixed_sweetness_level`、`recommended_sweetness_level`、`nutrition`、`sort_order`、兩個甜度 check | 品牌                       |
|                                                  | `menu_section_id`                                                                                                                                                                                                                    | 結構（改由目錄品項的分類） |
|                                                  | `menu_id`、`available_modes`、`order_ticket_printer_id`                                                                                                                                                                              | 門市                       |
| `offer`（`menus.ts:205-231`）                    | `price`、`availability`、`auto_sold_out`、`available_hours`、`delivery_lead_time_minutes`、`inventory_level`、`price_specification`                                                                                                  | 門市                       |
|                                                  | `menu_section_id`（沒有任何 DTO 或服務寫入，只出現在 schema、relations、`RolesGuard` 與異動標籤）                                                                                                                                    | 結構（廢棄）               |
| `menu_item_add_on`（`menus.ts:236-258`）         | `menu_item_id`、`add_on_menu_item_id`、`add_on_menu_section_id`、`sort_order`                                                                                                                                                        | 品牌                       |
| `modifier_group`（`menus.ts:263-277`）           | `display_name`、`min_selection_count`、`max_selection_count`、`sort_order`；`menu_id`                                                                                                                                                | 品牌                       |
| `modifier`（`menus.ts:282-302`）                 | `display_name`、`image`、`sort_order`；`modifier_group_id`                                                                                                                                                                           | 品牌                       |
|                                                  | `price_adjustment`（建議值歸品牌，覆寫歸門市）、`availability`、`auto_sold_out`、`available_modes`                                                                                                                                   | 門市                       |
| `menu_item_modifier_group`（`menus.ts:307-330`） | `menu_item_id`、`modifier_group_id`、`sort_order`，唯一 `(menu_item_id, modifier_group_id)`                                                                                                                                          | 品牌                       |

`offer` 與 `menu_item` 是一對多，但所有讀取都只取 `created_at` 最早的一筆（`src/menus/menus.service.ts:640-659`、`:686`、`src/orders/order-pricing.service.ts:172-175`、`src/menus/menus-public.service.ts:50-54`），實際上是一對一。

### 參照菜單的其他資料

| 位置                                                                                               | 參照                                                                                         | 是否有外鍵               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| `order_item.menu_item_id`（`src/db/schema/orders.ts:182`）                                         | 下單當時的 `menu_item.id`；名稱、價格、客製另存快照                                          | 無                       |
| `order_item.modifiers`／`add_ons` 快照（`orders.ts:75-91`）                                        | `modifierGroupId`、`modifierId`、加購的 `menuItemId`                                         | 無（jsonb）              |
| `order.held_offer_stock`（`orders.ts:124`）                                                        | 以 `offer.id` 為鍵的保留數量，`src/inventory/inventory-transactions.service.ts:577-697` 讀寫 | 無（jsonb）              |
| `shared_cart_item.menu_item_id`、`modifiers`、`add_ons`（`src/db/schema/shared-carts.ts:136-160`） | 與下單相同的 id                                                                              | 無                       |
| `coupon.menu_item_ids`／`menu_section_ids`（`src/db/schema/coupons.ts:64-65`）                     | 指定品項與分類，比對在 `src/coupons/coupons.service.ts:154-159`                              | 無（text[]）             |
| `recipe.menu_item_id`／`modifier_id`（`src/db/schema/inventory.ts:148-153`）                       | 門市食譜，各自全域唯一（`inventory.ts:169-170`）                                             | 有，`on delete set null` |
| `menu_section`／`menu_item.order_ticket_printer_id`                                                | `printer`（`src/db/schema/printers.ts:37`）                                                  | 有，`on delete set null` |

`push_subscription`、`store_layout`、`waitlist_*` 都不參照菜單。

## 目標資料模型

### 品牌目錄（新表）

時間欄位一律用 `columns.helpers.ts` 的 `timestamps`，和現在的菜單表一致。
`owner_organization_id` 為 null 代表品牌品項，有值代表該門市的獨家品項；只放在三個根（分類、品項、客製群組），子表從父列繼承，避免兩個欄位互相矛盾（見問題 7）。

**`catalog_section`**

| 欄位                        | 型別                  | 可空 | 說明                                                                 |
| --------------------------- | --------------------- | ---- | -------------------------------------------------------------------- |
| `id`                        | text PK               | 否   | 搬移時等於來源 `menu_section.id`                                     |
| `owner_organization_id`     | text → `organization` | 是   | `on delete cascade`，比照 `menu.organization_id`（`menus.ts:64-66`） |
| `parent_catalog_section_id` | text → self           | 是   | `on delete cascade`，比照 `menus.ts:88-91`                           |
| `name`                      | jsonb `LocalizedText` | 否   |                                                                      |
| `description`               | jsonb `LocalizedText` | 是   |                                                                      |
| `image`                     | text                  | 是   |                                                                      |
| `sort_order`                | integer default 0     | 否   |                                                                      |

索引：`owner_organization_id`、`parent_catalog_section_id`。
服務層規則：獨家分類的上層只能是品牌分類或同一門市的獨家分類。

**`catalog_item`**

| 欄位                              | 型別                                                   | 可空 | 說明                                         |
| --------------------------------- | ------------------------------------------------------ | ---- | -------------------------------------------- |
| `id`                              | text PK                                                | 否   | 搬移時等於來源 `menu_item.id`                |
| `owner_organization_id`           | text → `organization`                                  | 是   | `on delete cascade`                          |
| `catalog_section_id`              | text → `catalog_section`                               | 是   | `on delete cascade`，比照 `menus.ts:138-140` |
| `name`、`description`、`image`    | 同 `menu_item`                                         |      |                                              |
| `suitable_for_diet` … `nutrition` | 同 `menu_item`（`menus.ts:144-165`），含兩個甜度 check |      | `available_modes` 不搬，留在門市             |
| `suggested_price`                 | numeric(10,2)                                          | 是   | 建議售價；門市沒有自訂售價時使用             |
| `discontinued`                    | boolean default false                                  | 否   | 品牌「停止供應」，所有門市一起下架           |
| `sort_order`                      | integer default 0                                      | 否   |                                              |

索引：`owner_organization_id`、`catalog_section_id`。
服務層規則：品項的分類必須是品牌分類，或與品項同一個擁有者的獨家分類。

**`catalog_modifier_group`**：`id`、`owner_organization_id`（cascade）、`display_name`、`min_selection_count`、`max_selection_count`、`sort_order`，欄位定義照抄 `menus.ts:270-273`。

**`catalog_modifier`**：`id`、`catalog_modifier_group_id`（not null，cascade）、`display_name`、`image`、`price_adjustment`（建議加價，null 代表不加價）、`sort_order`。
供應狀態、售完與點餐模式不在這裡，屬於門市覆寫。

**`catalog_item_modifier_group`**：`id`、`catalog_item_id`（cascade）、`catalog_modifier_group_id`（cascade）、`sort_order`，唯一 `(catalog_item_id, catalog_modifier_group_id)`，比照 `menus.ts:325-328`。
服務層規則：品牌品項只能連品牌群組；獨家品項可連品牌群組或同門市的獨家群組。

**`catalog_item_add_on`**：`id`、`catalog_item_id`（cascade）、`add_on_catalog_item_id`（cascade，可空）、`add_on_catalog_section_id`（cascade，可空）、`sort_order`，比照 `menus.ts:236-258`。
加購的品項在某間門市實際出現，條件是該門市有上架那個品項；同樣不允許品牌品項加購獨家品項或獨家分類。

### 門市層級（既有表演變）

| 表             | PR 1 新增欄位（先可為空）                                                       | 唯一鍵（PR 1 建立）                | 外鍵 on delete                  | PR 9 移除的欄位                                                                                                  |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `menu_section` | `catalog_section_id`、`hidden boolean default false`                            | `(menu_id, catalog_section_id)`    | `catalog_section_id` cascade    | `parent_section_id`、`name`、`description`、`image`、`sort_order`；`catalog_section_id` 改 not null              |
| `menu_item`    | `catalog_item_id`                                                               | `(menu_id, catalog_item_id)`       | `catalog_item_id` **no action** | `menu_section_id`、`name` 到 `nutrition` 的內容欄位、`sort_order`、兩個甜度 check；`catalog_item_id` 改 not null |
| `offer`        | 無                                                                              | PR 9：`(menu_item_id)`，改成一對一 | 不變                            | `menu_section_id`；`menu_item_id` 改 not null                                                                    |
| `modifier`     | `menu_id`（→ `menu`，cascade）、`catalog_modifier_id`                           | `(menu_id, catalog_modifier_id)`   | `catalog_modifier_id` cascade   | `modifier_group_id`、`display_name`、`image`、`sort_order`；`menu_id`、`catalog_modifier_id` 改 not null         |
| `organization` | `allow_local_menu_items`、`allow_local_pricing`，boolean not null default false |                                    |                                 |                                                                                                                  |

不再使用、於 PR 9 刪除的表：`menu_item_add_on`、`modifier_group`、`menu_item_modifier_group`。
`menu` 保留，仍是門市菜單的外殼（點餐菜單最上層的 `name`、`image` 來自它）。

說明：

- 門市以 `menu_id` 識別，不另加 `organization_id`：`menu.organization_id` 已唯一（`menus.ts:74`），`(menu_id, catalog_item_id)` 與 issue 寫的 `(organization_id, catalog_item_id)` 等價，多加一欄只會多一個可能不一致的副本。
- `menu_item.catalog_item_id` 用 no action 而不用 restrict：刪除門市時 `organization → menu → menu_item` 與 `organization → catalog_item` 兩條 cascade 在同一個敘述內，no action 在敘述結束才檢查，不會因刪除順序失敗；品牌刪除仍有上架列的品項則一定被擋下。
- **上架**＝有 `menu_item` 列且它的 `offer.availability` 不是 `Discontinued`；**下架**沿用現在的 `Discontinued`（點餐菜單本來就據此隱藏，`menus-public.service.ts:50-54`、`:233`）。不新增 `listed` 欄位，舊程式在切換前看到的狀態也一致（見問題 17）。
- **門市售價**＝`offer.price`，null 時用 `catalog_item.suggested_price`；促銷價 `price_specification` 也是門市售價的一部分，同樣受 `allow_local_pricing` 管制。
- **客製選項覆寫**：`modifier` 列是可有可無的覆寫，沒有覆寫列時視為供應中、不售完、加價等於目錄建議值、所有點餐模式可選。覆寫列在門市第一次設定、或為該選項建立食譜時建立（食譜必須掛在門市的列上，因為 `recipe_modifierId_uidx` 是全域唯一，`inventory.ts:170`）。
- **分類覆寫**：`menu_section` 同樣可有可無，只存出單機與 `hidden`。
- 訂單與購物車：`order_item`、`shared_cart_item` 各加 `catalog_item_id text`（可空、無外鍵，比照 `menu_item_id` 沒有外鍵，歷史訂單必須在品項刪除後留存）。`OrderItemAddOnSnapshot`、`SharedCartItemAddOn` 加選填的 `catalogItemId`，舊快照沒有這個欄位。

### 刪除留存與還原

| 表                                                               | `record_deleted_row` trigger | `RESTORABLE_TABLES` | `RESTORE_PERMISSIONS`                                                                |
| ---------------------------------------------------------------- | ---------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| 六張 `catalog_*`                                                 | 有，寫在建表的 migration     | 加入                | 不列（只有平台管理員能還原，見問題 10）                                              |
| `menu_section`、`menu_item`、`offer`、`modifier`                 | 已有（`0190`）               | 已在                | 維持 `{ menu: ['create'] }`（`src/deleted-records/deleted-record-tables.ts:95-101`） |
| `menu_item_add_on`、`modifier_group`、`menu_item_modifier_group` | 已有                         | PR 9 移出           | PR 9 移出                                                                            |

沒有任何新表屬於 `UNTRACKED_TABLES`（`deleted-record-tables.ts:2-22`）；目錄是使用者維護的內容，刪除必須能還原。
建表 migration 的寫法比照 `drizzle/0242_store_photos.sql:11`；漏掛時 `deleted-records.service.ts:313-319` 會在啟動時警告。

`deleted-records.service.ts` 要一起改：

- 資源對照表（`:199-230`）加入六張目錄表對應的異動資源。
- `MENU_TABLES`（`:232-240`）加入目錄表，還原後送出 `menuUpdated`；目錄列的門市為 null，要改成推給有上架受影響品項的門市（見「即時推播」）。
- `organizationIdOf`（`:258-283`）目前只認 `organization_id`、`seller_id` 與沿 `menu_id` 往上找；要加入 `owner_organization_id`，以及 `catalog_item_id`、`catalog_modifier_group_id` 往上找擁有者。不加的話門市獨家品項的刪除紀錄會被當成平台層級，門市看不到。

## 既有資料搬移（PR 2）

`scripts/migrate-menu-catalog.ts`，用法比照 `scripts/migrate-images-to-storage.ts`：預設 dry-run 只印出計畫與數量，`--apply` 才寫入，整個門市在一個交易內完成。

### 對應規則

先數有菜單內容（至少一個分類或品項）的門市：

- **只有一間**：它的分類、品項、客製群組全部成為品牌項目（`owner_organization_id = null`），`suggested_price` 取該品項的 `offer.price`，`catalog_modifier.price_adjustment` 取 `modifier.price_adjustment`。
- **兩間以上**：每間門市的內容各自成為該門市的獨家項目（`owner_organization_id = 該門市`），之後由平台管理員決定哪些升級為品牌項目。

逐表對應（id 一律沿用來源列）：

| 來源                       | 目錄                          | 門市端連結                                                               |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `menu_section`             | `catalog_section`             | `menu_section.catalog_section_id = id`                                   |
| `menu_item`                | `catalog_item`                | `menu_item.catalog_item_id = id`                                         |
| `modifier_group`           | `catalog_modifier_group`      | 無（群組沒有門市層級）                                                   |
| `modifier`                 | `catalog_modifier`            | `modifier.catalog_modifier_id = id`、`modifier.menu_id = 群組的 menu_id` |
| `menu_item_modifier_group` | `catalog_item_modifier_group` | 無                                                                       |
| `menu_item_add_on`         | `catalog_item_add_on`         | 無                                                                       |

之後回填 `order_item.catalog_item_id` 與 `shared_cart_item.catalog_item_id`：取 `menu_item.catalog_item_id`，品項已刪除的保留 null。

### 可重跑

- 以 id 判斷是否已搬：目錄列不存在就新增，存在就**以舊表內容覆寫**。PR 5 部署前，舊表仍是唯一的寫入來源，所以 PR 5 上線前要再跑一次 `--apply` 作為最後同步。
- 門市端連結只在欄位為 null 時寫入，不覆蓋已經指向別處的連結。
- dry-run 另外列出：目錄中有、但來源列已不存在的 id（舊端點在兩次執行之間刪掉的），以及兩間以上門市時每間門市的筆數，方便開發者確認走哪條規則。
- PR 5 上線後腳本拒絕執行，避免用過期的舊欄位覆蓋目錄。

### 圖片

`image` 欄位原樣複製，不重新上傳、不改值。
S3 的物件鍵是 `<kind>/<imageVersion>.<ext>`（`src/images/image-storage.service.ts:66`），欄位存完整網址，複製後指向同一個物件。
資料庫內的 data URL 版本是內容的雜湊（`src/images/image-url.ts:50-51`），複製後不變；網址是 `/api/images/<kind>/<id>/<version>.<ext>`（`image-url.ts:53-58`），因為 id 沿用，只有 `kind` 從 `menuItem` 變成 `catalogItem`。

## 圖片儲存的對應

`IMAGE_KINDS`（`src/images/image-url.ts:8-15`）與 `IMAGE_TABLES`（`src/images/images.service.ts:19-26`）在 **PR 1** 加入 `catalogSection`、`catalogItem`、`catalogModifier`，對到三張有 `image` 的目錄表。
一定要在 PR 2 搬圖片之前完成：孤兒清理把 `IMAGE_TABLES` 每張表的 `image`、這些表在 `deleted_record` 的 `image`、以及近 7 天異動紀錄的 `image.before` 都算成參照（`src/images/image-orphans.service.ts:77-113`）。

這套機制在過渡期正好安全：

- 參照是以物件鍵（網址最後兩段，`image-orphans.service.ts:17-18`）收成一個全域集合，不分 kind；所以 `catalog_item.image` 指向 `menuItem/xxx.png` 時，即使舊的 `menu_item` 列被刪、圖片被換，物件仍被目錄參照。
- 異動紀錄的參照以 `audit_log.resource` 是否屬於 `IMAGE_KINDS` 判斷（`image-orphans.service.ts:105`），所以目錄的異動資源名稱必須和圖片 kind 同名（`catalogSection`、`catalogItem`、`catalogModifier`），而且 `image` 不能列進 `AUDIT_IGNORED_COLUMNS`。
- 新上傳的目錄圖片用新的 kind 當前綴；搬過來的舊物件留在 `menuItem/`、`menuSection/`、`modifier/` 前綴，不搬動。

PR 9 刪掉 `menu_section`、`menu_item`、`modifier` 的 `image` 後，這三個 kind 就沒有對應的表，要從 `IMAGE_TABLES` 拿掉；但孤兒清理仍要列出這三個前綴，否則前綴下不再被參照的物件永遠不會被清掉。
做法是在 `image-orphans.service.ts` 另列一組只供清理的舊前綴（見問題 12）。
`menu` 的圖片不動。

`withImageRefs`／`imageRefQuery` 是以傳入的表計算（`image-url.ts:91-126`），新的目錄查詢照樣使用，點餐菜單仍不把圖片讀出 Postgres。

## 權限與 `RolesGuard`

權限依 #461：品牌項目只有平台管理員；門市的上架、售完、時段、出單機沿用 `menu`、`itemAvailability`；獨家項目與門市售價看門市的兩個開關。不改 `src/auth/permissions.ts`。

兩個開關以 better-auth 的 `additionalFields` 宣告並設 `input: false`，比照 `closedAt`（`src/auth/index.ts:523-528`），店家不能經由 `organization.update` 自行打開；由平台管理員端點設定，比照 `OrganizationClosureController`（`src/organizations/organization-closure.controller.ts:11-35`，`AdminGuard`＋`@Audit('organization')`）。

`RolesGuard.resolveOrganizationId`（`src/menus/guards/roles.guard.ts:132-284`）與 `OrganizationParam`（`src/menus/decorators/roles.decorator.ts:7-19`）的變更：

| 參數                                | 變更                                                                                                                                             | PR  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| `catalogSectionId`                  | 新增：回傳 `catalog_section.owner_organization_id`                                                                                               | 3   |
| `catalogItemId`                     | 新增：回傳 `catalog_item.owner_organization_id`                                                                                                  | 3   |
| `catalogModifierGroupId`            | 新增：回傳 `catalog_modifier_group.owner_organization_id`                                                                                        | 3   |
| `catalogModifierId`                 | 新增：沿 `catalog_modifier_group` 取 `owner_organization_id`                                                                                     | 3   |
| `modifierId`                        | 改用 `modifier.menu_id → menu.organization_id`（現在沿 `modifier_group.menu`，`roles.guard.ts:241-254`；PR 9 刪掉 `modifier_group_id` 後會失效） | 5   |
| `offerId`                           | 只保留 `offer.menu_item → menu` 一條路徑（`roles.guard.ts:178-205` 另外兩條經過 `menu_section_id`，PR 9 會刪掉）                                 | 9   |
| `addOnId`、`groupId`                | 對應端點在 PR 9 移除後一併刪掉（`roles.guard.ts:207-239`）                                                                                       | 9   |
| `menuId`、`sectionId`、`menuItemId` | 不變；`menu_section`、`menu_item` 保留 `menu_id`                                                                                                 | —   |

品牌項目的擁有者是 null，四個新參數會解析成 undefined，`RolesGuard` 回 403（`roles.guard.ts:93`），連平台管理員也一樣，因為角色是在找到門市之後才換成 owner（`:110-121`）。
因此同一份服務有兩組入口：

- `AdminCatalogController`（`@UseGuards(AdminGuard)`，比照 `src/coupons/admin-coupons.controller.ts:32-33`）：品牌項目的新增、修改、刪除，任何目錄項目的修改，以及「升級為品牌項目」。
- 門市獨家入口：`@Roles({ menu: [...] }, 'catalogItemId')` 等；服務再檢查該門市的 `allow_local_menu_items`，關閉時只有平台管理員可用（`request.memberRole` 為 owner 且 `session.user.role === 'admin'`）。新增獨家項目用 `organizations/:organizationSlug/...`，由 slug 決定擁有者。

門市售價（`offer.price`、`offer.price_specification`、`modifier.price_adjustment`）的寫入在服務檢查 `allow_local_pricing`，規則相同。

## 異動紀錄

`audit_resource` 是 pgEnum（`src/db/schema/audit.ts:15-40`），PR 1 以 `ALTER TYPE … ADD VALUE` 加入 `catalogSection`、`catalogItem`、`catalogModifierGroup`、`catalogModifier`、`catalogItemModifierGroup`、`catalogItemAddOn`。
`src/common/utils/audit-resources.ts` 的變更：

- `AUDIT_TABLES`（`:62-87`）加入六張目錄表。
- `FK_LABEL_SOURCES`（`:123-195`）：目錄表的父欄位比照現有的 `menuSection`、`menuItem` 等設定；`menuItem` 加 `catalogItemId → catalogItem.name`，`menuSection` 加 `catalogSectionId`，PR 9 刪掉指向已刪欄位的項目。
- `AUDIT_IGNORED_COLUMNS`（`:106-119`）**不加任何目錄欄位**；`image` 必須留著，理由見「圖片儲存的對應」。
- `AUDIT_SUB_TABLES` 的 `offer`（`:89-98`）維持。

平台管理員端點不經過 `RolesGuard`，`audit_log.organization_id` 會是 null（`src/common/interceptors/audit.interceptor.ts:181`），也就是平台層級紀錄；門市獨家端點則記在該門市。
PR 9 刪掉 `menu_item.name`、`modifier.display_name` 後，刪除紀錄的標籤（`deleted-record-tables.ts:70-77` 的 `LABEL_COLUMNS`）會找不到名稱，要改成經 `catalog_item_id` 取目錄名稱。

## 端點去留

「PR 5 起」指讀取切換之後的行為；PR 9 移除的端點在 PR 5 起就不再生效（見問題 11）。
`src/menus/menus.controller.ts`：

| 端點（行號）                                                                                          | PR 5 起                                                              | PR 9         |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| `GET organizations/:organizationId/menus`（`:86`）、`GET/PATCH menus/:menuId`（`:97`、`:107`）        | 保留，`menu` 仍是門市外殼                                            | 保留         |
| `GET menus/:menuId/order-ticket-printers`（`:155`）                                                   | 保留                                                                 | 保留         |
| `POST/GET menus/:menuId/menu-sections`、`reorder`、批次刪除（`:123`、`:139`、`:164`、`:203`）         | 由目錄分類端點取代                                                   | 移除         |
| `GET/PATCH/DELETE menu-sections/:sectionId`（`:175`、`:187`、`:214`）                                 | 內容由目錄取代；出單機與隱藏改走分類設定端點                         | 移除         |
| `POST/GET menu-sections/:sectionId/menu-items`、`reorder`、批次刪除（`:228`、`:254`、`:277`、`:332`） | 由「目錄品項」＋「上架」取代                                         | 移除         |
| `GET menu-items/:menuItemId`（`:288`）                                                                | 保留為上架列詳情，回應加上目錄品項                                   | 保留         |
| `PATCH menu-items/:menuItemId`（`:306`）                                                              | 只接受 `availableModes`、`orderTicketPrinterId` 與售價；內容欄位拒絕 | 移除內容欄位 |
| `DELETE menu-items/:menuItemId`（`:343`）                                                             | 改為下架移除上架列，不刪目錄品項                                     | 保留         |
| `POST menu-items/:menuItemId/offers`（`:355`）、`DELETE offers/:offerId`（`:425`）                    | 上架時一併建立 offer，不再單獨建立或刪除                             | 移除         |
| `GET menu-items/:menuItemId/offers`（`:375`）                                                         | 保留                                                                 | 保留         |
| `PATCH offers/:offerId`（`:385`）                                                                     | 保留；價格欄位檢查 `allow_local_pricing`                             | 保留         |
| `PATCH offers/:offerId/availability`（`:405`）                                                        | 保留（`itemAvailability`）                                           | 保留         |
| `menu-items/:menuItemId/add-ons` 七個端點（`:440-511`）                                               | 由目錄加購端點取代                                                   | 移除         |
| `menus/:menuId/modifier-groups`、`modifier-groups/:groupId` 七個端點（`:513-594`）                    | 由目錄客製群組端點取代                                               | 移除         |
| `modifier-groups/:groupId/modifiers` 三個端點、`GET/PATCH/DELETE modifiers/:modifierId`（`:596-722`） | 由目錄客製選項端點取代；門市設定改走客製選項覆寫端點                 | 移除         |
| `PATCH modifiers/:modifierId/availability`（`:679`）                                                  | 由以目錄 id 為鍵的覆寫端點取代（沒有覆寫列時建立）                   | 移除         |
| `menu-items/:menuItemId/modifier-groups` 四個端點（`:724-783`）                                       | 由目錄品項的群組連結端點取代                                         | 移除         |
| `GET organizations/:organizationId/order-menu`（`menus-public.controller.ts:24`）                     | 改由目錄＋門市設定組成，**回應形狀與值不變**                         | 保留         |

新增端點（PR 3、PR 4）：

| 端點                                                                                                              | 守衛                                                   | PR  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --- |
| `catalog/sections`、`catalog/items`、`catalog/modifier-groups` 的 CRUD、`reorder`、子資源（選項、群組連結、加購） | `AdminGuard`                                           | 3   |
| `POST catalog/items/:catalogItemId/promote`（同理分類、客製群組）                                                 | `AdminGuard`                                           | 4   |
| `GET catalog/items/:catalogItemId/listings`（哪些門市上架）                                                       | `AdminGuard`                                           | 4   |
| `organizations/:organizationSlug/catalog/...` 新增獨家項目；`catalog-items/:catalogItemId` 等修改與刪除           | `@Roles({ menu })`＋`allow_local_menu_items`           | 4   |
| `GET organizations/:organizationSlug/catalog`：品牌＋本店獨家項目，附本店上架狀態（DataGrid）                     | `@Roles({ menu: ['read'] })`                           | 4   |
| `POST organizations/:organizationSlug/menu-items`（以 `catalogItemId` 上架，同時建立 offer）、批次刪除            | `@Roles({ menu: ['create'] / ['delete'] })`            | 4   |
| `PUT organizations/:organizationSlug/catalog-sections/:catalogSectionId/settings`（出單機、隱藏）                 | `@Roles({ menu: ['update'] })`                         | 4   |
| `PUT organizations/:organizationSlug/catalog-modifiers/:catalogModifierId/settings`、`/availability`              | `menu: ['update']`（加價另看開關）／`itemAvailability` | 4   |

新端點都要掛 `MenuEventsInterceptor`（`src/menus/interceptors/menu-events.interceptor.ts`）或等效的推播，見下一節。

### 其他讀到菜單的程式

| 位置                                                                                                                                                                                                                      | 現在                                                                         | PR 5 起                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PublicMenusService.findOrderMenu`（`menus-public.service.ts:125-295`）                                                                                                                                                   | 從 `menu` 往下讀整棵樹                                                       | 讀目錄樹，用本店的 `menu_section`、`menu_item`、`offer`、`modifier` 套用設定；只列上架、未停止供應、未隱藏的項目                                                          |
| `OrderPricingService.resolveOrderItems`（`src/orders/order-pricing.service.ts:120-`），建單、優惠券試算、共享購物車都經過它（`orders.service.ts:409`、`:534`，`coupons.service.ts:1383`，`shared-carts.service.ts:1134`） | 品項必須屬於本店菜單（`:205-215`）；`menuSectionIds` 由 `sectionAncestry` 算 | 品項 id 是本店上架列；內容、客製群組、分類祖先來自目錄；價格 `offer.price ?? suggested_price`；客製選項的供應狀態與加價來自覆寫列；`ResolvedOrderItem` 加 `catalogItemId` |
| `OrderTicketService.routeItems`（`src/orders/order-ticket.service.ts:563-640`）                                                                                                                                           | 品項 → 分類鏈的 `order_ticket_printer_id`                                    | 品項上架列 → 目錄分類鏈，每層查本店 `menu_section` 覆寫的出單機                                                                                                           |
| `MenuStockService.sync`（`src/inventory/menu-stock.service.ts:81-`）                                                                                                                                                      | `offer` 經 `menu_item → menu`；`modifier` 經 `modifier_group → menu`         | `offer` 不變；`modifier` 改用自己的 `menu_id`                                                                                                                             |
| `OrdersService.insufficientStockError`（`src/orders/orders.service.ts:328-342`）                                                                                                                                          | 讀 `menu_item.name`、`modifier.display_name`                                 | 讀目錄名稱                                                                                                                                                                |
| `PrepEstimateService`（`src/orders/prep-estimate.service.ts:92-96`、`:248-251`）                                                                                                                                          | 讀 `menu_item.name` 與 `offer.delivery_lead_time_minutes`                    | 名稱改讀目錄；準備時間仍在 `offer`                                                                                                                                        |
| `RecipesService`（`src/inventory/recipes.service.ts:503-540`、`:871-899`）、`bindMenuItemByRecipeName`（`src/inventory/recipe-menu-item-binding.ts:114-121`）                                                             | 驗證品項或選項屬於本店；以 `menu_item.name` 綁定                             | 名稱改讀目錄；選項食譜掛在本店的 `modifier` 覆寫列，沒有時建立                                                                                                            |
| `MenuItemSalesService`（`src/orders/menu-item-sales.service.ts:20-63`）                                                                                                                                                   | 以 `order_item.menu_item_id` 彙總                                            | 不變（本店上架列 id）；PR 8 另提供以 `catalog_item_id` 跨店彙總                                                                                                           |
| `SalesReportService`（`src/reports/sales-report.service.ts:186-195`、`:306-307`）                                                                                                                                         | `LEFT JOIN menu_item`、`menu_section` 取名稱與分類                           | PR 5 改 join 目錄；PR 8（#119）依 `catalog_item_id` 跨店彙總                                                                                                              |
| `CouponsService`（`src/coupons/coupons.service.ts:154-159`、`:380-381`、`:461-499`、`:1514-1608`）                                                                                                                        | 指定品項比對 `menuItemId`；名稱讀 `menu_item`、`menu_section`                | PR 5 名稱改讀目錄；PR 8 比對改用 `catalogItemId` 與目錄分類祖先，`:1547` 檢查的異動資源改為 `catalogItem`、`catalogSection`。因 id 沿用，既有優惠券的值不必轉換           |
| `src/db/seed/`                                                                                                                                                                                                            | 建立各店菜單                                                                 | PR 5 改建目錄與上架列；端對端種子（biru-admin#246）同步                                                                                                                   |

## 即時推播與自動售完

現在 `menuUpdated` 只送到單一門市的房間（`src/events/events.gateway.ts:189-192`），來源有兩個：`MenuEventsInterceptor` 在每個非 GET 請求後以 `request.organizationId` 呼叫 `MenuStockService.refresh(organizationId, true)`（`menu-events.interceptor.ts:18-30`），以及還原菜單資料後（`deleted-records.service.ts:574-577`）。

- 平台管理員的目錄端點沒有 `request.organizationId`，攔截器會直接略過。目錄寫入要改成：找出有上架受影響品項的門市（分類、客製群組的變更則找有上架其下任一品項的門市），逐一 `refresh(organizationId, true)`。
- 門市獨家端點與上架端點照舊由攔截器處理。
- 事件名稱與 payload 不變，前台不需要改。

自動售完（`menu-stock.service.ts:23-56` 的 `keepAutoSoldOut`、`soldOutChanges`）作用在 `offer` 與 `modifier` 的 `availability`／`auto_sold_out`，這兩張在新模型裡仍是門市層級，邏輯不變；只有選項的查詢從 `modifier_group.menu_id` 改成 `modifier.menu_id`。
食譜不變（#461 決定庫存模型不動），所以只有建立了覆寫列的選項會被自動售完，與「有食譜才會自動售完」的現況一致。

## PR 拆分

| PR  | 範圍                                                                                                                                                                                                        | 主要檔案                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 建六張目錄表（各掛 trigger）、門市表的新欄位與唯一鍵、`organization` 兩個開關、`order_item`／`shared_cart_item.catalog_item_id`、`audit_resource` 新值；註冊圖片 kind、異動資源、可還原表。不改任何讀寫行為 | `src/db/schema/`（新 `catalog.ts`、`menus.ts`、`organizations.ts`、`orders.ts`、`shared-carts.ts`、`audit.ts`、`index.ts`）、`drizzle/` 新 migration、`src/auth/index.ts`、`src/images/image-url.ts`、`images.service.ts`、`src/common/utils/audit-resources.ts`、`src/deleted-records/` |
| 2   | 搬移腳本與測試                                                                                                                                                                                              | `scripts/migrate-menu-catalog.ts`                                                                                                                                                                                                                                                        |
| 3   | 目錄管理 API（平台管理員）與單元測試；`RolesGuard` 四個新參數                                                                                                                                               | 新 `src/catalog/`、`src/menus/guards/roles.guard.ts`、`decorators/roles.decorator.ts`、`src/app.module.ts`                                                                                                                                                                               |
| 4   | 上架、下架、門市售價、售完、時段、出單機、分類與選項覆寫；門市獨家項目（依開關）；升級為品牌項目；平台管理員設定兩個開關                                                                                    | `src/catalog/`、`src/menus/menus.service.ts`、`src/organizations/`                                                                                                                                                                                                                       |
| 5   | 讀取切換（上表「其他讀到菜單的程式」全部）、舊內容端點停用、`modifierId` 參數改解析；新舊點餐菜單比對測試；跑全部既有測試                                                                                   | `src/menus/`、`src/orders/`、`src/inventory/`、`src/shared-carts/`、`src/coupons/`（只改名稱來源）、`src/reports/`、`src/deleted-records/`、`src/db/seed/`                                                                                                                               |
| 6   | biru-admin：商品目錄頁、上架管理頁（取代菜單編輯頁）、兩個開關；codegen                                                                                                                                     | biru-admin（同步 biru）                                                                                                                                                                                                                                                                  |
| 7   | biru：型別同步，確認點餐流程                                                                                                                                                                                | biru `types/api.ts`                                                                                                                                                                                                                                                                      |
| 8   | 優惠券改用目錄 id；跨門市銷售報表                                                                                                                                                                           | `src/coupons/`、`src/reports/`、`src/orders/menu-item-sales.service.ts`                                                                                                                                                                                                                  |
| 9   | **破壞性**：刪除舊欄位、三張舊表、舊端點、`addOnId`／`groupId` 參數；`offer` 改一對一；連結欄位改 not null；圖片舊前綴改為只供清理                                                                          | 同 PR 1、3、5 的檔案                                                                                                                                                                                                                                                                     |

PR 3、4 合併後先不發布 biru-admin 的新頁面；PR 2 的最後同步、PR 5、PR 6 依序在同一個時段上線，避免出現「目錄改了但點餐菜單還讀舊表」的空窗。

### 與其他 issue 的關係

| Issue | 內容     | 與本設計的接點                                                                              |
| ----- | -------- | ------------------------------------------------------------------------------------------- |
| #445  | 飲料標示 | 欄位加在 `catalog_item`；等 PR 5                                                            |
| #459  | 寄杯     | 方案指定 `catalog_item.id`，兌換時找本店上架列；等 PR 5                                     |
| #346  | 3D 模型  | 欄位與檔案掛在 `catalog_item`，若用圖片儲存要新增 kind；等 PR 5                             |
| #119  | 銷售報表 | 單店報表照常；跨店依 `catalog_item_id`（PR 8）                                              |
| #458  | 常點品項 | 先用 `order_item.menu_item_id`，PR 8 改 `catalog_item_id`；因 id 沿用，搬移過的品項兩者相同 |
| #441  | KDS      | 讀品項名稱與出單機；PR 5 一起切換並跑它的測試                                               |
| #442  | 報廢     | 依食譜展開，食譜仍掛門市上架列與選項覆寫列，不受影響；PR 5 跑它的測試                       |
| #443  | 進貨     | 只碰食材，不受影響                                                                          |
| #392  | 共享點餐 | `shared_cart_item` 在 PR 1 加 `catalog_item_id`，PR 5 經 `resolveOrderItems` 切換           |

## 需要開發者確認的問題

1. **搬移時目錄列沿用來源列的 id？**
   預設：是。
   理由：優惠券的 `menu_item_ids`、訂單快照、共享購物車、前台 localStorage 購物車、`/api/images/...` 的 id 段都不必轉換，切換前後點餐菜單回應可以逐字相同。代價是同一個 id 同時出現在 `catalog_item` 與 `menu_item`（不同表，不衝突）。
2. **`menu_section`、`menu_item`、`modifier` 保留表名，原地變成門市層級表，PR 9 也不改名？**
   預設：不改名。
   理由：`audit_resource` 的值、`deleted_record.table_name` 的歷史、`RESTORE_PERMISSIONS`、圖片 kind 都以這些名稱為鍵；改名要同時處理歷史資料，收益只有名稱較貼切。
3. **`offer` 保留為上架列的價格與庫存列，PR 9 只加 `unique(menu_item_id)` 改成一對一並刪 `menu_section_id`，不併入 `menu_item`？**
   預設：保留。
   理由：`order.held_offer_stock` 以 `offer.id` 為鍵（`orders.ts:124`），併表要在同一次部署重寫進行中訂單的 jsonb 並改 `inventory-transactions.service.ts:577-697`，風險高、對外沒有差別。
4. **品牌品項的門市售價要不要「跟隨品牌」？**
   預設：PR 2 把 `offer.price` 複製成 `suggested_price` 但保留 `offer.price`（PR 5 前舊程式需要它）；PR 5 上線後由腳本的另一個步驟，把品牌品項中等於建議售價的 `offer.price` 清成 null，`modifier.price_adjustment` 同理。
   理由：不清的話，之後品牌調整建議售價不會影響任何門市，等於每間店都自訂了售價。
5. **搬移後要不要替現有門市打開 `allow_local_menu_items`／`allow_local_pricing`？**
   預設：不打開，維持 #461 的預設關閉。
   理由：資料是測試資料，平台管理員可以逐店打開；代價是兩間以上門市時，搬成獨家的項目在打開前只有平台管理員能改。
6. **客製選項的 `available_modes` 放在門市覆寫列？**
   預設：是，沒有覆寫列時所有模式可選。
   理由：#461 把品項的 `availableModes` 放在門市，選項跟著放才一致；若要品牌統一（例如外帶不給某個選項），改放 `catalog_modifier` 並讓覆寫列可為 null。
7. **`owner_organization_id` 只放在分類、品項、客製群組三個根，子表（選項、群組連結、加購）從父列繼承？**
   預設：是。
   理由：#461 寫「以上每一張都有」，但子表再存一份可能與父列不一致，而每個子表的擁有者都能從父列唯一決定；`RolesGuard` 與 `organizationIdOf` 多一次查詢即可。
8. **品牌品項能否加購門市獨家品項、或連到門市獨家的客製群組？**
   預設：不行。
   理由：品牌項目的內容由品牌決定（#461 提案假設）；門市要有自己的加購，就做成獨家品項。
9. **升級為品牌項目時，它的分類或客製群組仍是獨家的怎麼辦？**
   預設：拒絕，並列出要先升級的分類與群組，不自動連帶升級。
   理由：連帶升級會讓一次操作改到其他品項也在用的群組，結果難以預期。
10. **目錄表的刪除還原權限？**
    預設：只有平台管理員（不列入 `RESTORE_PERMISSIONS`）。
    理由：`RESTORE_PERMISSIONS` 只能表達角色權限（`deleted-records.service.ts:124-133`），表達不了 `allow_local_menu_items`；門市成員還原上架列、分類設定與選項覆寫仍照舊。
11. **PR 5 之後，舊的內容寫入端點怎麼處理？**
    預設：PR 5 起回錯誤（新的錯誤碼，例如 `menuMovedToCatalog`），PR 9 再刪除；PR 5 與 PR 6 同時上線。
    理由：繼續接受寫入會改到已經沒人讀的舊欄位，使用者以為改成功了。
12. **圖片 kind 用新名稱 `catalogSection`／`catalogItem`／`catalogModifier`，舊物件留在原前綴，PR 9 起孤兒清理另外列出舊前綴？**
    預設：是。
    替代方案是目錄沿用 `menuSection`／`menuItem`／`modifier` 這三個 kind 名稱，PR 5 時把 `IMAGE_TABLES` 指到目錄表；網址可完全不變，但 PR 1 到 PR 5 之間同一個 kind 要對到兩張表，`ImagesService.find`（`images.service.ts:32-62`）與 `satisfies Record<ImageKind, …>` 都得改寫。
13. **品牌目錄的異動紀錄放在平台層級（`organization_id` 為 null），門市在異動紀錄看不到品牌改了自己上架的品項？**
    預設：可以接受。
    理由：品牌內容不屬於任何門市；若要門市看得到，得把一筆紀錄複製到每間有上架的門市。
14. **品牌改動推播 `menuUpdated` 的對象？**
    預設：有上架受影響品項的門市；分類與客製群組的變更推給有上架其下任一品項的門市。
    理由：推給所有門市最簡單，但門市數增加後每次改字都會讓所有前台重新抓菜單。
15. **門市層級表以 `menu_id` 識別門市，不加 issue 寫的 `organization_id`？**
    預設：用 `menu_id`。
    理由：`menu.organization_id` 已唯一，兩者等價，`menu_section`、`menu_item` 本來就有 `menu_id`。
16. **門市售價關閉時，門市還能不能設定促銷價（`price_specification`）？**
    預設：不能，促銷價也是售價。
    理由：開關的目的是讓加盟店統一售價。
17. **「下架」沿用 `offer.availability = 'Discontinued'`，不新增 `listed` 欄位？**
    預設：是。
    理由：點餐菜單本來就隱藏 `Discontinued`，舊程式在 PR 5 前看到的狀態一致；但這表示有 `itemAvailability` 權限的 member 現在就能下架（`src/auth/permissions.ts:100-101` 的 member 有 `itemAvailability: ['update']`），若下架應只限 `menu` 權限，就要另加欄位。
18. **加購的快照（`OrderItemAddOnSnapshot`、`SharedCartItemAddOn`）也加選填的 `catalogItemId`？**
    預設：是。
    理由：熱銷數量把加購也算進去（`menu-item-sales.service.ts:33-41`），跨店彙總少了它就不完整。

## 我做的假設

- 全平台只有一個品牌，目錄全平台一份（#461 提案假設）。
- 資料庫裡的菜單都是測試資料；我沒有連線資料庫，不知道目前有幾間門市有菜單，PR 2 的 dry-run 會列出來。
- 每間門市恰好一份 `menu`，由建立門市的 hook 寫入（`menus.ts:74`、`src/auth/index.ts:342-357`），PR 1 到 PR 9 都不改這件事。
- `offer` 與 `menu_item` 實際上一對一（只讀最早的一筆）；PR 2 只把每個品項最早的 offer 視為有效，其餘不搬也不刪，PR 9 加唯一鍵前要先清掉。
- `offer.menu_section_id` 沒有任何寫入路徑，視為廢棄欄位。
- 分類的順序與上下層由品牌決定，門市只能隱藏；品項的排序同樣由品牌決定，所以 `menu_item.sort_order` 在 PR 9 刪除。
- 準備時間（`delivery_lead_time_minutes`）、供應時段、剩餘數量、點餐模式、出單機都是門市層級。
- 食譜、食材與庫存模型不動，食譜仍掛在門市的上架列與選項覆寫列上。
- `src/ecpay/` 與 `src/auth/permissions.ts` 都不需要修改；ECPay 只讀訂單快照。
