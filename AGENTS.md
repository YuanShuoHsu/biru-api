# AGENTS.md

本檔是給 coding agent（Claude Code、Codex）在這個 repo 寫程式時的指引。

## 語言（Language）

- 與開發者的對話、PR 描述、issue 與留言用繁體中文。
- commit 與 PR 標題用英文 Conventional Commits、小寫開頭，用詞先對照 `git log --format=%s -20`。
- 程式碼註解用繁體中文；識別字、指令、路徑、套件與 API 名稱維持原文。
- 本檔的「Behavioral Guidelines」（照抄上游）維持英文原文，不要翻譯。

## 維護本檔（Maintaining This File）

修改本檔時以替換或刪減為主，不讓它變長：新規則先併入或取代既有段落；與程式碼、其他段落或官方文件重複的內容刪掉，改成指向出處；改動讓某條規則過時，就在同一個改動刪掉它。

## 指令（Commands）

```bash
# 開發
pnpm run start:dev       # 啟動並 hot reload
pnpm run build           # 編譯 TypeScript 到 ./dist（錯誤訊息帶 ANSI 顏色；成功與否看 exit code，不要 grep 輸出）
pnpm run start:prod      # 執行 production build

# 測試
pnpm run test            # 單元測試
pnpm run test:watch      # watch 模式
pnpm run test:cov        # 覆蓋率報告
pnpm run test:e2e        # 端對端測試：AppModule 跑在記憶體內的 PGlite（db module 被 mock）；spec 沒設定的變數仍會由本機 .env 補上

# 程式碼品質
pnpm run lint            # oxlint（type-aware）
pnpm exec tsc --noEmit -p tsconfig.json   # 連 spec 一起做型別檢查：build 用的 tsconfig.build.json 排除了 spec，lint 也抓不到型別錯誤
pnpm run format          # Prettier 格式化

# 資料庫（Drizzle Kit）
pnpm drizzle-kit generate   # 依 schema 變更產生 migration
pnpm drizzle-kit migrate    # 套用尚未執行的 migration
pnpm drizzle-kit studio     # 開啟 Drizzle Studio GUI
```

執行單一測試檔：

```bash
pnpm vitest run src/payroll/payroll.service.spec.ts
```

從 `develop` 開分支，所有 PR 都開向 `develop`（GitHub 的預設分支）。絕不開向 `master`：只 merge 進 `master` 的 PR 永遠不會進到 `develop`，之後從 `develop` 開的分支會漏掉它，`master` merge 回來時也會衝突。因為 `develop` 是預設分支，PR 裡的 `Closes #n` 會在 PR merge 進 `develop` 時關閉 issue；只完成 issue 一部分的 PR 用 `Part of #n`。

每個開向 `develop` 或 `master` 的 PR，以及每次 push 到 `develop`，都會在 GitHub Actions（`.github/workflows/ci.yml`）跑 `lint`、`build`、`test`、`test:e2e`，沒有 secret 也沒有資料庫；開 PR 前先在本機跑這四個，外加上面的 `tsc` 型別檢查（CI 不跑），並對改到的檔案跑 `pnpm exec prettier --write`（沒有 pre-commit hook，CI 也不檢查格式）。新功能要附單元測試。

## 架構（Architecture）

**Biru Coffee** 是多語系的咖啡廳管理 API（NestJS 12、TypeScript、PostgreSQL）。

### 主要技術棧（Key Stack）

- **框架**：NestJS 搭配 Drizzle ORM（PostgreSQL 透過 `pg` driver，託管在 Supabase）
- **模組**：原生 ESM（`"type": "module"`）；本地 import 是以 `.js` 結尾的相對路徑
- **Auth**：`better-auth` 套件包在 `AuthModule` 裡，處理 email／密碼註冊、驗證與 Google OAuth
- **i18n**：`nestjs-i18n`，支援 `en`、`ja`、`ko`、`zh-CN`、`zh-TW`；由 `LanguageResolver`（`src/common/resolvers/`）依序從 `lang` query 參數、`x-lang`、`Accept-Language` 解析，每一項都經 `pickLanguage`（`src/common/utils/language.ts`，依 q 值排序，`zh-HK`／`zh-Hant` → `zh-TW`）正規化；用它，不要用 nestjs-i18n 內建的 resolver
  — 信件與通知用收件者的 `user.lang`，不是 request 的語言：Google 註冊時從頁面語言設定它（`src/auth/sign-up-language.ts`），兩個前端在已登入使用者從語言選單選擇語言時儲存它（造訪其他語系的 URL 不會改變它）
  — `src/generated/i18n.generated.ts` 由執行中的 app 重新產生（開機時，以及 `dist/i18n` 變動時），`build` 不會產生它；所以在 `src/i18n/*/*.json` 新增 key 後，要先跑一次 app，才寫用到它的 `i18n.t()` 呼叫，否則 `build` 會因未知的 key 失敗。app 開不起來時（沒有資料庫），手動加上該 key 的 `"<key>": string;` 這一行，位置照 key 在 JSON 檔中的位置，也就是產生器寫入的順序，不是字母順序（刪掉的 key 也要刪掉那一行），並在下次 app 執行時確認它沒有變動
  — 同樣的原因，在同一個 checkout 跑 `build` 前要先停掉 app（包括 `start:dev`）：`build` 會刪掉 `dist/`，app 會把這個檔重寫成幾乎是空的，接著 `build` 就會在每個 `i18n.t()` 呼叫失敗。用 `git checkout -- src/generated/i18n.generated.ts` 復原；但如果對它有手動修改，要先 commit，否則 checkout 會把修改丟掉
- **金流**：ECPay 整合（`src/ecpay/`），含 AIO 結帳與發票服務
- **即時**：`src/events/` 裡的 Socket.io gateway
- **Email**：`src/mails/` 裡的 Nodemailer + Handlebars 模板

### 模組對照（Module Map）

| 模組                 | 路徑                   | 用途                                                                                           |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| DrizzleModule        | `src/drizzle/`         | **全域**：透過 `DRIZZLE` token 注入 DB 實例                                                    |
| AuthModule           | `src/auth/`            | better-auth 設定、access-control statement、email 驗證                                         |
| OrganizationsModule  | `src/organizations/`   | 組織（tenant）、團隊、成員                                                                     |
| UsersModule          | `src/users/`           | 管理員的使用者列表、統計、批次刪除、session（單一使用者的讀取／更新／移除：better-auth admin） |
| MenusModule          | `src/menus/`           | 菜單、分類、品項、offer、加購、客製選項                                                        |
| CatalogModule        | `src/catalog/`         | 品牌目錄（`docs/menu-catalog.md`）：平台管理員的分類、品項與客製選項 CRUD 與排序               |
| OrdersModule         | `src/orders/`          | 訂單生命週期、付款紀錄、品項銷售報表                                                           |
| CouponsModule        | `src/coupons/`         | 優惠券、使用者錢包（`userCoupon`）、領取／發放／兌換                                           |
| PointsModule         | `src/points/`          | 會員點數交易、兌換、全品牌點數規則                                                             |
| BannersModule        | `src/banners/`         | 行銷 banner（公開讀取 + 管理員 CRUD）                                                          |
| DonateCodesModule    | `src/donate-codes/`    | 發票捐贈碼查詢                                                                                 |
| GcisModule           | `src/gcis/`            | 經濟部商工登記查詢（統一編號查詢）                                                             |
| EcpayModule          | `src/ecpay/`           | 金流閘道（AIO 結帳 + 發票）                                                                    |
| EventsModule         | `src/events/`          | Socket.io gateway（訂單狀態／菜單更新）                                                        |
| MailsModule          | `src/mails/`           | 交易類信件寄送                                                                                 |
| AttendanceModule     | `src/attendance/`      | 員工、班表、打卡、請假申請與餘額                                                               |
| PayrollModule        | `src/payroll/`         | 薪資條件、薪資單，以及官方規則集的匯入                                                         |
| TasksModule          | `src/tasks/`           | 排程工作：保存期限清除、通知、資料匯入                                                         |
| InventoryModule      | `src/inventory/`       | 供應商、食材、配方、庫存異動、低庫存提醒                                                       |
| WaitlistModule       | `src/waitlist/`        | 候位設定與號碼牌                                                                               |
| PrintersModule       | `src/printers/`        | 出單機與訂單出單工作（由 OrdersModule 與 EcpayModule import，不是 AppModule）                  |
| StoreLayoutModule    | `src/store-layout/`    | 各門市的 3D 平面配置：設備、內用桌位與座位（平台管理員）                                       |
| AuditModule          | `src/audit/`           | 異動紀錄：`audit_log` 與 `attendance_audit` 的聯集                                             |
| DeletedRecordsModule | `src/deleted-records/` | `deleted_record` 的擷取、列表與還原                                                            |
| QuantModule          | `src/quant/`           | Pionex 交易機器人、市場資料與 AI 決策                                                          |
| ReportsModule        | `src/reports/`         | 銷售、庫存、人事成本與損益兩平報表，以及其 CSV 匯出                                            |
| PushModule           | `src/push/`            | Web Push 訂閱；`NotificationsService`（`NotificationsModule`，由 Waitlist、Orders import）     |
| HealthModule         | `src/health/`          | `GET /api/health`（Terminus）：用 `select 1` 檢查資料庫                                        |
| ChecklistsModule     | `src/checklists/`      | 例行檢查表：各門市的檢查表模板與執行紀錄                                                       |
| CashDevicesModule    | `src/cash-devices/`    | 現金自助繳費機台：各門市的現金機台與其事件帳                                                   |
| OperatingCostsModule | `src/operating-costs/` | 固定成本：各門市依生效月份的每月固定成本（租金、水電、人事估算…）                              |

