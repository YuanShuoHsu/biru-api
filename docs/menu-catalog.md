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
   搬移過的資料兩者相同；「點餐菜單回應」一節逐欄列出切換後每個值的來源，切換當下的回應與切換前相同，可以直接做新舊比對測試。

## 現況盤點

### 菜單資料表（`src/db/schema/menus.ts`）

每間門市只有一份菜單：`menu` 以 `organization_id` 唯一（`menus.ts:74`），由 better-auth 的 `afterCreateOrganization` 在建立門市時寫入（`src/auth/index.ts:342-357`）。
下表的「歸屬」是本設計對每個欄位的判定：**品牌**＝搬到目錄，**門市**＝留在門市層級，**結構**＝由目錄的關聯取代。

| 表（定義位置）                                   | 欄位                                                                                                                                                                                                                                                     | 歸屬                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `menu`（`menus.ts:60-76`）                       | `organization_id`、`name`、`description`、`image`                                                                                                                                                                                                        | 門市（整份菜單的外殼）     |
| `menu_section`（`menus.ts:81-110`）              | `name`（not null，`:92`）、`description`、`image`、`sort_order`、`parent_section_id`                                                                                                                                                                     | 品牌                       |
|                                                  | `menu_id`、`order_ticket_printer_id`（`menus.ts:96-99`，null 沿用上層）                                                                                                                                                                                  | 門市                       |
| `menu_item`（`menus.ts:131-187`）                | `name`（not null，`:141`）、`description`、`image`、`suitable_for_diet`、`serving_temperatures`、`recommended_serving_temperature_level`、`sweetness`、`fixed_sweetness_level`、`recommended_sweetness_level`、`nutrition`、`sort_order`、兩個甜度 check | 品牌                       |
|                                                  | `menu_section_id`（`on delete cascade`，`:138-140`）                                                                                                                                                                                                     | 結構（改由目錄品項的分類） |
|                                                  | `menu_id`、`available_modes`、`order_ticket_printer_id`                                                                                                                                                                                                  | 門市                       |
| `offer`（`menus.ts:205-231`）                    | `price`、`availability`、`auto_sold_out`、`available_hours`、`delivery_lead_time_minutes`、`inventory_level`、`price_specification`                                                                                                                      | 門市                       |
|                                                  | `menu_section_id`（`on delete cascade`，`:212-214`）：三個寫入點都只帶 `menuItemId`（`menus.service.ts:610`、`:995`、`:1050`），`CreateOfferDto` 沒有這個欄位，實際上永遠是 null                                                                         | 結構（廢棄）               |
| `menu_item_add_on`（`menus.ts:236-258`）         | `menu_item_id`、`add_on_menu_item_id`、`add_on_menu_section_id`（cascade，`:246-249`）、`sort_order`                                                                                                                                                     | 品牌                       |
| `modifier_group`（`menus.ts:263-277`）           | `display_name`、`min_selection_count`、`max_selection_count`、`sort_order`；`menu_id`                                                                                                                                                                    | 品牌                       |
| `modifier`（`menus.ts:282-302`）                 | `display_name`（not null）、`image`、`sort_order`；`modifier_group_id`（not null，`:286-289`）                                                                                                                                                           | 品牌                       |
|                                                  | `price_adjustment`（建議值歸品牌，覆寫歸門市）、`availability`、`auto_sold_out`、`available_modes`                                                                                                                                                       | 門市                       |
| `menu_item_modifier_group`（`menus.ts:307-330`） | `menu_item_id`、`modifier_group_id`、`sort_order`，唯一 `(menu_item_id, modifier_group_id)`                                                                                                                                                              | 品牌                       |

`offer` 與 `menu_item` 是一對多，但所有讀取都只取 `created_at` 最早的一筆（`src/menus/menus.service.ts:640-659`、`:686`、`src/orders/order-pricing.service.ts:172-175`、`src/menus/menus-public.service.ts:50-54`），實際上是一對一。

### 參照菜單的其他資料

| 位置                                                                                               | 參照                                                                                                            | 是否有外鍵               |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `order_item.menu_item_id`（`src/db/schema/orders.ts:182`）                                         | 下單當時的 `menu_item.id`；名稱、價格、客製另存快照                                                             | 無                       |
| `order_item.modifiers`／`add_ons` 快照（`orders.ts:75-91`）                                        | `modifierGroupId`、`modifierId`（`order-pricing.service.ts:363` 寫入 `modifier.id`）、加購的 `menuItemId`       | 無（jsonb）              |
| `order.held_offer_stock`（`orders.ts:124`）                                                        | 以 `offer.id` 為鍵的保留數量，`src/inventory/inventory-transactions.service.ts:577-697` 讀寫                    | 無（jsonb）              |
| `shared_cart_item.menu_item_id`、`modifiers`、`add_ons`（`src/db/schema/shared-carts.ts:136-160`） | 與下單相同的 id                                                                                                 | 無                       |
| `coupon.menu_item_ids`／`menu_section_ids`（`src/db/schema/coupons.ts:64-65`）                     | 指定品項與分類，比對在 `src/coupons/coupons.service.ts:154-159`；指定品項的優惠券只能適用一間門市（`:262-263`） | 無（text[]）             |
| `recipe.menu_item_id`／`modifier_id`（`src/db/schema/inventory.ts:148-153`）                       | 門市食譜，各自全域唯一（`inventory.ts:169-170`）                                                                | 有，`on delete set null` |
| `menu_section`／`menu_item.order_ticket_printer_id`                                                | `printer`（`src/db/schema/printers.ts:37`）                                                                     | 有，`on delete set null` |

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
服務層規則：獨家分類的上層只能是品牌分類或同一門市的獨家分類；還有品項或子分類的分類不能刪除。

**`catalog_item`**

| 欄位                              | 型別                                                   | 可空 | 說明                                                               |
| --------------------------------- | ------------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| `id`                              | text PK                                                | 否   | 搬移時等於來源 `menu_item.id`                                      |
| `owner_organization_id`           | text → `organization`                                  | 是   | `on delete cascade`                                                |
| `catalog_section_id`              | text → `catalog_section`                               | 是   | `on delete cascade`，比照 `menus.ts:138-140`                       |
| `name`、`description`、`image`    | 同 `menu_item`                                         |      |                                                                    |
| `suitable_for_diet` … `nutrition` | 同 `menu_item`（`menus.ts:144-165`），含兩個甜度 check |      | `available_modes` 不搬，留在門市                                   |
| `suggested_price`                 | numeric(10,2)                                          | 是   | 建議售價；門市沒有自訂售價時使用                                   |
| `price_specification`             | jsonb `PriceSpecification`（`menus.ts:197-202`）       | 是   | 品牌促銷價；只套用在跟隨品牌售價的門市（見「門市層級」的門市售價） |
| `discontinued`                    | boolean default false                                  | 否   | 品牌「停止供應」，所有門市一起下架                                 |
| `sort_order`                      | integer default 0                                      | 否   |                                                                    |

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

| 表             | PR 1 新增欄位（先可為空）                                                                                      | 唯一鍵（PR 1 建立）                | 外鍵 on delete                      | PR 5c 放寬為可空                    | PR 9 移除的欄位                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `menu_section` | `catalog_section_id`、`hidden boolean default false`                                                           | `(menu_id, catalog_section_id)`    | `catalog_section_id` **no action**  | `name`                              | `parent_section_id`、`name`、`description`、`image`、`sort_order`；`catalog_section_id` 改 not null              |
| `menu_item`    | `catalog_item_id`                                                                                              | `(menu_id, catalog_item_id)`       | `catalog_item_id` **no action**     | `name`                              | `menu_section_id`、`name` 到 `nutrition` 的內容欄位、`sort_order`、兩個甜度 check；`catalog_item_id` 改 not null |
| `offer`        | 無                                                                                                             | PR 9：`(menu_item_id)`，改成一對一 | 不變                                |                                     | `menu_section_id`；`menu_item_id` 改 not null                                                                    |
| `modifier`     | `menu_id`（→ `menu`，cascade）、`catalog_modifier_id`                                                          | `(menu_id, catalog_modifier_id)`   | `catalog_modifier_id` **no action** | `modifier_group_id`、`display_name` | `modifier_group_id`、`display_name`、`image`、`sort_order`；`menu_id`、`catalog_modifier_id` 改 not null         |
| `organization` | `allow_local_menu_items`、`allow_local_pricing`，boolean not null default false（純 Drizzle 欄位，見「權限」） |                                    |                                     |                                     |                                                                                                                  |

不再使用、於 PR 9 刪除的表：`menu_item_add_on`、`modifier_group`、`menu_item_modifier_group`。
`menu` 保留，仍是門市菜單的外殼（點餐菜單最上層的 `name`、`image` 來自它）。

說明：

- 門市以 `menu_id` 識別，不另加 `organization_id`：`menu.organization_id` 已唯一（`menus.ts:74`），`(menu_id, catalog_item_id)` 與 issue 寫的 `(organization_id, catalog_item_id)` 等價（見問題 15）。
- 三個指向目錄的外鍵都用 no action：目錄刪除時一律由服務先處理門市列（拒絕或在同一交易內刪除，見「目錄刪除時的門市列」），不靠 cascade 默默刪掉門市的上架列與它們的食譜綁定。no action 在敘述結束才檢查，所以刪除門市時 `organization → menu → menu_item` 與 `organization → catalog_item` 兩條 cascade 並存也不會因順序失敗。
- **新的門市列要到 PR 5c 才會出現**：`menu_section.name`、`menu_item.name`、`modifier.modifier_group_id`、`modifier.display_name` 在 PR 9 前仍是 not null，而且 PR 5a 以前的點餐菜單會直接以 `menu_id` 讀到任何新寫入的 `menu_item`。所以上架新品項、建立選項覆寫、建立分類設定的端點放在 PR 5c，同一個 PR 的 migration 先放寬這四欄；新寫入的門市列這幾欄留 null，不複製內容。
- **上架**＝有 `menu_item` 列且它的 `offer.availability` 不是 `Discontinued`。**下架**＝把 `availability` 設成 `Discontinued`，上架列、售價、出單機、食譜都保留，重新上架就是改回 `InStock`，id 不變（點餐菜單本來就據此隱藏，`menus-public.service.ts:50-54`、`:233`）。**移除上架列**是另一個動作，會讓該列的食譜失去綁定（`recipe.menu_item_id` set null，`inventory.ts:148-150`），重新上架會得到新的 id；介面上只在需要清理時提供（見問題 17）。
- **下架權限**：設成 `Discontinued` 或從 `Discontinued` 改回，需要 `menu: ['update']`；只有 `itemAvailability` 的角色（`member`，`src/auth/permissions.ts:94-101`）只能在 `InStock` 與 `SoldOut` 之間切換，品項或選項已下架時不能改。兩個供應狀態端點與 PR 5c 的選項 `/availability` 都在服務檢查，不加欄位、不改 `permissions.ts`（見問題 17）。
- **門市售價**＝`offer.price`，null 代表跟隨品牌，用 `catalog_item.suggested_price`。促銷價與售價來自同一個來源：
  1. 門市自己的促銷價 `offer.price_specification` 在期間內就用它；
  2. 否則 `offer.price` 有值就用它，品牌促銷不套用（避免品牌促銷價高於門市自訂的原價）；
  3. `offer.price` 為 null 時，品牌促銷價 `catalog_item.price_specification` 在期間內就用它，否則用 `suggested_price`。

  也就是 `activePromoPrice(offer.price_specification) ?? offer.price ?? activePromoPrice(catalog_item.price_specification) ?? suggested_price`，期間判斷沿用 `activePromoPrice`（`order-pricing.service.ts:71-`）。
  門市的 `offer.price` 與 `offer.price_specification` 寫入都受 `allow_local_pricing` 管制；關閉的門市不能自訂促銷價，但會自動套用品牌促銷，不需要另外的開關（見問題 16）。

- **客製選項覆寫**：`modifier` 列是可有可無的覆寫，沒有覆寫列時視為供應中、不售完、加價等於目錄建議值、所有點餐模式可選。覆寫列在門市第一次設定、或為該選項建立食譜時建立（食譜必須掛在門市的列上，因為 `recipe_modifierId_uidx` 是全域唯一，`inventory.ts:170`）；訂單快照記的是目錄 id，扣料時的對應見「食譜與扣料」。
- **分類設定**：`menu_section` 同樣可有可無，只存出單機與 `hidden`；PR 9 以前不刪除這種列（見「舊外鍵在過渡期的連鎖刪除」）。
- 訂單與購物車：`order_item`、`shared_cart_item` 各加 `catalog_item_id text`（可空、無外鍵，比照 `menu_item_id` 沒有外鍵，歷史訂單必須在品項刪除後留存）。`OrderItemAddOnSnapshot`、`SharedCartItemAddOn` 加選填的 `catalogItemId`，舊快照沒有這個欄位。

### 目錄刪除時的門市列