大多數以門市為範圍的路由都巢狀在 `organizations/:organizationSlug/...` 底下。個人的路由在 `users/me/...` 底下（訂單、優惠券、點數）。

### 資料庫 Schema（Database Schema）

Schema 檔在 `src/db/schema/`，由 `index.ts` 重新 export：

- `users.ts` — `user`、`session`、`account`、`verification`、`twoFactor`（由 better-auth 管理）
- `organizations.ts` — `organization`、`organizationSlugHistory`、`organizationQrSecret`、`organizationOperatingType`、`organizationSpecialHours`、`team`、`teamMember`、`member`、`invitation`
  — 不能公開的門市資料要放在以 `organization_id` 為 key 的獨立資料表，絕不放在 `organization` 上：匿名的門市列表與查詢（`GET /api/organizations`、`/api/organizations/:slug`）會回傳整列。`organizationOperatingType` 存直營／加盟分類，只有平台管理員能透過 API 讀取與設定（其變更仍會記進該門市自己的異動紀錄）；沒有這列資料的門市為 `unclassified`
- `menus.ts` — `menu`、`menuSection`、`menuItem`、`offer`、`menuItemAddOn`、`modifierGroup`、`modifier`、`menuItemModifierGroup`
- `catalog.ts` — `catalogSection`、`catalogItem`、`catalogItemAddOn`、`catalogModifierGroup`、`catalogModifier`、`catalogItemModifierGroup`（品牌目錄，`docs/menu-catalog.md`）
- `orders.ts` — `order`（`coupon_id`：訂單使用的優惠券，不論之後它的代碼改成什麼；比對優惠券用它，不要用 `discount_code`）、`orderItem`
- `coupons.ts` — `coupon`、`userCoupon`
- `points.ts` — `pointTransaction`、`pointSetting`（全品牌唯一一列的點數規則）、`pointAllocation`（每次扣減某批點數的 `remainingPoints` 就一列：該批點數、發放門市與消耗它的交易）
- `attendance.ts` — `attendanceEmployee`、`attendanceShift`、`attendanceEvent`、`attendanceRequest`、`attendanceLeaveType`、`attendanceLeaveCase`、`attendanceAudit`、設定與模板
- `payroll.ts` — `payrollRuleSet`、`payrollTerms`、`payrollStatement`、`payrollEarningType`、`payrollEarning`、`payrollWithholdingUnit`、`payrollTaxIdentity`、`payrollCertificateRequest`
- `banners.ts` — `banner`
- `invoices.ts` — `invoice`、`invoiceAllowance`、`invoicePrintJob`
- `refunds.ts` — `refund`
- `ecpay-payment-attempts.ts`、`ecpay-callback-logs.ts` — `ecpayPaymentAttempt`（付款後帶有 ECPay 的 `charge_fee`）、`ecpayCallbackLog`
- `inventory.ts` — `supplier`（`uniform_invoice`：會開統一發票給門市，見「Break-Even」）、`ingredient`、`inventoryReceipt`、`inventoryTransaction`（有 `receipt_id`：在那張進貨單收到的貨）、`recipe`、`recipeIngredient`、`takeawayPackaging`（非內用飲品依供應溫度、`cup_size` 與 `cup_seal` 消耗的杯子與杯蓋或封膜配方；見「Ingredient Stock」）
- `waitlist.ts` — `waitlistSetting`、`waitlistTicket`
- `printers.ts` — `printer`、`orderTicketJob`
- `push.ts` — `pushSubscription`
- `cash-devices.ts` — `cashDevice`、`cashDeviceEvent`（`(device_id, idempotency_key)` unique；重試的寫入必須沿用它的 key）
- `operating-costs.ts` — `operatingCost`（`(organization_id, category, effective_from)` unique，`input_tax_deductible`；見「Break-Even」）
- `checklists.ts` — `checklistTemplate`、`checklistTemplateItem`、`checklistRun`、`checklistRunItem`、`checklistSetting`
- `store-layout.ts` — `storeLayout`
- `audit.ts` — `auditLog`；`deleted-records.ts` — `deletedRecord`
- `quant.ts` — `quantBot` 與其他 `quant*` 資料表
- `enums.ts` — 共用的 pgEnum（`genders`、`languages`、`restrictedDiet`、供應溫度、甜度、`cupSize` 與 `cupSeal`），以及 `LocalizedText`、`DEFAULT_LANGUAGE`
- `columns.helpers.ts` — 共用的欄位 builder。其 `timestamps` 是**不帶**時區的 `timestamp`；出勤與薪資資料表改用 `withTimezone: true`，所以不要把它們換成這個 helper。

Postgres `integer` 欄位的 DTO 上限，必須替會累加到儲存值上的程式碼留空間：新列會以最大 `sortOrder` + 1 附加在後，或以 0 插在最前並讓既有每一列 +1，而 `reorderSortOrders`（`src/common/utils/sort-order.ts`）會往上重新編號，所以這類欄位的上限要設在合理的範圍（例如 `@Max(9999)`），絕不設成 2147483647，否則溢位的 500 只會延到下一次新增。

Migration 在 `drizzle/`，用 Drizzle Kit 套用。根目錄的 `drizzle.config.ts` 從 `.env` 或環境變數讀取 `DATABASE_URL`。Render 每次部署都會跑 `pnpm drizzle-kit migrate`，而 local、stage 與 production 共用一個資料庫，所以 migration 會由第一個包含它的部署套用到共用資料庫，不需要手動步驟。migration 執行前必須通過的唯讀檢查寫在它的 PR 描述裡，在 PR merge 或分支部署前執行。

在全新的資料庫上 `drizzle-kit migrate` 會失敗（exit 1、沒有訊息）：它把所有待執行的 migration 放在同一個 transaction 套用，而 `0098`／`0105` 用到 `0084`／`0103` 新增的 enum 值，Postgres 在它們 commit 前會拒絕。改用 `pnpm tsx scripts/migrate-fresh-db.ts` 建立空資料庫：它讓每個 migration 各自在自己的 transaction 中套用，並像 `drizzle-kit migrate` 一樣記錄到 `drizzle.__drizzle_migrations`，所以之後的 migration 仍走 `drizzle-kit migrate`。它需要環境變數中的 `DATABASE_URL`，且會拒絕已經有資料表的資料庫。

接著用 `pnpm tsx scripts/seed-e2e.ts` 為端對端測試填入資料：一間門市（`e2e-store`，經營類型 `direct`，每天全天營業），含菜單、客製選項、一個加購與食材，以及五個已驗證的帳號：平台管理員、門市 `owner`、`admin`、`member`，以及不屬於任何門市的顧客。它需要環境變數中的 `DATABASE_URL`（絕不使用 `.env`）與 `E2E_{PLATFORM_ADMIN,OWNER,ADMIN,MEMBER,CUSTOMER}_{EMAIL,PASSWORD}`，且資料庫一有任何 organization 就拒絕執行，所以它永遠不會寫進共用資料庫。