| 刪除的目錄列             | 規則                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog_item`           | 還有門市上架中（`availability` 不是 `Discontinued`）就拒絕並列出門市；PR 5a 以前只要有任何上架列就拒絕。PR 5a 起才在同一交易內刪除已下架的上架列與 offer，再刪目錄品項，這些上架列的食譜會失去綁定（見問題 19） |
| `catalog_modifier`       | PR 5a 以前只要有任何覆寫列就拒絕（這些列還是舊點餐菜單與計價讀的選項，`order-pricing.service.ts:165-170`）；PR 5a 起有覆寫列掛著食譜才拒絕並列出門市，否則先刪覆寫列再刪目錄選項                                |
| `catalog_section`        | 還有品項或子分類就拒絕；PR 5c 以前有門市的分類設定列也拒絕，PR 5c 起先刪設定列                                                                                                                                  |
| `catalog_modifier_group` | 底下選項依 `catalog_modifier` 的規則逐一檢查                                                                                                                                                                    |

### 舊外鍵在過渡期的連鎖刪除

PR 9 以前舊的分類外鍵都還在，而且都是 cascade：`menu_item.menu_section_id`（`menus.ts:138-140`）、`offer.menu_section_id`（`:212-214`）、`menu_item_add_on.add_on_menu_section_id`（`:246-249`）、`menu_section.parent_section_id`（`:88-91`）。
刪一筆 `menu_section` 會連帶刪掉門市的上架列與 offer、讓它們的食譜失去綁定，而且這些刪除不經過目錄外鍵的 no action 檢查。
處理方式：

- PR 5c 以前，新程式不刪除任何 `menu_section`（分類設定端點本來就在 PR 5c）；舊的分類刪除端點在 PR 5a 停用。
- PR 5c 的 migration 把 `menu_item.menu_section_id`、`offer.menu_section_id`、`menu_section.parent_section_id` 全部設為 null。此後刪除分類設定列只會連帶刪掉舊的 `menu_item_add_on` 列，PR 5a 起已沒有程式讀它。

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
- `organizationIdOf`（`:258-283`）目前只認 `organization_id`、`seller_id` 與沿 `menu_id` 往上找；要加入 `owner_organization_id`，以及 `catalog_item_id`、`catalog_modifier_group_id` 往上找擁有者。不加的話門市獨家品項的刪除紀錄會被當成平台層級，平台列表顯示不出所屬門市，還原時的異動紀錄也記不到門市。門市成員依問題 10 不能還原目錄列，而門市範圍的列表只列出該角色能還原的批次（`deleted-records.service.ts` 的 `list`），所以門市看不到這些紀錄，要還原請平台管理員處理。

## 既有資料搬移（PR 2）

`scripts/migrate-menu-catalog.ts`，用法比照 `scripts/migrate-images-to-storage.ts`：預設 dry-run 只印出計畫與數量，`--apply` 才寫入，整個門市在一個交易內完成。

### 對應規則

先數有菜單內容（至少一個分類或品項）的門市：

- **只有一間**：它的分類、品項、客製群組全部成為品牌項目（`owner_organization_id = null`），`suggested_price` 取該品項的 `offer.price`，`catalog_item.price_specification` 取 `offer.price_specification`，`catalog_modifier.price_adjustment` 取 `modifier.price_adjustment`。
- **兩間以上**：每間門市的內容各自成為該門市的獨家項目（`owner_organization_id = 該門市`），之後由平台管理員決定哪些升級為品牌項目。

歸屬逐店決定，決定後重跑不變：

- 門市已有搬過的根列（`catalog_section`、`catalog_item`、`catalog_modifier_group` 中 id 對得到該門市來源列的）時沿用它：只要有一列帶 `owner_organization_id` 就是獨家，全部為 null 就是品牌。
- 門市還沒搬過時，只有它是唯一有菜單內容的門市、而且目錄裡沒有其他門市搬過、來源列仍在的根列，才成為品牌項目；否則成為該門市的獨家項目。
- 所以第一次只有一間、之後第二間建了菜單再重跑時，第一間的新舊列都維持品牌，第二間成為獨家；第一次就是兩間以上時，之後即使只剩一間有內容也維持獨家。
- 覆寫已搬過的列時不改 `owner_organization_id`。

逐表對應（id 一律沿用來源列，`created_at`、`updated_at` 一律照抄來源列）：

| 來源                       | 目錄                          | 門市端連結                                                               |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `menu_section`             | `catalog_section`             | `menu_section.catalog_section_id = id`                                   |
| `menu_item`                | `catalog_item`                | `menu_item.catalog_item_id = id`                                         |
| `modifier_group`           | `catalog_modifier_group`      | 無（群組沒有門市層級）                                                   |
| `modifier`                 | `catalog_modifier`            | `modifier.catalog_modifier_id = id`、`modifier.menu_id = 群組的 menu_id` |
| `menu_item_modifier_group` | `catalog_item_modifier_group` | 無                                                                       |
| `menu_item_add_on`         | `catalog_item_add_on`         | 無                                                                       |

門市端連結以 SQL 直接寫入並保留原本的 `updated_at`（Drizzle 的 `timestamps` 有 `$onUpdate`，`columns.helpers.ts:7-10`，透過 query builder 更新會改掉它，點餐菜單的 `updatedAt` 就會變）。
之後回填 `order_item.catalog_item_id` 與 `shared_cart_item.catalog_item_id`：取 `menu_item.catalog_item_id`，品項已刪除的保留 null。

### 可重跑

- 以 id 判斷是否已搬：目錄列不存在就新增；存在時只在來源列的 `updated_at` 比目錄列新時以舊表內容覆寫，目錄列較新就略過並列在輸出中。
  PR 5a 部署前，舊表仍是點餐菜單的來源，所以 PR 5a 上線前要再跑一次 `--apply` 作為最後同步；PR 5a 起舊的內容寫入端點停用，之後重跑都是無變更。
- 這個比較分辨不出「目錄與舊表在兩次同步之間都被改過」；PR 3、4 的目錄 API 在 PR 5a 以前沒有介面使用（biru-admin 的新頁面在 PR 6），不支援在那之前直接呼叫它修改搬移過的列。
- 門市端連結只在欄位為 null 時寫入，不覆蓋已經指向別處的連結。
- dry-run 另外列出：目錄中有、但來源列已不存在的 id（舊端點在兩次執行之間刪掉的）、每個品項 offer 超過一筆的、`offer.menu_section_id` 不是 null 的，以及兩間以上門市時每間門市的筆數，方便開發者確認走哪條規則。
- PR 5c 的 migration 放寬了 `menu_item.name`，腳本以 `information_schema.columns` 查到它可為空時拒絕執行：此後可能有新寫入的門市列內容欄位是 null，舊表不再是可靠的來源。

### 圖片

`image` 欄位原樣複製，不重新上傳、不改值。
S3 的物件鍵是 `<kind>/<imageVersion>.<ext>`（`src/images/image-storage.service.ts:66`），欄位存完整網址，複製後指向同一個物件。
資料庫內的 data URL 版本是內容的雜湊（`src/images/image-url.ts:50-51`），複製後不變；網址是 `/api/images/<kind>/<id>/<version>.<ext>`（`image-url.ts:53-58`），因為 id 沿用，只有 `kind` 從 `menuItem` 變成 `catalogItem`（見「點餐菜單回應」的 `imageUrl`）。

## 點餐菜單回應

`GET organizations/:organizationId/order-menu` 的形狀（`src/menus/dto/order-menu-response.dto.ts`）不變，PR 5a 起每個欄位的來源如下。
「較新者」指兩列 `updated_at` 取較晚的一個；搬移時目錄列照抄來源列的時間，門市列的 `updated_at` 不被搬移改動，所以切換當下兩者相同，回應值與切換前一致。

| 層級（DTO 行號）       | 欄位                                                            | 來源                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 菜單（`:359-383`）     | 全部                                                            | 本店 `menu`，不變                                                                                                                         |
| 分類（`:327-357`）     | `id`、`parentSectionId`、`name`、`description`、`sortOrder`     | `catalog_section`                                                                                                                         |
|                        | `menuId`（`:332`）                                              | 本店 `menu.id`                                                                                                                            |
|                        | `createdAt`／`updatedAt`                                        | `catalog_section.created_at`／`catalog_section` 與本店分類設定列的較新者                                                                  |
| 品項（`:230-325`）     | `id`、`menuId`（`:235`）、`availableModes`、`sold`              | 本店上架列 `menu_item`                                                                                                                    |
|                        | `menuSectionId`（`:238`）                                       | `catalog_item.catalog_section_id`                                                                                                         |
|                        | 其餘內容欄位                                                    | `catalog_item`                                                                                                                            |
|                        | `createdAt`／`updatedAt`                                        | 上架列的 `created_at`／上架列與 `catalog_item` 的較新者                                                                                   |
| offer（`:27-66`）      | 全部（含 `createdAt`、`updatedAt`，`:60-65`）                   | 本店 `offer`，不變；`price` 為 null 時改填 `suggested_price`，此時 `priceSpecification` 為 null 就改填 `catalog_item.price_specification` |
|                        | `menuSectionId`（`:35`）                                        | 現在永遠是 null（見現況盤點），PR 9 刪欄後固定回 null，DTO 不改                                                                           |
| 加購（`:201-228`）     | `id`、`sortOrder`、`addOnMenuSectionId`、時間                   | `catalog_item_add_on`                                                                                                                     |
|                        | `menuItemId`、`addOnMenuItemId`                                 | 對應目錄品項在本店的上架列 id；本店沒上架時該加購不出現                                                                                   |
| 客製群組（`:111-135`） | 全部                                                            | `catalog_modifier_group`，`sortOrder` 取 `catalog_item_modifier_group`                                                                    |
| 客製選項（`:68-109`）  | `id`、`modifierGroupId`、`displayName`、`imageUrl`、`sortOrder` | `catalog_modifier`                                                                                                                        |
|                        | `availability`、`availableModes`、`priceAdjustment`             | 本店覆寫列；沒有覆寫列或欄位為 null 時用目錄預設（見「門市層級」）                                                                        |
|                        | `createdAt`／`updatedAt`（`:104-108`）                          | `catalog_modifier.created_at`／`catalog_modifier` 與覆寫列的較新者                                                                        |

唯一會變的值是以 data URL 存放的圖片的 `imageUrl`：路徑的 kind 段改成目錄的 kind（id 與版本不變）。
存在 S3 的圖片網址完全不變。
新舊比對測試要排除前者，或在建資料時用 `https://` 圖片。

## 圖片儲存的對應

`IMAGE_KINDS`（`src/images/image-url.ts:8-15`）與 `IMAGE_TABLES`（`src/images/images.service.ts:19-26`）在 **PR 1** 加入 `catalogSection`、`catalogItem`、`catalogModifier`，對到三張有 `image` 的目錄表。
一定要在 PR 2 搬圖片之前完成：孤兒清理把 `IMAGE_TABLES` 每張表的 `image`、這些表在 `deleted_record` 的 `image`、以及近 7 天異動紀錄的 `image.before` 都算成參照（`src/images/image-orphans.service.ts:77-113`）。

這套機制在過渡期正好安全：

- 參照是以物件鍵（網址最後兩段，`image-orphans.service.ts:17-18`）收成一個全域集合，不分 kind；所以 `catalog_item.image` 指向 `menuItem/xxx.png` 時，即使舊的 `menu_item` 列被刪、圖片被換，物件仍被目錄參照。
- 異動紀錄的參照以 `audit_log.resource` 是否屬於 `IMAGE_KINDS` 判斷（`image-orphans.service.ts:105`），所以目錄的異動資源名稱必須和圖片 kind 同名（`catalogSection`、`catalogItem`、`catalogModifier`），每個會寫入目錄 `image` 的端點（新增、修改，平台管理員與門市獨家兩組都算）都要掛對應資源的 `@Audit`，而且 `image` 不能列進 `AUDIT_IGNORED_COLUMNS`。
- 新上傳的目錄圖片用新的 kind 當前綴；搬過來的舊物件留在 `menuItem/`、`menuSection/`、`modifier/` 前綴，不搬動。

PR 9 刪掉 `menu_section`、`menu_item`、`modifier` 的 `image` 後，這三個 kind 就沒有對應的表，要從 `IMAGE_TABLES` 拿掉；但孤兒清理仍要列出這三個前綴，否則前綴下不再被參照的物件永遠不會被清掉。
做法是在 `image-orphans.service.ts` 另列一組只供清理的舊前綴（見問題 12）。
`menu` 的圖片不動。

`withImageRefs`／`imageRefQuery` 是以傳入的表計算（`image-url.ts:91-126`），新的目錄查詢照樣使用，點餐菜單仍不把圖片讀出 Postgres。

## 權限與 `RolesGuard`

權限依 #461：品牌項目只有平台管理員；門市的上架、售完、時段、出單機沿用 `menu`、`itemAvailability`（下架與重新上架另需 `menu: ['update']`，見「門市層級」的下架權限）；獨家項目與門市售價看門市的兩個開關。不改 `src/auth/permissions.ts`。

兩個開關是 `organization` 上的純 Drizzle 欄位，**不**登記為 better-auth 的 `additionalFields`，`src/auth/index.ts` 不動。
已確認安裝的 better-auth 1.7.17 不會讓店家經由 `organization.update` 寫入它們：請求本文的 `data` 以 zod 的 `z.object` 由內建欄位加上已登記的 `additionalFields` 組成（`node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs:160-180`），zod 4.6.7 的 `z.object` 會丟掉未宣告的鍵，adapter 只寫入驗證後的 `ctx.body.data`（`plugins/organization/adapter.mjs:354-365`）。
開關只由平台管理員端點寫入，比照 `OrganizationClosureController`（`src/organizations/organization-closure.controller.ts:11-35`，`AdminGuard`＋`@Audit('organization')`），讀取放在本專案自己的門市回應 DTO。

`RolesGuard.resolveOrganizationId`（`src/menus/guards/roles.guard.ts:132-284`）與 `OrganizationParam`（`src/menus/decorators/roles.decorator.ts:7-19`）的變更：

| 參數                                | 變更                                                                                                                                                 | PR  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `catalogSectionId`                  | 新增：回傳 `catalog_section.owner_organization_id`                                                                                                   | 3   |
| `catalogItemId`                     | 新增：回傳 `catalog_item.owner_organization_id`                                                                                                      | 3   |
| `catalogModifierGroupId`            | 新增：回傳 `catalog_modifier_group.owner_organization_id`                                                                                            | 3   |
| `catalogModifierId`                 | 新增：沿 `catalog_modifier_group` 取 `owner_organization_id`                                                                                         | 3   |
| `modifierId`                        | 改用 `modifier.menu_id → menu.organization_id`（現在沿 `modifier_group.menu`，`roles.guard.ts:241-254`；PR 5c 起的新覆寫列沒有 `modifier_group_id`） | 5b  |
| `offerId`                           | 只保留 `offer.menu_item → menu` 一條路徑（`roles.guard.ts:178-205` 另外兩條經過 `menu_section_id`）                                                  | 9   |
| `groupId`                           | 對應端點在 PR 9 移除後一併刪掉（`roles.guard.ts:231-239`）                                                                                           | 9   |
| `addOnId`                           | 現在已沒有任何 `@Roles` 使用（加購端點都以 `menuItemId` 守衛，`menus.controller.ts:441-503`），PR 9 一併刪掉（`roles.guard.ts:207-229`）             | 9   |
| `menuId`、`sectionId`、`menuItemId` | 不變；`menu_section`、`menu_item` 保留 `menu_id`                                                                                                     | —   |

品牌項目的擁有者是 null，四個新參數會解析成 undefined，`RolesGuard` 回 403（`roles.guard.ts:93`），連平台管理員也一樣，因為角色是在找到門市之後才換成 owner（`:110-121`）。
因此同一份服務有兩組入口：

- `AdminCatalogController`（`@UseGuards(AdminGuard)`，比照 `src/coupons/admin-coupons.controller.ts:32-33`）：品牌項目的新增、修改、刪除，任何目錄項目的修改，以及「升級為品牌項目」。
- 門市獨家入口：`@Roles({ menu: [...] }, 'catalogItemId')` 等；服務再檢查該門市的 `allow_local_menu_items`，關閉時只有平台管理員可用（`request.memberRole` 為 owner 且 `session.user.role === 'admin'`）。新增獨家項目用 `organizations/:organizationSlug/...`，由 slug 決定擁有者。

門市售價（`offer.price`、`offer.price_specification`、`modifier.price_adjustment`）的寫入在服務檢查 `allow_local_pricing`，規則相同。
`catalog_item.price_specification` 的寫入權限與 `suggested_price` 相同，沿用 `PriceSpecificationDto`（`src/menus/dto/create-offer.dto.ts:59-`）的驗證。

## 異動紀錄

`audit_resource` 是 pgEnum（`src/db/schema/audit.ts:15-40`），PR 1 以 `ALTER TYPE … ADD VALUE` 加入 `catalogSection`、`catalogItem`、`catalogModifierGroup`、`catalogModifier`、`catalogItemModifierGroup`、`catalogItemAddOn`。
`src/common/utils/audit-resources.ts` 的變更：