每個業務資料表都有 `record_deleted_row` BEFORE DELETE trigger，把該列複製到 `deleted_record`（連帶刪除的子列會落在同一個 `batch_id`，也就是同一個 transaction）。這個 trigger 是在 `0190` 掛到當時已存在的資料表上，所以**新資料表需要在建立它的 migration 裡自己寫 `CREATE TRIGGER`**，除非它屬於 `UNTRACKED_TABLES`（`src/deleted-records/deleted-record-tables.ts`，與 migration 保持一致）。app 啟動時會對缺少 trigger 的資料表記錄警告。這些列 30 天後清除；根資料表在 `RESTORABLE_TABLES` 中的 batch，可由平台管理員還原，或由角色擁有該資料表 `RESTORE_PERMISSIONS` 動作的門市成員還原（還原 owner 成員或邀請需要 `owner`）。排程的保存期限清除必須在其 transaction 內執行 `set_config('app.skip_deleted_record', 'on', true)`，讓過期不被當成刪除擷取（見 `TasksService.purge`）；絕不在連線池上用 session 層級的 `SET`。

### 薪資規則集（Payroll Rule Sets）

保險費率、投保級距與最低工資**不是**程式碼裡的常數。`payroll_rule_set` 每個生效期間（`effective_from`，`YYYY-MM`）一列，存費率、級距表、來源 URL 與 `rates_carried_from`。`PayrollService.snapshot` 取薪資單月份當時有效的那一列，所以重新試算舊月份一律用該月的費率；完全沒有對應列的月份會拋出 `payrollRuleSetMissing`。

`PayrollRulesService.ingest()` 從 `src/payroll/rule-source.ts` 列出的六個官方開放資料集更新規則集：勞保分級表（`6258`）、職災保險投保薪資分級表（`170557`）、勞退月提繳分級表（`6274`）、健保投保金額分級表（`20251`）、最低工資（`6281`）與職災保險費率（`6262`），每一個都透過 `data.gov.tw/api/v2/rest/dataset/{id}` 找到，所以新的年度不用改程式。職災的行業別與通勤費率來自 `6262`；其他費率沿用前一期，不用猜，因為它們是法定的（勞保 11.5% + 就保 1%、健保 5.17%、薪資 5% 就源扣繳），只會由公告變更。匯入的級距表若下限或上限往下移，或增加超過一倍，就視為來源異動而拒絕，保留前一期的級距表。扣繳門檻是「各類所得扣繳率標準」§13：應扣繳稅額不超過 NT$2,000，**不是**薪資門檻。2026-01 的資料由 `drizzle/0129_payroll_rule_sets.sql` 預先寫入；由 `TasksService` 每天更新，也可由 `POST /api/payroll/rule-sets/ingest`（平台管理員）隨時觸發。

同一個工作與端點也會跑 `ingestHolidays`，從政府行政機關辦公日曆表（`14718`）重寫今年與之後年度的 `statutory_holiday`，並以 `holidayYears` 回傳寫入的年份。過去的年份只回補前一年：在它沒有資料時寫入一次，之後不再重寫；更早的年份從不抓取。`0164` 沒有預先寫入假日，所以在某一年寫入前，該年的排班與試算都會以 `holidayCalendarMissing` 失敗。每一年在各自的 advisory lock 下重寫，所以 cron 與手動執行永遠不會交錯。

最低工資來自資料集 `6281`。當它沒有該期可用的數字時（連不上、因顯示調降而被拒絕，或低於一般勞工級距表的第一級，而分級表把第一級綁定每月最低工資），月薪數字取第一級，時薪沿用前一期。若因此改變了月薪數字，該期會得到 `unconfirmed: ['minimumHourlyWageCents']`，時薪制的試算會帶 `minimumWageUnconfirmed`，直到之後的匯入在 `6281` 找到數字，或平台管理員透過 `PATCH /api/payroll/rule-sets/:effectiveFrom` 設定公告值。

抓到每個資料集且沒有任何拒絕的匯入，會在最新一期蓋上 `checked_at`。試算若用的是最新的規則集，而它沒有在薪資月份開始當天或之後被檢查過，就會帶 `payrollRuleSetStale`：一月抓取失敗時不能默默用去年的級距表計算。部署 `checked_at` 後要跑一次匯入，否則所有試算都會被卡住。

勞保有兩張級距表：`laborGrades`（一般勞工）與 `partTimeLaborGrades`（部分工時勞工，下限 NT$11,100），由 `insurance.laborLadder` 選擇，儲存薪資條件時推導出來（`deriveInsurance`）：除非已知員工在條件的 `effectiveFrom` 是全職（見「Weekly Hours」），否則為 `partTime`。條件帶 `partTime`、但員工在期初已知為全職的試算，會帶 `partTimeLadderRequiresPartTime`。健保沒有部分工時級距表，下限維持分級表第一級。

員工儲存的 `laborBasis`／`healthBasis` 若不是該月級距表中的級距（每年一月最低工資調整下限時都會發生），試算會帶 `insuranceBasisOutdated` 阻擋，而不是用過時的級距計算。

### 已發布的薪資單（Published Payslips）

有 `published` 薪資單的月份，對該員工來說就已關帳。任何會改變其 snapshot 讀取內容的操作，例如核准申請或取消請假、建立或取消班表、儲存薪資條件、育嬰復職、調整 `hiredAt`／`terminatedAt`、重新試算該月，都必須先呼叫 `assertPayrollUnlocked`（`src/attendance/attendance-audit.ts`），並以 `payrollLocked` 失敗。請假核准會鎖住從請假開始起的每個月，因為病假與特休的帳會延續到之後的月份。建立、更新、取消或還原工作日班表，以及讓班表在工作日與假日間切換的原住民族歲時祭儀變更或國定假日補休，同樣會鎖住從該班開始起的每個月（更新會依各自的日別檢查新舊兩個班），因為每週工時是工作日班表的滾動平均，假別額度在期初讀取它。其他班表只鎖住自己的月份。

沒有重新開帳：`payroll_statement` 每位員工每月只有一張薪資單（`payroll_statement_month_uidx`，migration `0157`），所以已發布的月份會一直關帳。

### 出勤異動紀錄（Attendance Audit）

出勤與薪資的變更由 `writeAudit`（`src/attendance/attendance-audit.ts`）記錄到 `attendance_audit`，**不是**由 `@Audit`／`audit_log`。這一列和變更寫在同一個 transaction 裡，保存 60 個月：勞基法 §30 規定出勤紀錄要保存五年，而 `audit_log` 12 個月後就會清除。不要在出勤或薪資的 handler 加 `@Audit`，也不要把這些列移進 `audit_log`。

兩個資料表一起顯示在異動紀錄頁：`AuditService` 把它們做聯集，透過 `ATTENDANCE_AUDIT_ACTIONS` 把每個 `attendance_audit.action` 對應到資源與動詞。新的出勤動作必須加在那裡（`writeAudit` 的簽名會強制要求），新的資源需要在 `READ_PERMISSIONS`（`src/audit/attendance-audit-entries.ts`）加一筆，讓沒有該資料讀取權限的成員永遠看不到它的歷史。

出勤與薪資的紀錄資料表（員工、班表、事件、申請、請假案與餘額、育嬰紀錄、薪資條件、薪資單、收入項目、稅籍資料、證明申請）以 `ON DELETE restrict` 參照 `organization`（和 `order` 一樣），所以持有這些資料的組織無法刪除；不要改回 cascade。各門市的設定與查找資料表（`attendance_settings`、`attendance_shift_type`、`attendance_leave_type`、`payroll_earning_type`、`payroll_withholding_unit`）與 `attendance_audit` 會隨組織 cascade：只有在沒有任何 restrict 紀錄時才刪得掉，而 cascade 刪除的列也會像其他刪除一樣擷取到 `deleted_record`。

### 每週工時（Weekly Hours）

員工的每週工時不儲存（`0144` 刪除了 `weekly_minutes` 與 `weekly_minutes_history`），而是從班表推導。`averageWeeklyMinutes`（`src/attendance/employee-hours.ts`）取員工在該日期前 12 個月內結束、未取消的 `workday` 班表的平均（從 `hiredAt`，或從較晚的第一個這類班表起算），每班計 `scheduledWorkSeconds`、上限 480 分鐘；該區間內沒有這類班表結束時為 `null`。`weeklyMinutesAt`／`weeklyMinutesOf` 在 `null` 時退回 `FULL_TIME_WEEKLY_MINUTES`（2400）；`averageWeeklyMinutesSql`／`employmentTypeSql` 是給列表用的 SQL 版本，平均到 `now()`。低於 2400 就是部分工時。