- `AUDIT_TABLES`（`:62-87`）加入六張目錄表。
- `FK_LABEL_SOURCES`（`:123-195`）：目錄表的父欄位比照現有的 `menuSection`、`menuItem` 等設定；`menuItem` 加 `catalogItemId → catalogItem.name`，`menuSection` 加 `catalogSectionId`，PR 9 刪掉指向已刪欄位的項目。
- `AUDIT_IGNORED_COLUMNS`（`:106-119`）**不加任何目錄欄位**；`image` 必須留著，理由見「圖片儲存的對應」。
- `AUDIT_SUB_TABLES` 的 `offer`（`:89-98`）維持。

平台管理員端點不經過 `RolesGuard`，`audit_log.organization_id` 會是 null（`src/common/interceptors/audit.interceptor.ts:181`），也就是平台層級紀錄；門市獨家端點則記在該門市。
PR 5c 起新寫入的門市列沒有 `name`、`display_name`，刪除紀錄的標籤（`deleted-record-tables.ts:70-77` 的 `LABEL_COLUMNS`）會找不到名稱，PR 5c 要改成經 `catalog_item_id`、`catalog_modifier_id` 取目錄名稱。

## 端點去留

「停用」指回錯誤碼（例如 `menuMovedToCatalog`），屬於**破壞性**的 API 變更，與 PR 9 一樣要開發者明確同意（見問題 11）。
`src/menus/menus.controller.ts`：

| 端點（行號）                                                                                                                                        | PR 5a 起                                                                                         | PR 9         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------ |
| `GET organizations/:organizationId/menus`（`:86`）、`GET/PATCH menus/:menuId`（`:97`、`:107`）                                                      | 保留，`menu` 仍是門市外殼                                                                        | 保留         |
| `GET menus/:menuId/order-ticket-printers`（`:155`）                                                                                                 | 保留                                                                                             | 保留         |
| `POST menus/:menuId/menu-sections`、`reorder`、批次刪除（`:123`、`:164`、`:203`）                                                                   | 停用，由目錄分類端點取代                                                                         | 移除         |
| `GET menus/:menuId/menu-sections`（`:139`）、`GET menu-sections/:sectionId`（`:175`）                                                               | 保留讀取；PR 5c 清空 `parent_section_id` 後樹會變平，所以 5c 起停用                              | 移除         |
| `PATCH menu-sections/:sectionId`（`:187`）                                                                                                          | 只接受 `orderTicketPrinterId`（作用在既有分類列）；PR 5c 起改走分類設定端點並停用                | 移除         |
| `DELETE menu-sections/:sectionId`（`:214`）                                                                                                         | 停用                                                                                             | 移除         |
| `POST menu-sections/:sectionId/menu-items`、`reorder`、批次刪除（`:228`、`:277`、`:332`）                                                           | 停用，由「目錄品項」＋ PR 5c 的「上架」取代                                                      | 移除         |
| `GET menu-sections/:sectionId/menu-items`（`:254`）                                                                                                 | 保留讀取；PR 5c 清空 `menu_item.menu_section_id` 後會回空清單，所以 5c 起停用                    | 移除         |
| `GET menu-items/:menuItemId`（`:288`）                                                                                                              | 保留為上架列詳情，回應加上目錄品項                                                               | 保留         |
| `PATCH menu-items/:menuItemId`（`:306`）                                                                                                            | 只接受 `availableModes`、`orderTicketPrinterId` 與售價；內容欄位拒絕                             | 移除內容欄位 |
| `DELETE menu-items/:menuItemId`（`:343`）                                                                                                           | 移除上架列（不是下架），不刪目錄品項                                                             | 保留         |
| `POST menu-items/:menuItemId/offers`（`:355`）、`DELETE offers/:offerId`（`:425`）                                                                  | 停用；上架時一併建立 offer                                                                       | 移除         |
| `GET menu-items/:menuItemId/offers`（`:375`）                                                                                                       | 保留                                                                                             | 保留         |
| `PATCH offers/:offerId`（`:385`）                                                                                                                   | 保留；PR 4 起價格欄位檢查 `allow_local_pricing`                                                  | 保留         |
| `PATCH offers/:offerId/availability`（`:405`）                                                                                                      | 保留（`itemAvailability`）；`Discontinued` 另需 `menu: ['update']`                               | 保留         |
| `menu-items/:menuItemId/add-ons` 六個端點（`:440`、`:454`、`:465`、`:476`、`:491`、`:502`）                                                         | 寫入停用、讀取保留，由目錄加購端點取代                                                           | 移除         |
| `menus/:menuId/modifier-groups` 四個、`modifier-groups/:groupId` 三個端點（`:513-594`）                                                             | 寫入停用、讀取保留，由目錄客製群組端點取代                                                       | 移除         |
| `modifier-groups/:groupId/modifiers` 四個端點（`:596`、`:614`、`:635`、`:697`）、`GET/PATCH/DELETE modifiers/:modifierId`（`:646`、`:661`、`:708`） | 寫入停用、讀取保留，由目錄客製選項端點取代                                                       | 移除         |
| `PATCH modifiers/:modifierId/availability`（`:679`）                                                                                                | 保留（作用在既有覆寫列），`Discontinued` 另需 `menu: ['update']`；PR 5c 另有以目錄 id 為鍵的端點 | 移除         |
| `menu-items/:menuItemId/modifier-groups` 五個端點（`:724`、`:738`、`:749`、`:760`、`:771`）                                                         | 寫入停用、讀取保留，由目錄品項的群組連結端點取代                                                 | 移除         |
| `GET organizations/:organizationId/order-menu`（`menus-public.controller.ts:24`）                                                                   | 改由目錄＋門市設定組成，形狀不變，值見「點餐菜單回應」                                           | 保留         |

食譜相關端點（`src/inventory/`）：

| 端點                                                                                                                                                                                                               | 變更                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET menu-items/:menuItemId/recipe`（`menu-item-inventory.controller.ts:11-16`）                                                                                                                                   | 不變（上架列 id）                                                                                                                                                                                                                                                                                   |
| `GET modifiers/:modifierId/recipe`（`modifier-inventory.controller.ts:11-16`）                                                                                                                                     | 參數是門市覆寫列 id，守衛隨 `modifierId` 在 PR 5b 改解析；PR 5c 另加 `GET organizations/:organizationSlug/catalog-modifiers/:catalogModifierId/recipe`，PR 9 移除舊的；PR 5c 起食譜回應的 `modifierId` 回傳目錄選項 id，與建立時收的值一致                                                          |
| `POST organizations/:organizationSlug/recipes`（`organization-inventory.controller.ts:190-199`）、`PATCH recipes/:recipeId`（`recipes.controller.ts:52`），本文的 `modifierId`（`dto/create-recipe.dto.ts:59-65`） | PR 5c 起 `modifierId` 改收目錄選項 id，服務換成本店覆寫列，沒有就建立。`assertModifierInOrganization`（`recipes.service.ts:522-540`）現在經 `modifier_group → menu` 驗證門市，對 `modifier_group_id` 為 null 的新覆寫列一定失敗，5c 改用 `modifier.menu_id`；搬移過的選項兩者相同，舊用戶端不受影響 |

新增端點：

| 端點                                                                                                              | 守衛                                                                                             | PR  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --- |
| `catalog/sections`、`catalog/items`、`catalog/modifier-groups` 的 CRUD、`reorder`、子資源（選項、群組連結、加購） | `AdminGuard`                                                                                     | 3   |
| `POST catalog/items/:catalogItemId/promote`（同理分類、客製群組）                                                 | `AdminGuard`                                                                                     | 4   |
| `GET catalog/items/:catalogItemId/listings`（哪些門市上架）                                                       | `AdminGuard`                                                                                     | 4   |
| `PATCH organizations/:organizationId/menu-settings`（兩個開關）                                                   | `AdminGuard`                                                                                     | 4   |
| `organizations/:organizationSlug/catalog/...` 新增獨家項目；`catalog-items/:catalogItemId` 等修改與刪除           | `@Roles({ menu })`＋`allow_local_menu_items`                                                     | 4   |
| `GET organizations/:organizationSlug/catalog`：品牌＋本店獨家項目，附本店上架狀態（DataGrid）                     | `@Roles({ menu: ['read'] })`                                                                     | 4   |
| `POST organizations/:organizationSlug/menu-items`（以 `catalogItemId` 上架，同時建立 offer）                      | `@Roles({ menu: ['create'] })`                                                                   | 5c  |
| `PUT organizations/:organizationSlug/catalog-sections/:catalogSectionId/settings`（出單機、隱藏）                 | `@Roles({ menu: ['update'] })`                                                                   | 5c  |
| `PUT organizations/:organizationSlug/catalog-modifiers/:catalogModifierId/settings`、`/availability`              | `menu: ['update']`（加價另看開關）／`itemAvailability`（`Discontinued` 另需 `menu: ['update']`） | 5c  |

PR 3、4 的目錄端點只寫目錄表：刪除時遇到任何門市列（上架列、覆寫列、分類設定列）都拒絕，所以 PR 5a 以前不影響點餐菜單；PR 5a 起刪除才會連帶處理門市列，會新增門市列的端點都在 PR 5c。
新端點都要掛 `MenuEventsInterceptor`（`src/menus/interceptors/menu-events.interceptor.ts`）或等效的推播，見「即時推播」。

### 其他讀到菜單的程式

| 位置                                                                                                                                                                                                                      | 現在                                                                         | 切換後（PR）                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PublicMenusService.findOrderMenu`（`menus-public.service.ts:125-295`）                                                                                                                                                   | 從 `menu` 往下讀整棵樹                                                       | 讀目錄樹，套用本店 `menu_section`、`menu_item`、`offer`、`modifier`；只列上架、未停止供應、未隱藏的項目（5a）                                                                                                       |
| `OrderPricingService.resolveOrderItems`（`src/orders/order-pricing.service.ts:120-`），建單、優惠券試算、共享購物車都經過它（`orders.service.ts:409`、`:534`，`coupons.service.ts:1383`，`shared-carts.service.ts:1134`） | 品項必須屬於本店菜單（`:205-215`）；`menuSectionIds` 由 `sectionAncestry` 算 | 品項 id 是本店上架列；內容、客製群組、分類祖先來自目錄；價格依「門市層級」的門市售價順序（含品牌促銷價）；選項供應狀態與加價來自覆寫列；快照的 `modifierId` 是目錄 id；`ResolvedOrderItem` 加 `catalogItemId`（5a） |
| `CouponsService` 名稱與分類（`src/coupons/coupons.service.ts:380-381`、`:461-499`、`:1514-1541`）                                                                                                                         | 名稱讀 `menu_item`、`menu_section`；分類祖先讀 `menu_section`                | 改讀目錄（5a）；比對改用 `catalogItemId`、`:1547` 檢查的資源改為 `catalogItem`、`catalogSection`（8）。PR 5a 到 8 之間，搬移過的分類與品項 id 與目錄相同，既有優惠券照常比對                                        |
| `OrderTicketService.routeItems`（`src/orders/order-ticket.service.ts:563-640`）                                                                                                                                           | 品項 → 分類鏈的 `order_ticket_printer_id`                                    | 上架列 → 目錄分類鏈，每層查本店分類設定列的出單機（5b）                                                                                                                                                             |
| `InventoryTransactionsService` 扣料與退回（`src/inventory/inventory-transactions.service.ts:435-511`）                                                                                                                    | 快照 `modifierId` 直接比對 `recipe.modifier_id`（`:446-476`）                | 先以 `(本店 menu_id, catalog_modifier_id)` 換成覆寫列 id 再比對（5b），見「食譜與扣料」                                                                                                                             |
| `InventoryReportService`（`src/reports/inventory-report.service.ts:112-135`）                                                                                                                                             | `recipe.modifier_id = sold.modifier_id`                                      | 經 `modifier.catalog_modifier_id` 對應（5b）                                                                                                                                                                        |
| `OrderStatsService` 熱門選項（`src/orders/order-stats.service.ts:245`）                                                                                                                                                   | 以快照 `modifierId` 分組                                                     | 不變；分組鍵是目錄 id，搬移前後相同                                                                                                                                                                                 |
| `MenuStockService.sync`（`src/inventory/menu-stock.service.ts:81-`）                                                                                                                                                      | `offer` 經 `menu_item → menu`；`modifier` 經 `modifier_group → menu`         | `offer` 不變；`modifier` 改用自己的 `menu_id`（5b）                                                                                                                                                                 |
| `OrdersService.insufficientStockError`（`src/orders/orders.service.ts:328-342`）                                                                                                                                          | 讀 `menu_item.name`、`modifier.display_name`                                 | 讀目錄名稱（5b）                                                                                                                                                                                                    |
| `PrepEstimateService`（`src/orders/prep-estimate.service.ts:92-96`、`:248-251`）                                                                                                                                          | 讀 `menu_item.name` 與 `offer.delivery_lead_time_minutes`                    | 名稱改讀目錄；準備時間仍在 `offer`（5b）                                                                                                                                                                            |
| `RecipesService`（`src/inventory/recipes.service.ts:503-540`、`:871-899`）、`bindMenuItemByRecipeName`（`src/inventory/recipe-menu-item-binding.ts:114-121`）                                                             | 驗證品項或選項屬於本店；以 `menu_item.name` 綁定                             | 名稱改讀目錄（5b）；`modifierId` 收目錄 id、`assertModifierInOrganization` 改用 `modifier.menu_id`（5c）                                                                                                            |
| `RecipesService.pricesOf` 成本與毛利（`src/inventory/recipes.service.ts:871-889`，`:885` 讀 `offer.price`）                                                                                                               | 售價只讀 `offer.price`                                                       | 改為 `offer.price ?? suggested_price`，與 5c 清空跟隨品牌的售價同時上線（5c）                                                                                                                                       |
| `MenuItemSalesService`（`src/orders/menu-item-sales.service.ts:20-63`）                                                                                                                                                   | 以 `order_item.menu_item_id` 彙總                                            | 不變（本店上架列 id）；以 `catalog_item_id` 跨店彙總（8）                                                                                                                                                           |
| `SalesReportService`（`src/reports/sales-report.service.ts:186-195`、`:306-307`）                                                                                                                                         | `LEFT JOIN menu_item`、`menu_section` 取名稱與分類                           | 改 join 目錄（5b）；依 `catalog_item_id` 跨店彙總（8，#119）                                                                                                                                                        |
| `src/db/seed/`                                                                                                                                                                                                            | 建立各店菜單                                                                 | 改建目錄與上架列（5a）；端對端種子（biru-admin#246）同步                                                                                                                                                            |

## 食譜與扣料