工時要以決定該權益的日期來解析。特別休假與每年的事假／家庭照顧假／病假額度在期初給予（勞基法 §38：權利在期間屆至時發生），所以 `annualLeavePeriod` 與 `statutoryLeavePeriod` 以 `period.start` 解析工時，之後的班表不能縮減已給予的假。病假的天數換算與額度以該曆年開始解析（住院以前一年開始），事由假以該案開始解析。勞保的部分工時級距表則用 `knownFullTime`（`src/payroll/payroll.service.ts`），它讀 `averageWeeklyMinutes` 但不退回預設值，所以沒有班表歷史的員工不算已知全職。因為滾動平均會影響之後的月份，工作日班表的變更會鎖住從該班開始起的每個月（見「Published Payslips」）。

### 排定休息時間（Scheduled Breaks）

`attendance_shift.breaks`（自 `0155` 起為 jsonb 清單；班表模板在 `0176` 刪除）存排定的休息時間，由 `scheduledBreaks`（`src/attendance/shift-intervals.ts`）在儲存班表時產生：每連續工作 4 小時休息 30 分鐘，平均分布，4 小時以內的班不休息（勞基法 §35，[law.moj.gov.tw](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=35)），所以永遠不用手動輸入。除非 `paidBreak`（班表儲存時預設關閉），休息時間不算工作時間：請假分鐘數、請假扣薪、病假單位與時薪制的排定工時，一律走 `scheduledWorkIntervals`，絕不用原始的班表時段。沒有休息的班，整段都算工作時間。

### 多語系欄位（Localized Fields）

菜單相關實體（菜單、分類、品項、客製選項）把多語系文案存成 `jsonb`，型別為 `LocalizedText`，也就是 `Partial<Record<Language, string>>`，即 `{ en, ja, ko, "zh-CN", "zh-TW" }`，定義在 `src/db/schema/enums.ts`。輸入 DTO 把它們標為 `LocalizedText` 並加上 `@IsLocalizedText()`（`src/common/decorators/`，只接受五個語言 key 與字串值；見 `src/menus/dto/create-menu.dto.ts`），每個 DTO 都以 `type: LocalizedTextDto`（`src/common/dto/`）描述它們，讓 codegen 不會產生 `Record<string, never>`。

### 圖片（Images）

菜單、分類、品項、客製選項、目錄的分類、品項與客製選項、banner 與門市照片的圖片，存成 base64 data URL，除非設定了 S3 相容儲存（見「Environment Variables」）：此時 `ImageStorageService`（`src/images/image-storage.service.ts`）會在寫入前上傳每張新圖片，key 為 `<kind>/<imageVersion>.<ext>`，欄位存它的公開 `https://` URL，下面每個 helper 都把它原封不動當作 `imageUrl` 回傳。若是 data URL，它們的端點會回傳 `withImageUrl`（`src/images/image-url.ts`）產生的 `imageUrl`，也就是 `/api/images/:kind/:id/:version.:ext`（`imageVersion`：data URL 的 SHA-256 前 16 個 hex 字元；只需要 URL 的查詢改 select `imageRefSql` 而不是圖片本身（`imageRefQuery`），再交給 `withImageRefUrl`，點餐菜單以及菜單、banner、門市照片列表都這樣做，讓圖片永遠不離開 Postgres；分頁列表先以 `withoutImage` select 該頁，之後再加上 `withImageRefs`，因為在分頁查詢裡 Postgres 會對每個符合的列做雜湊，而不只是該頁）。`ImagesController` 提供這個端點，不限流，目前版本給一年的 `immutable` 快取（`audit_log.changes` 仍保留 data URL）。編輯對話框只在上傳的圖片與 `imageUrl` 不同時才送出 `image`，絕不送出 URL 本身。只有新圖片會改變 URL：重新排序、切換開關或編輯其他欄位都會保留它，讓瀏覽器與圖片最佳化器保留它們的副本；過時的版本或副檔名仍會回傳目前的圖片（若該列已移到儲存空間，就從其儲存 URL 抓一次），並以 `no-cache` 取代 `immutable`，因為前台對 banner 與門市照片列表的快取（`"use cache"`）比一次編輯的時間還長，而且所有環境共用一個資料庫，沒有任何快取能在每次編輯時失效。不要用 redirect 回應它：Next 的圖片最佳化器會拒絕本地圖片的非 2xx 回應。不論 `no-cache` 怎麼說，最佳化器仍會把從過時 URL 抓到的內容保留 `images.minimumCacheTTL`（預設 4 小時）。只有找不到該列或圖片時才回 404。這個端點是匿名的，不檢查該列是否已發布：URL 只會由已經授權呼叫者的端點發出，而 Next 的圖片最佳化器抓取來源時不帶訪客的 cookie。版本不是存取檢查：曾經拿到 URL 的人，在該列或其圖片被刪除前，都會一直看到該列目前的圖片。

`pnpm tsx scripts/migrate-images-to-storage.ts` 會計算這些資料表、`user.image` 與 `organization.logo`（後兩者只計算下方 hook 會接受的）中剩下的 data URL；加 `--apply` 會把它們搬到儲存空間。所有環境共用資料庫，所以要先在每個前端部署設定 `NEXT_PUBLIC_IMAGE_HOST`，否則 next/image 會拒絕搬移後的 URL。

會員頭像（`user.image`）與門市 logo（`organization.logo`）的 data URL 也以同樣方式上傳，由 `src/auth/index.ts` 的 better-auth hook 負責，key 為 `user/` 與 `organization/`。hook 只接受空字串、任何標準形式（`URL.href`）的 https URL（例如 Google 的頭像），或符合 `IMAGE_DATA_URL_PATTERN`（`src/common/constants/image.ts`）的 data URL，且長度不超過 `IMAGE_DATA_URL_MAX_LENGTH`；其他字串一律以 `INVALID_IMAGE` 拒絕。它們不是 `IMAGE_KINDS`，所以 `/api/images/:kind` 不提供它們；孤兒清理也會列出它們的前綴。

取代或刪除時都不會刪除已儲存的物件；`POST /api/images/orphans/sweep`（平台管理員，除非 `apply: true` 否則只是試跑）會移除每個 kind 前綴下超過 7 天且沒有被參照的物件。參照包括各資料表的 `image` 欄位（以及 `user.image`、`organization.logo`）、這些資料表在 `deleted_record` 列中的同一欄位，以及最近 7 天內這些資源的 `audit_log` 列中的 `before`，所以被取代的圖片在替換後還會保留 7 天。新的寫入 `image` 的路徑必須帶 `@Audit`（且 `image` 必須不在 `AUDIT_IGNORED_COLUMNS` 裡），寫入 `user.image` 或 `organization.logo` 的路徑必須像 `/update-user`（只記 `image` 的變更）與 `afterUpdateOrganization` 一樣寫 `audit_log`，否則舊圖片一被取代就可能被清掉。連結 Google（`updateUserInfoOnLink`）會在 OAuth callback 中取代頭像，那裡不會執行 after hook，所以由 `databaseHooks.account.create.before` 保留使用者列、`user.update.after` 記錄 `image` 的變更；重新連結已連結的 Google 帳號（`updateAccount`）則不會，所以它取代掉的頭像沒有 7 天的寬限期。

### 點數到期（Points Expiry）

點數在取得一年後到期：訂單的 `paymentDate`（或調整時間）一個日曆年後那天台灣時間的結束，2/29 退回 2/28，由 `src/points/points.service.ts` 的 `toExpiresAt` 計算。期限是刻意固定的，不是設定值：可設定的期限會讓同一位會員的各批點數期限不同，也很難解釋，所以不要再加回有效年數欄位。`expiresAt` 在記錄該批點數時蓋上，之後不得縮短；取得的點數若為 `null`，代表是在這條規則存在前記錄的，永不到期。

### 食材庫存（Ingredient Stock）

`ingredient.inventory_level` 只會因超賣而變成負數：已付款的訂單（OrderProblem → OrderProcessing，`src/orders/order-transitions.ts` 的 `consumesInventory`）消耗庫存時不帶 `enforceStock`，因為已付款的訂單不能拒絕，`record` 會在低庫存通知裡把該食材標為 `oversold`。其他所有情況都讓庫存保持非負：下單時使用 `enforceStock`，盤點與期初庫存在 DTO 中驗證為非負。負數代表帳不對、員工必須重新盤點；不要把它當成拒絕已付款訂單的理由，也不要接受負數的盤點。