食譜的模型不動：品項食譜掛在上架列（`recipe.menu_item_id`），選項食譜掛在門市覆寫列（`recipe.modifier_id`），兩者都全域唯一（`inventory.ts:169-170`）。
訂單快照的品項 id 是上架列 id，直接對得上；選項 id 是目錄 id，PR 5c 起新建的覆寫列 id 與目錄 id 不同，直接比對就永遠不會扣料。
所以 PR 5b 把所有「快照 `modifierId` 對 `recipe.modifier_id`」的地方改成經 `modifier` 換算：`modifier.menu_id = 訂單門市的 menu.id AND modifier.catalog_modifier_id = 快照 modifierId`，再取 `modifier.id` 找食譜。
涉及 `inventory-transactions.service.ts:446-476`（扣料與退款退回共用）與 `inventory-report.service.ts:112-135`。
這個換算對歷史訂單同樣成立：PR 2 為所有既有覆寫列寫了 `catalog_modifier_id = id`，而快照當時記的就是這個 id。
PR 5b 必須在 PR 5c 之前全環境部署，否則 PR 5c 新建的覆寫列會有一段時間不扣料。

## 即時推播與自動售完

現在 `menuUpdated` 只送到單一門市的房間（`src/events/events.gateway.ts:189-192`），來源有兩個：`MenuEventsInterceptor` 在每個非 GET 請求後以 `request.organizationId` 呼叫 `MenuStockService.refresh(organizationId, true)`（`menu-events.interceptor.ts:18-30`），以及還原菜單資料後（`deleted-records.service.ts:574-577`）。

- 平台管理員的目錄端點沒有 `request.organizationId`，攔截器會直接略過。目錄寫入要改成：找出有上架受影響品項的門市（分類、客製群組的變更則找有上架其下任一品項的門市），逐一 `refresh(organizationId, true)`。
- 門市獨家端點與上架端點照舊由攔截器處理。
- 事件名稱與 payload 不變，前台不需要改。

自動售完（`menu-stock.service.ts:23-56` 的 `keepAutoSoldOut`、`soldOutChanges`）作用在 `offer` 與 `modifier` 的 `availability`／`auto_sold_out`，這兩張在新模型裡仍是門市層級，邏輯不變；只有選項的查詢從 `modifier_group.menu_id` 改成 `modifier.menu_id`。
只有掛了食譜的選項會被自動售完，而食譜一定掛在覆寫列上，與現況一致。

## PR 拆分

| PR  | 範圍                                                                                                                                                                                                                                                                                                                                          | 主要檔案                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0a  | 下架權限（問題 17）：兩個供應狀態端點在服務檢查 `Discontinued` 另需 `menu: ['update']`。與目錄改版無關，可以先上；biru-admin 同步，只對有 `menu: ['update']` 的角色顯示下架                                                                                                                                                                   | `src/menus/menus.service.ts`、`src/menus/menus.controller.ts`；biru-admin                                                                                                                                                                                           |
| 1   | 建六張目錄表（各掛 trigger）、門市表的新欄位與唯一鍵、`organization` 兩個開關、`order_item`／`shared_cart_item.catalog_item_id`、`audit_resource` 新值；註冊圖片 kind、異動資源、可還原表。不改任何讀寫行為                                                                                                                                   | `src/db/schema/`（新 `catalog.ts`、`menus.ts`、`organizations.ts`、`orders.ts`、`shared-carts.ts`、`audit.ts`、`index.ts`）、`drizzle/` 新 migration、`src/images/image-url.ts`、`images.service.ts`、`src/common/utils/audit-resources.ts`、`src/deleted-records/` |
| 2   | 搬移腳本與測試                                                                                                                                                                                                                                                                                                                                | `scripts/migrate-menu-catalog.ts`                                                                                                                                                                                                                                   |
| 3   | 目錄管理 API（平台管理員）與單元測試；`RolesGuard` 四個新參數                                                                                                                                                                                                                                                                                 | 新 `src/catalog/`、`src/menus/guards/roles.guard.ts`、`decorators/roles.decorator.ts`、`src/app.module.ts`                                                                                                                                                          |
| 4   | 門市獨家項目（依開關）、升級為品牌項目、門市目錄檢視、兩個開關的平台管理員端點、既有 offer 端點的售價檢查。不新增任何門市列                                                                                                                                                                                                                   | `src/catalog/`、`src/menus/menus.service.ts`、`src/organizations/`                                                                                                                                                                                                  |
| 5a  | **破壞性**（停用舊內容寫入端點）。讀取切換：點餐菜單、`resolveOrderItems`（建單、優惠券試算、共享購物車，計價含品牌促銷價）、優惠券的名稱與分類來源、種子資料；新舊點餐菜單比對測試。部署前跑 PR 2 最後同步                                                                                                                                   | `src/menus/`、`src/orders/order-pricing.service.ts`、`src/shared-carts/`、`src/coupons/`、`src/db/seed/`                                                                                                                                                            |
| 5b  | 讀取切換：出單機、扣料與庫存報表的選項換算、自動售完、缺料訊息、準備時間、食譜名稱、銷售報表；`modifierId` 參數改解析                                                                                                                                                                                                                         | `src/orders/`、`src/inventory/`、`src/reports/`、`src/menus/guards/`                                                                                                                                                                                                |
| 5c  | **破壞性**（在共用資料庫上不可逆地清空舊分類欄位，停用三個舊讀取端點），需開發者明確同意，且所有環境已部署 5b。migration：放寬四個舊內容欄位的 not null、清空舊分類外鍵；跟隨品牌售價與促銷價的資料步驟（問題 4、16）與成本計算的建議售價後備；會新增門市列的端點（上架、分類設定、選項覆寫、以目錄 id 建選項食譜）；刪除紀錄標籤改取目錄名稱 | `drizzle/`、`src/catalog/`、`src/menus/`、`src/inventory/recipes.service.ts`、`src/deleted-records/`                                                                                                                                                                |
| 6   | biru-admin：商品目錄頁（含建議售價與品牌促銷價）、上架管理頁（取代菜單編輯頁）、兩個開關；codegen                                                                                                                                                                                                                                             | biru-admin（同步 biru）                                                                                                                                                                                                                                             |
| 7   | biru：型別同步，確認點餐流程                                                                                                                                                                                                                                                                                                                  | biru `types/api.ts`                                                                                                                                                                                                                                                 |
| 8   | 優惠券改用目錄 id（並放寬「指定品項只能一間門市」，`coupons.service.ts:262-263`）；跨門市銷售報表                                                                                                                                                                                                                                             | `src/coupons/`、`src/reports/`、`src/orders/menu-item-sales.service.ts`                                                                                                                                                                                             |
| 9   | **破壞性**：刪除舊欄位、三張舊表、舊端點、`addOnId`／`groupId` 參數；`offer` 改一對一；連結欄位改 not null；圖片舊前綴改為只供清理                                                                                                                                                                                                            | 同 PR 1、3、5 的檔案                                                                                                                                                                                                                                                |

#461 的 PR 5 拆成 5a、5b、5c：一次切換所有讀取的 diff 會遠超過一個可審查的 PR，而 5c 必須等全環境部署 5b 才能上。
5a 與 5b 之間，出單與扣料仍讀舊欄位；舊內容端點已在 5a 停用，舊欄位在這段期間不會再變，搬移過的資料讀出來與目錄一致，只有 PR 3、4 新建的目錄項目在 5c 前不會有門市列，不受影響。
PR 6 與 5a 同時上線，PR 6 的上架頁在 5c 上線前不顯示「上架新品項」。

### 與其他 issue 的關係

只列本文新增的接點；#461 已寫明的依賴順序不重複。

| Issue | 接點                                                                                         |
| ----- | -------------------------------------------------------------------------------------------- |
| #459  | 兌換時以 `catalog_item.id` 找本店上架列；本店沒有上架或已下架就不能兌換                      |
| #346  | 若 3D 檔走圖片儲存，要新增 kind 並遵守「圖片儲存的對應」的 `@Audit` 規則                     |
| #458  | 因 id 沿用，搬移過的品項 `menu_item_id` 與 `catalog_item_id` 相同；之後新上架的品項才會不同  |
| #442  | 報廢依食譜展開時，選項的對應同「食譜與扣料」，要在 5b 一起改                                 |
| #392  | 共享購物車在 5a 經 `resolveOrderItems` 切換；`shared_cart_item.catalog_item_id` 在 PR 1 加入 |

## 需要開發者確認的問題

開發者已於 2026-11-12 回覆：

- 兩個門市開關先保留（問題 5 照預設，不替現有門市打開）。
- 問題 16、17 另有決定，寫在各題的「決定」。
- 資料庫裡的菜單都是測試資料，可以清空。
- 問題 11：同意 PR 5a 停用舊的內容寫入端點，也同意 PR 5c 清空舊分類欄位並停用三個舊讀取端點。PR 9 尚未詢問，仍需另外同意。
- 其餘各題照預設。

1. **搬移時目錄列沿用來源列的 id？**
   預設：是。
   理由：優惠券的 `menu_item_ids`、訂單快照、共享購物車、前台 localStorage 購物車、`/api/images/...` 的 id 段都不必轉換，切換前後點餐菜單回應的值相同。代價是同一個 id 同時出現在 `catalog_item` 與 `menu_item`（不同表，不衝突）。
2. **`menu_section`、`menu_item`、`modifier` 保留表名，原地變成門市層級表，PR 9 也不改名？**
   預設：不改名。
   理由：`audit_resource` 的值、`deleted_record.table_name` 的歷史、`RESTORE_PERMISSIONS`、圖片 kind 都以這些名稱為鍵；改名要同時處理歷史資料，收益只有名稱較貼切。
3. **`offer` 保留為上架列的價格與庫存列，PR 9 只加 `unique(menu_item_id)` 改成一對一並刪 `menu_section_id`，不併入 `menu_item`？**
   預設：保留。
   理由：`order.held_offer_stock` 以 `offer.id` 為鍵（`orders.ts:124`），併表要在同一次部署重寫進行中訂單的 jsonb 並改 `inventory-transactions.service.ts:577-697`，風險高、對外沒有差別。
4. **品牌品項的門市售價要不要「跟隨品牌」？**
   預設：PR 2 把 `offer.price` 複製成 `suggested_price` 但保留 `offer.price`；PR 5c 的資料步驟把品牌品項中等於建議售價的 `offer.price` 清成 null，`modifier.price_adjustment` 同理；`offer.price_specification` 與品牌促銷價相同的也清成 null（問題 16）。
   理由：不清的話，之後品牌調整建議售價不會影響任何門市。不能更早清：PR 5a 以前的計價在售價為空時拒絕下單（`order-pricing.service.ts:276`），5c 已要求全環境部署 5b。
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
11. **PR 5a 停用舊的內容寫入端點（回錯誤碼），並把 `PATCH menu-sections/:sectionId` 限縮為只接受 `orderTicketPrinterId`，同意以破壞性 API 變更處理嗎？**
    預設：同意後才合併；PR 5a 與 PR 6 同時上線，PR 9 再刪除端點。
    理由：繼續接受寫入會改到已經沒人讀的舊欄位，使用者以為改成功了；但舊版 biru-admin 呼叫它們會失敗，所以和 PR 9 一樣需要明確同意。
    PR 5c 同樣需要同意：它在共用資料庫上清空舊分類欄位（無法還原），並停用三個舊的分類讀取端點。
    決定：PR 5a 與 PR 5c 都同意；資料都是測試資料，可以清空。
12. **圖片 kind 用新名稱 `catalogSection`／`catalogItem`／`catalogModifier`，舊物件留在原前綴，PR 9 起孤兒清理另外列出舊前綴？**
    預設：是。
    替代方案是目錄沿用 `menuSection`／`menuItem`／`modifier` 這三個 kind 名稱，PR 5a 時把 `IMAGE_TABLES` 指到目錄表；網址可完全不變，但 PR 1 到 PR 5a 之間同一個 kind 要對到兩張表，`ImagesService.find`（`images.service.ts:32-62`）與 `satisfies Record<ImageKind, …>` 都得改寫。
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
    決定：照預設，並補上品牌促銷價 `catalog_item.price_specification`，否則售價關閉的門市沒有人能設促銷。它只套用在跟隨品牌售價的門市，順序見「門市層級」的門市售價。
    理由：開關的目的是讓加盟店統一售價。
17. **「下架」沿用 `offer.availability = 'Discontinued'`，不新增 `listed` 欄位？**
    預設：是；「移除上架列」只在門市管理頁的進階操作提供。
    決定：沿用 `Discontinued`、不加欄位，但員工不能自行下架，只能改有沒有供應：`Discontinued` 另需 `menu: ['update']`，見「門市層級」的下架權限。
    理由：點餐菜單本來就隱藏 `Discontinued`，舊程式在 PR 5a 前看到的狀態一致，下架再上架也保留 id 與食譜。但這表示有 `itemAvailability` 權限的 member 現在就能下架（`src/auth/permissions.ts:94-101`），若下架應只限 `menu` 權限，就要另加欄位。
18. **加購的快照（`OrderItemAddOnSnapshot`、`SharedCartItemAddOn`）也加選填的 `catalogItemId`？**
    預設：是。
    理由：熱銷數量把加購也算進去（`menu-item-sales.service.ts:33-41`），跨店彙總少了它就不完整。
19. **品牌刪除品項時，各門市已下架的上架列會一起刪掉，掛在上面的食譜失去綁定（食譜本身保留），可以嗎？**
    預設：可以，並在回應中列出食譜失去綁定的門市。
    理由：#461 只在「仍有門市上架」時拒絕；若要保留食譜綁定，就得改成只允許「停止供應」而不允許刪除。
20. **搬移腳本重跑時，目錄列比舊表新就略過，不支援 PR 5a 以前同時從目錄 API 與舊端點修改同一列？**
    預設：是。
    理由：要精確偵測兩邊都改過，得另存上次同步的來源時間；PR 5a 以前目錄 API 沒有介面，代價只落在直接呼叫 API 的人身上。

## 我做的假設

- 全平台只有一個品牌，目錄全平台一份（#461 提案假設）。
- 資料庫裡的菜單都是測試資料（開發者已確認，可以清空）；我沒有連線資料庫，不知道目前有幾間門市有菜單、`offer.menu_section_id` 是否真的全為 null，PR 2 的 dry-run 會列出來。
- 每間門市恰好一份 `menu`，由建立門市的 hook 寫入（`menus.ts:74`、`src/auth/index.ts:342-357`），PR 1 到 PR 9 都不改這件事。
- `offer` 與 `menu_item` 實際上一對一（只讀最早的一筆）；PR 2 只把每個品項最早的 offer 視為有效，其餘不搬也不刪，PR 9 加唯一鍵前要先清掉。
- 分類的順序與上下層由品牌決定，門市只能隱藏；品項的排序同樣由品牌決定，所以 `menu_item.sort_order` 在 PR 9 刪除。
- 準備時間（`delivery_lead_time_minutes`）、供應時段、剩餘數量、點餐模式、出單機都是門市層級。
- 食譜、食材與庫存模型不動，食譜仍掛在門市的上架列與選項覆寫列上。
- `src/ecpay/`、`src/auth/permissions.ts` 與 `src/auth/index.ts` 都不需要修改；ECPay 只讀訂單快照。