訂單消耗也會扣除外帶包材：每個存有封口方式的品項與加購，依其供應溫度（`SERVING_TEMPERATURE_OF_LEVEL`）、其客製選項 snapshot 帶的 `cupSize`（下單時從 `catalog_modifier` 複製；預設 `12oz`）與該封口方式找到對應的 `takeaway_packaging` 列，得到一個每份消耗一次的配方，和其他配方一樣（包括 `enforceStock`）。封口方式只在下單時決定一次（`OrderPricingService`），存在 `order_item.cup_seal` 與加購 snapshot 的 `cupSeal`：取 `cupSeal` 客製選項，否則取全品牌預設（`DEFAULT_CUP_SEAL`：封膜，依供應溫度的包材列，熱飲為紙膜、冰飲為塑膠膜），所以顧客只有在例外時才選封口方式（杯蓋，或自備杯）。沒有 `takeaway_packaging` 列的門市沒有預設，只用客製選項帶的封口方式（每張訂單查一次）。內用訂單、沒有供應溫度的品項與 `customerProvidedCup` 品項沒有封口方式。消耗與出單（會印出預設封口方式讓員工看到）都讀儲存的封口方式，絕不重新計算，所以沒有封口方式的品項（包括儲存它之前下的每張訂單）不扣任何東西、也不檢查任何東西；找不到對應列時也一樣。

有 `unlimitedStock` 的食材永遠不扣除：訂單消耗、批次生產原料與低庫存檢查都會跳過它，對它記錄耗損會在 service 中以 `unlimitedStockWaste` 拒絕，而不只是在後台 UI 隱藏。

有 `daily_limit` 的 `offer` 是每日限量品項：它的 `inventory_level.value` 保持為今天剩下的數量，並在每個營業日開始時重設為 `daily_limit`；營業日是提早四小時的台灣日期（`businessDay`，`src/inventory/offer-daily-limit.ts`），所以 04:00 開始新的一天。`daily_limit_reset_on` 是它上次重設的營業日；`MenuStockService.resetDailyLimits` 會重設所有落後的 offer，再更新售完狀態。04:00 的 cron 對每間門市執行它，點餐菜單讀取、下單與付款結果也會先對自己的門市執行它，所以 cron 漏跑或停用都不影響。它們在訂單的 transaction 之前執行它，絕不在 transaction 之內：它會鎖住該門市所有到期的 offer，這會破壞訂單持有的 offer 以 id 遞增順序上鎖的規則。設定新的 `daily_limit` 時，今天剩下的數量設為上限減去今天訂單保留的數量（`held_offer_stock`），最低為 0，且只有 `menu: ['update']` 能變更它；清除它則保留送來的剩餘數量。取消之前營業日的訂單，不會把它保留的份數還給每日限量的 offer。

`inventory_transaction.created_by` 是記錄盤點（包括與食材一起儲存的期初庫存與盤點）、批次、耗損或進貨單的使用者（`session.user.id`，從 controller 往下傳）；訂單消耗與還原則留空。新的、由員工發起並寫入異動的路徑必須傳入它：產品耗損沒有 `@Audit`，所以這個欄位是誰做的唯一紀錄。

### 損益兩平（Break-Even）

`GET /api/organizations/:slug/reports/break-even?month=&targetProfit=`（`BreakEvenReportService`，`operatingCost: ['read']`，只限 owner）以台灣的日曆月為單位。

- 固定成本是 `operating_cost` 列：每個類別取 `effective_from` 不晚於該月的最新一列，所以成本輸入一次就會延續；之後的一列設為 `0` 即結束。不要加每月一列的資料或開關。
- 人事成本是該月已發布的薪資單（`PersonnelCostReportService.monthCosts`），再加上該月每位沒有薪資單的員工，依班表與薪資條件算出的薪資單（`PayrollService.estimateSnapshots`，一個不寫入薪資單的唯讀 transaction）；算不出薪資單的員工計入 `unestimatedEmployees`。只有在沒有任何員工能算出成本時，才用 `personnel` 列這個手動估算。
- 營收含稅（計入的訂單減去已確認的退款，與銷售報表相同）；營業稅以 `BUSINESS_TAX_RATE`（5%，營業稅法 §10，`src/common/constants/business-tax.ts`）拆出。
- 成本扣除可扣抵的進項稅額，也就是門市取得統一發票的支出中的 5%：有 `input_tax_deductible` 的固定成本列（人事成本絕不算）、來自有 `uniform_invoice` 供應商的食材（`netUnitPriceSql`，也包括自製食材的原料），以及 ECPay 手續費。一筆成本是否有發票，記錄為該列或供應商上的事實，不從類別推斷。報表的 `businessTaxPayable` 是銷項稅額減去這些進項稅額，是依該月成本的估算；申報以實際的進項發票為準。
- 銷貨成本是標準成本：售出份數（`orderItemMovements`）× 每個品項、加購與客製選項以目前食材價格計算的配方成本，所以無限庫存的食材也會計入。沒有配方的品項，或配方含未定價食材的品項，成本未知，會同時從成本與決定成本率的營收中排除；沒有配方的客製選項成本為 0。
- 金流手續費是 ECPay 回報的 `PaymentTypeChargeFee`（交易手續費 + 交易處理費），由 `recordPaymentResult` 從 ReturnURL 通知與對帳查詢存到已付款的 `ecpay_payment_attempt.charge_fee`；現金訂單成本為 0。沒有記錄手續費的 ECPay 訂單計入 `unknownFeeOrders`，不用猜的。站內付 2.0 的付款結果處理後，也必須以同樣方式記錄 `ChargeFee` + `ProcessFee`。
- 銷貨成本率與手續費率取至今或至月底的 `RATE_WINDOW_DAYS`（90）天銷售，而不是只看當月，讓月初的數字保持穩定；在還沒有可計算成本的銷售前，成本率是該門市菜單品項的配方成本除以售價的平均（`costRateSource: 'menu'`），手續費率維持 null。
- 損益兩平 = 固定成本 ÷ ((1 − 成本率 − 手續費率) ÷ 1.05)，再除以該月依營業時間與特殊營業時間算出的營業天數（`OpeningCalendar.isOpenOn`）。`targetProfit` 是營所稅後的數字：加進固定成本前先以 `monthlyPreTaxProfitFor` 換算成稅前，`incomeTax` 把該月年化計算（`src/reports/income-tax.ts`，所得稅法 §5：12 萬免稅、20%、以超過部分的一半為上限），所以兩者都是年度稅額的估算。

### Email 訂閱（Email Opt-in）

`user.emailSubscribed` 是會員的 email 訂閱意願：註冊時的勾選框，會員可在前台的個人資料設定中變更。目前沒有任何信件檢查它；每一種信件是否遵守它，各自決定。關於會員自己帳號的通知（例如點數到期提醒）不遵守它。遵守它的信件類型必須跳過 `emailSubscribed = false` 的會員，並連結到個人資料設定頁讓會員取消訂閱（個資法 §20，[law.moj.gov.tw](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=20)），而且要走同一條同時做到這兩件事的 `MailsService` 路徑，絕不在每個呼叫端各自檢查。

### 依賴注入模式（Dependency Injection Pattern）

Service 用 `DRIZZLE` injection token 注入 Drizzle DB 實例：

```typescript
constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}
```

### 角色與權限（Roles & Auth）

`better-auth` 實例在 `src/auth/index.ts` 設定（admin、twoFactor、multiSession 與 organization plugin，加上專案自己的 `exportUserData` 與 `authI18n.plugin`），掛載在 `/api/auth/*`。`twoFactor` 要放在 `multiSession` 前面：after hook 依 plugin 順序執行，所以因 2FA 暫停的登入會在 `multiSession` 看到它之前清掉新的 session；順序反過來的話，`multiSession` 會刪掉該使用者在瀏覽器中既有的 session。有**兩個獨立的授權層**，不要搞混：

**1. 平台管理員** — `user.role`（`user` 上的一般 `text` 欄位，註冊時設為 `'user'`）。由 `AdminGuard`（`src/common/guards/admin.guard.ts`）把關，只有 `role === 'admin'` 才通過。用於跨門市的端點：`UsersController`、`AdminBannersController`、`AdminCouponsController`、`AdminPayrollRulesController`、`AdminPointSettingsController`、`AdminPointReportsController`、ECPay 發票管理。

**2. 組織成員** — `member.role`，為 `owner | admin | member` 的 pgEnum（`src/db/schema/organizations.ts`）。這是以門市為範圍的主要機制：

- `src/auth/permissions.ts` 為每個資源宣告一個 access-control statement（例如 `menu`、`order`、`coupon`、`revenue`、`payslip`），每個只列出它支援的動作，並透過 better-auth 的 `createAccessControl` 建立 `owner`／`admin`／`member` 角色。`isAuthorized(role, action)` 是唯一的入口。
- `@Roles(action, organizationParam)`（`src/menus/decorators/roles.decorator.ts`）標註在 handler 上，例如 `@Roles({ order: ['update'] }, 'organizationSlug')`。
- `RolesGuard`（`src/menus/guards/roles.guard.ts`）在 `AppModule` 以 `APP_GUARD` **全域**註冊。它解析 session，從 decorator 指定的路由參數推導 `organizationId`（`organizationId`、`organizationSlug`，或從 `menuId`／`sectionId`／`menuItemId`／`offerId`／`addOnId`／`groupId`／`modifierId` 沿著菜單樹往上找），查出呼叫者的 `member` 列，再呼叫 `isAuthorized`。它也會把解析出的 `organizationId` 存在 request 上。**沒有** `@Roles` 的 handler 會原封不動放行。
- `@OrganizationMember(organizationParam)`（同一個檔案）執行同一個 guard 但不帶動作：組織的任何 `member`（或平台管理員）都能通過。用在自助路由（打卡、自己的申請、自己的薪資單），並在 service 中把資料範圍限制在呼叫者自己的員工列。

新增以門市為範圍、但其參數尚未涵蓋的路由時，要同時擴充 `OrganizationParam` union 與 `resolveOrganizationId` 的 switch。

**角色層級** — 每個角色都擁有其下所有角色的功能與通知：平台管理員 ⊇ `owner` ⊇ `admin` ⊇ `member`。平台管理員在每個組織都算 `owner`，不論他自己的 `member` 列寫什麼。功能或通知限定某個角色時，也要給它以上的每個角色（通知見下方），絕不給較低的角色某個較高角色沒有的東西。`permissions.ts` 已經讓 `owner` 是 `admin` 的超集、`admin` 是 `member` 的超集；`RolesGuard` 與 `findOrganizationRoles`（events gateway 用它來加入門市 room 與推送）負責平台管理員這一層。

對通知來說，層級決定的是一個角色會得知什麼，而不是怎麼送。平台管理員的每日摘要可以併進平台每日摘要（`notifyPlatformDailyDigest`，`src/orders/order-notifications.service.ts`），所以各門市摘要（`notifyDailySalesDigest`、`notifyLowStockDigest`）只有在內容平台摘要也有時，才可以排除帶 `joined_as_platform_admin` 的成員。它目前涵蓋兩份摘要送出的所有內容，所以兩者都排除這些成員；某份門市摘要若新增了平台摘要沒有的內容，就必須再把他們加回來，直到平台摘要也涵蓋為止。關於單一事件的通知（例如待審核的出勤申請），只會送給平台管理員加入的門市，因為他在那裡的 `owner` 成員列已經讓他成為收件者；其他門市的事件不會送給他，因為他可以用 `owner` 身分打開任何門市。

平台管理員加入某間門市時，會得到 `owner` 並設定 `member.joined_as_platform_admin`；每間門市都必須保有一位沒有這個旗標的 owner，由 `assertKeepsOwner`（`src/auth/owner-guards.ts`）在移除成員、降級與離開時強制執行。

Controller 常在 class 層級加 `@AllowAnonymous()`（來自 `@thallesp/nestjs-better-auth`），個別 handler 再加 `@Roles(...)` 或 `@UseGuards(AdminGuard)`：這些 guard 獨立於 `@AllowAnonymous` 執行，所以這個組合是刻意的，不是漏洞。

### 全域設定（Global Setup (`src/main.ts`)）

- API 前綴：`/api`
- Swagger UI 在 `/api`，文件在 `/api-json`：只在 `NODE_ENV !== 'production'` 時掛載（`src/main.ts`），所以 codegen 與 `/api-json` 比對要對本機或非 production 的 API 跑
  — `nest-cli.json` 以預設值啟用 [`@nestjs/swagger` CLI plugin](https://docs.nestjs.com/openapi/cli-plugin)，所以 `*.dto.ts`／`*.entity.ts` 檔中宣告的每個屬性不用 `@ApiProperty` 也會被記錄：型別與 `required` 來自 TypeScript 宣告（`?`，不是 `@IsOptional()`），class-validator 的 decorator 會加上 `@Min`／`@IsIn` 等限制，`@ApiProperty*` 給的值優先於 plugin 推斷的值。要判斷某個改動是否會改變文件（以及前端的 `types/api.ts`），比對改動前後的 `/api-json`
- Port：`PORT` 環境變數（預設 3001）
- Nest factory 設 `bodyParser: false`：由 better-auth 的模組負責解析 body
- 全域 pipe：`I18nValidationPipe`，帶 `transform`、`whitelist`、`forbidNonWhitelisted`
- 全域 filter：`AllExceptionsFilter`（支援 i18n，只限 HTTP：`useGlobalFilters` 不會作用到 WebSocket gateway）。gateway 以 class 層級的 `@UseFilters` 綁定 `AllWsExceptionsFilter`（`src/common/filters/`）：`@SubscribeMessage` handler 中的任何例外（guard、pipe 或 handler 本身）都會以 `exception` 事件送出 `{ status: 'error', message, statusCode?, ...response 欄位（例如 code）, cause: { pattern, data } }`（沒有 HTTP 的 `path`／`success`／`timestamp`；由物件建立的 `WsException` 或 `HttpException` 會原樣展開，所以只有該物件有 `message` 時才會有 `message`），和 `AllExceptionsFilter` 一樣翻譯，並從 `cause.data` 移除 `accessToken`；ack 永遠不會被呼叫。要拒絕訊息就拋出翻譯過的 `HttpException`／`WsException`，絕不回傳 `false`
  — 兩個 filter 都把每個驗證錯誤（`I18nValidationException`）回成 400 `common.exceptions.badRequest`，所以 class-validator 的訊息永遠不會送到 client；使用者必須看到的原因，要從該模組的 `*-errors.ts`（例如 `src/menus/menu-errors.ts`）拋出帶代碼、已翻譯的錯誤
  — 兩者也會把 Postgres 拒絕儲存的文字（NUL byte：pg `22021`／`22P05`，`isUnstorableText`）回成 400 `badRequest`，所以要存進 Postgres 的值不需要自己檢查 NUL；送到別處（ECPay、信件）的文字仍要檢查
- 全域 guard（`AppModule`）：先 `RolesGuard`，再 `ThrottlerGuard`
- 健康檢查：`GET /api/health` 回 200；`select 1` 失敗或超過 3 秒時回 503（只回狀態，pg 錯誤寫進 log）。它是匿名的且不限流，因為 Render 的檢查不經過 Cloudflare，不帶 client IP，會全部共用 `ip:missing` 這個 bucket。Render 要在服務的 Settings → Health Checks 路徑設為 `/api/health` 後才會用它
- 限流：全域 100 次／60 秒（`src/common/constants/throttle.ts` 的 `THROTTLERS`）。`throttleTracker` 把已登入的請求依 user id 分 bucket，其餘依 `clientIp`；沒有可用 IP 的請求共用一個 `ip:missing` bucket。它自己查 session，因為 `AppModule` 的 guard 在 better-auth 的 `AuthGuard` 之前執行，`req.user` 還沒設定。匿名點餐、ECPay 結帳、載具條碼檢查、候位號碼牌、優惠券檢查與公司查詢路由，用 `@Throttle` 在具名的 `anonymous`／`hourly` throttler 上加上 30 次／分與 150 次／小時。每個 throttler（包括全域的）只有在設定 `CLIENT_IP_HEADER` 或 `TRUSTED_PROXIES` 後才生效：兩者都沒設時，`req.ip` 是 proxy 的位址，所有呼叫者會共用一個 bucket，任何限制都會讓整個平台被限流。具名 throttler 除非路由覆寫，否則不限次數，它們的 `skipIf` 也會連同路由的覆寫一起略過。預估點數路由刻意不放在具名 throttler 上：它把不適用的優惠券當作沒有折扣，而不是拒絕，所以無法用來猜代碼
- `trust proxy` — 由 `TRUSTED_PROXIES`（`src/common/trusted-proxy.ts`）設定，是以逗號分隔的 proxy 位址／CIDR 或 proxy-addr preset 清單。**絕不設成 `true` 或跳數。** `true` 會讓 `req.ip` 變成 `X-Forwarded-For` 最左邊的那一筆，也就是呼叫者自己宣稱的值，所以任何附加而不是覆寫該 header 的入口，都會讓攻擊者偽造店內 IP、繞過打卡 IP 白名單；跳數則會在公開 API 與 Next.js rewrite 的鏈長不同時失效。依位址信任與鏈長無關，偽造的那一筆會直接變成 `req.ip`，再被白名單拒絕。未設定代表 `false`：`req.ip` 是 socket 對端，所以白名單會 fail closed，每個 throttler（以及 better-auth 的預設限制）都會略過，直到設定真正的 proxy 範圍，並用偽造的 header 對公開 API、Next.js rewrite、自訂網域與 onrender.com 路徑驗證過。參考：[Express behind proxies](https://expressjs.com/en/guide/behind-proxies/)。
- Client IP — throttler 與打卡白名單讀的是 `clientIp`（`src/common/trusted-proxy.ts`）。設定 `CLIENT_IP_HEADER` 時，只有該 header 恰好是單一 IP 才回傳它，否則什麼都不回（絕不回 `req.ip` 或 `X-Forwarded-For`），所以打卡會被拒絕；未設定時回傳 `req.ip`。只有在每個請求都經過 Cloudflare（`CF-Connecting-IP`）到達 API 時才設定它：任何繞過 Cloudflare 的路徑（包括 onrender.com 子網域）都能讓呼叫者偽造這個 header，所以必須先停用該子網域或讓它無法連線。經過 Next `/api/*` rewrite 的瀏覽器呼叫會帶著 Vercel 的出口 IP，所以要等前端改為直接呼叫 API 後才設定（#209）。Next app 的伺服器端呼叫也會帶著 Next 伺服器的出口 IP（或直接呼叫 onrender.com 時不帶 header，也就是 `ip:missing`）；為了維持每位訪客各自的 bucket，前台的伺服器端呼叫會在 `x-forwarded-client-ip` 送出訪客 IP，並在 `x-client-ip-forward-secret` 送出 `CLIENT_IP_FORWARD_SECRET`。`forwardedClientIp` 只有在 secret 相符且值為單一 IP 時才回傳該 IP；throttler tracker 與 better-auth（其限流器與 session IP）會讀它，打卡白名單絕不讀，所以這個 secret 不能替店內 IP 背書。throttler 會略過 WebSocket 訊息。better-auth 自己的限流器（`/api/auth/*`，Nest guard 看不到）用同一個 `rateLimitClientIp`：`BetterAuthModule` 的 middleware 會移除呼叫者送來的任何 `x-biru-client-ip`，並在 `rateLimitEnabled()` 時把它設為那個 IP；`advanced.ipAddress.ipAddressHeaders` 只讀這個 header。`rateLimitEnabled()` 為 false 時永遠不會設定這個 header，所以 session 不存 IP，且一條 `customRules` catch-all 會拿掉所有限制，只留下較嚴格的內建限制（登入、註冊、密碼與驗證信）以及 `max` 低於預設 100 的 plugin 規則（例如會員資料匯出的 3 次／60 秒，`src/auth/export-user-data.ts`），這些此時會全平台每個路徑共用一個 bucket；設定 `CLIENT_IP_HEADER` 才會讓它們依 client 分 bucket。`/two-factor/send-otp` 有自己的 3 次／60 秒 `customRules` 項目，放在 catch-all 之前：better-auth 套用第一個符合路徑的 key。
- 另外套用：`helmet`、`cookieParser`，CORS 限定 `NEXT_URL` + `NEXT_ADMIN_URL` 並允許 credentials
- 點餐與候位的 QR session 以及共享購物車的參與者 cookie，走 `setSiteCookie`／`clearSiteCookie`（`src/common/utils/cookies.ts`）：在 production 設在 `.birucoffee.com`，也就是 better-auth `crossSubDomainCookies` 的網域，所以透過前端 `/api` rewrite 設定的 cookie，在瀏覽器直接呼叫 API host 時也會送到（#209）。stage（`stage.birucoffee.com`、`stage-admin.birucoffee.com`）與 production 共用這個網域，所以這些 cookie 和 session cookie 一樣會送到兩邊。production 以外它們是 host-only，在本機可行是因為 cookie 不看 port（[RFC 6265 §8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)）。前端必須看得到的新 cookie 要走同樣的 helper，用 `siteCookieName` 命名；網域改變的 cookie 也要換新名稱（因此有 `_v2` 名稱）：瀏覽器會保留舊副本並先送出它，而 `cookie-parser` 只保留同名的第一個值，所以舊副本會蓋住新的。Socket.io handshake 只有在它們是網域範圍時才會帶上，所以 socket 需要這類 cookie 證明的東西時，仍要在 HTTP 回應中回傳簽章 token，並像 `joinOrder` 一樣在訊息 body 以 `accessToken` 送出；WebSocket filter 會從 `cause.data` 移除這個 key，所以不要取別的名稱
- `I18nMiddleware` 由 `I18nModule.configure()` 掛在每個路由上；不要在這裡加 `app.use(I18nMiddleware)`：Express 收到的是 class，會把它當成錯誤處理器（constructor 參數數 > 3），一般請求永遠不會執行它

### 環境變數（Environment Variables）

沒有 `.env.example`。`ConfigModule.forRoot` 在開機時用 `src/env.validation.ts` 的 Zod schema 驗證環境變數，所以缺少或格式錯誤的變數會讓 app 停止，並列出每個失敗的名稱（絕不列出它的值）。新變數必須加進該 schema，並寫上程式碼實際需要的規則。`.env` 必填：

- `DATABASE_URL` — PostgreSQL 連線字串（在 `src/db/index.ts` 直接透過 `process.env` 讀取）
- `BETTER_AUTH_SECRET`／`BETTER_AUTH_URL` — 由 better-auth 隱含讀取
- `GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET` — Google OAuth
- `MAIL_HOST`／`MAIL_USER`／`MAIL_PASS` — SMTP，除非 `MAIL_PREVIEW=true`（改用 jsonTransport + 本機預覽），否則必填
- `ECPAY_BASE_MERCHANT_ID`／`ECPAY_BASE_HASH_KEY`／`ECPAY_BASE_HASH_IV`／`ECPAY_BASE_RETURN_URL` — AIO 結帳
- `ECPAY_INVOICE_MERCHANT_ID`／`ECPAY_INVOICE_HASH_KEY`／`ECPAY_INVOICE_HASH_IV` — 發票
- `ECPAY_OPERATION_MODE` — 選擇 ECPay 測試或正式端點。也控制每個 `@Cron`：local、stage 與 production 共用一個資料庫，所以 cron 工作只在它為 `Production` 時執行（每個 `@Cron` 都必須傳 `disabled: !CRON_ENABLED`），除非設定了 `CRON_ENABLED`。已經依環境區分的 `@Interval` 工作不受控制
- `CRON_ENABLED` — `true`／`false`；覆寫上面 `ECPAY_OPERATION_MODE` 的規則。環境共用一個資料庫時不要設定，否則 cron 會在它上面跑兩次（#573）
- `COOKIE_PREFIX` — 英文字母、數字、`-` 或 `_`；better-auth 的 `advanced.cookiePrefix`（未設定則維持 `better-auth`），也以 `<prefix>.<name>` 用在每個 site cookie 名稱上，呼叫端在設定或讀取前都用 `siteCookieName` 包起來，讓用另一個資料庫的環境不會覆寫另一邊在 `.birucoffee.com` 上的 cookie。變更它會讓該環境的所有人登出
- `NEXT_URL` — 前台 origin（CORS + ECPay 導向白名單）
- `NEXT_ADMIN_URL` — 後台 origin（同樣兩個用途）
- `FALLBACK_LANGUAGE` — 預設 i18n 語系（例如 `zh-TW`）；用 `getOrThrow` 讀取
- `TRUSTED_PROXIES` — 以逗號分隔的 proxy 位址／CIDR 或 proxy-addr preset。未設定代表 `trust proxy: false`，打卡 IP 白名單會 fail closed；若 `CLIENT_IP_HEADER` 也未設定，所有 Nest throttler 都會關閉，better-auth 只保留較嚴格的內建限制，且全平台共用（`NODE_ENV=production` 時會在開機時記錄）
- `CLIENT_IP_HEADER` — 存放 client IP 的 header，例如 `CF-Connecting-IP`；優先於 `req.ip`。只有在每個請求都經過 Cloudflare 到達 API 時（onrender.com 已停用）才設定，否則這個 header 可以被偽造
- `CLIENT_IP_FORWARD_SECRET` — 與 biru 前台的伺服器共用（那邊同名，絕不加 `NEXT_PUBLIC_`）；至少 32 bytes 的隨機值。未設定代表忽略轉送的 client IP
- `FIELD_ENCRYPTION_KEYS` — `src/common/utils/field-encryption.ts` 用的 `v3:<base64 32 bytes>,v2:<...>,legacy` 金鑰；第一把用來加密，其餘只用來解密。`legacy`（沒有金鑰）是從 `BETTER_AUTH_SECRET` 推導出的金鑰，寫出不帶前綴的 `iv.tag.ciphertext` 格式；它與 purpose info 字串裡的 `-v1` 無關。未設定的行為等同只有 `legacy`（開機時記錄）；格式錯誤的值會讓 app 在開機時停止。local、stage 與 production 共用一個資料庫，所以只有在每個環境都能解密某把金鑰後，它才能排第一：(1) 每個環境都設為 `legacy,v2:…`；(2) 全部部署完後，改成 `v2:…,legacy`。輪替也一樣：先在每個環境把新金鑰加在第二位，再移到第一位。一旦有帶前綴的密文存在，就絕不能退回不支援它的 build。不帶前綴的密文在重新加密前仍需要 `BETTER_AUTH_SECRET`：新金鑰在每個環境都排第一後，用該環境的 `FIELD_ENCRYPTION_KEYS`、`BETTER_AUTH_SECRET` 與 `BETTER_AUTH_URL` 執行 `pnpm tsx scripts/reencrypt-fields.ts`，它會依金鑰版本計算每個加密欄位的值，以及解密失敗的列數（exit 1）；`--apply` 會用第一把金鑰重新加密，略過期間被改動的列，可以安全地重跑。量化交易的列是各環境獨立的，舊的薪資列只能用寫入它的環境的 secret 解密（在其他環境會算成失敗，直到該環境跑過 `--apply`），所以每個環境都要跑；只有在每個環境都回報沒有需要重新加密的資料後，才能拿掉 `legacy` 或舊金鑰
- `S3_ENDPOINT`／`S3_REGION`／`S3_ACCESS_KEY_ID`／`S3_SECRET_ACCESS_KEY`／`S3_BUCKET` — S3 相容 bucket（Supabase Storage，path-style），存放菜單、banner 與門市照片圖片、會員頭像與門市 logo；六個 S3 變數要全設或全不設：全不設時新圖片仍以 base64 data URL 存在 Postgres，只設一部分會讓 app 在開機時停止
- `S3_PUBLIC_URL` — 該 bucket 的公開 URL 前綴（`https://<project_ref>.supabase.co/storage/v1/object/public/<bucket>`）；上傳後的圖片 URL 是它加上 key
- `SENTRY_DSN` — Sentry 專案 DSN，由 `src/instrument.ts` 在 Nest 開機前直接讀取；未設定代表 Sentry 關閉。只送出 5xx 與非 `HttpException` 的錯誤（來自 `AllExceptionsFilter`／`AllWsExceptionsFilter`），絕不送 4xx，不含 cookie、body、IP、URL query string 或 SQL 參數，只含 user id
- `SENTRY_ENVIRONMENT` — 事件的 Sentry `environment`（例如 `production`、`stage`）
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`／`VAPID_PRIVATE_KEY`／`VAPID_SUBJECT` — Web Push 的 VAPID 金鑰（`npx web-push generate-vapid-keys`；公鑰就是前端同名的變數），以及送給推播服務的 `mailto:` 或 `https:` 聯絡方式；三個要全設或全不設。全不設會關閉推播，所以 `NotificationsService`（`src/push/`）會把每個有 email 的通知改用 email 寄送，其他的（訂單可取餐）就完全不送。設定時，它會推播到收件者的訂閱，只有在沒有訂閱或每個推播都失敗時才寄信，並刪除推播服務回 404／410 的訂閱。它只連線到每個 DNS 位址都是公開位址的推播 host，固定連那些位址，不跟隨 redirect，socket timeout 10 秒
- `PORT` — HTTP port（預設 3001）

`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`JWT_ACCESS_EXPIRES_IN`、`JWT_REFRESH_EXPIRES_IN` 與 `POSTMAN_API_KEY` 存在於 `.env`，但 `src/` 裡沒有任何地方參照它們，是 better-auth 之前留下的。

## 程式碼註解（Code Comments）

**預設：不寫註解。** 不為了解釋而加註解；新程式碼除非被要求，否則零註解。只有在少了它會導致改錯時才寫，內容是程式碼本身表達不出來的後果或前提：

- `// 店家角色不該取得全平台組織清單`（條件式看不出的安全理由）
- `// drizzle 會把 pg 錯誤包成 DrizzleQueryError，原始錯誤碼在 cause`（框架陷阱）

檢驗方式：把它刪掉，一個稱職的人會不會因此改錯？如果老實的答案只是「會比較難懂」，就刪掉。

**例外：官方文件連結是要的。** 程式碼照著官方文件某一頁寫時，不論是套件（Next.js、MUI、better-auth、Drizzle、NestJS…）、外部 API 規格（ECPay、data.gov.tw…）或法規（law.moj.gov.tw），在程式碼上方放該頁的 `// https://…` 連結；整個檔案都照它寫時放在檔案開頭。網站有分版本時指向已安裝的版本。既有連結要保留（除非開發者刪掉了）；程式碼不再照該頁寫時，在同一個改動修正或刪除連結。連結不計入下面「一兩個註解」的訊號。

絕不寫：

- 重述下一行，或重述欄位、常數名稱（在 `allowanceNo` 上寫 `// 綠界折讓單號`）
- 我們對話中的推理，或為自己的取捨辯護
- private helper 的 JSDoc
- 描述程式碼目前在做什麼：下次改動後就會變成謊言

**一個改動加了超過一兩個註解，本身就是訊號**，代表程式碼表達得不夠。改命名或結構，不要旁白。

**絕不加回被刪掉的註解。** 即使某個註解通過上面的檢驗，只要開發者說過那裡不要註解，或那個註解之前被刪過，之後的改動就不能把它加回來；開發者的決定優先於本規則。有話要說就寫在回覆裡，不要寫在程式碼裡。

改動讓既有註解變得不正確時，在同一個改動修正或刪除它；過時的註解比沒有更糟。不要把識別字寫死在註解裡，改名後就會變成錯誤資訊。

## 實作方式（Implementation Approach）

**預設：直接做，不要問（act, don't ask）。** 只有答案會改變資料模型、API 契約，或需要不可逆或對外的動作（共用資料庫的 migration、部署、push）時才問。其他不明確之處，自己決定並繼續，然後在回覆列出所做的假設，讓開發者事後修正。這一條優先於下方引用準則的「If uncertain, ask」。

依以下順序決定：

1. **已安裝版本的官方文件**：先查 `package.json`／`node_modules` 的版本，絕不憑記憶。Next.js（`node_modules/next/dist/docs/`、next-devtools MCP）、MUI（mui-mcp）、better-auth、Drizzle、NestJS、next-intl、SWR、Zod 等。用文件示範的寫法，不用繞路；絕不用文件標為 deprecated 的 API。已安裝套件的 `.d.ts` 是最終依據；部落格、問答等二手資料不能當依據。
2. **本 repo 的既有模式**：文件沒定死時，先用 `rg` 找同 repo 解決同一類問題的既有機制（service、helper、DTO、decorator、guard），有就重用，照最相近實作的結構、命名與位置寫。照抄前先確認它沒有你正在修的缺陷；有的話那部分不要抄，並在 PR 點名那份複本，讓它也被修掉。
3. **最主流的選項**：前兩者都決定不了時。

**勞動法規**：出勤、請假、薪資、加班等涉及勞動法規的計算或規則，PR 要附法條與出處（law.moj.gov.tw 或勞動部公告）；找不到依據就不實作，先向開發者提出。

## Behavioral Guidelines

Vendored from <https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md> (headings demoted one level). Don't add rules here — put project rules in the sections above, so this stays diffable against upstream.

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
