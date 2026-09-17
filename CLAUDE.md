# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm run start:dev       # Start with hot reload
pnpm run build           # Compile TypeScript to ./dist
pnpm run start:prod      # Run production build

# Testing
pnpm run test            # Run unit tests
pnpm run test:watch      # Watch mode
pnpm run test:cov        # Coverage report
pnpm run test:e2e        # End-to-end tests

# Code Quality
pnpm run lint            # ESLint with auto-fix
pnpm run format          # Prettier format

# Database (Drizzle Kit)
pnpm drizzle-kit generate   # Generate migration from schema changes
pnpm drizzle-kit migrate    # Apply pending migrations
pnpm drizzle-kit studio     # Open Drizzle Studio GUI
```

To run a single test file:

```bash
pnpm jest src/users/users.service.spec.ts
```

## Architecture

**Biru Coffee** is a multi-language coffee shop management API (NestJS 11, TypeScript, PostgreSQL).

### Key Stack

- **Framework**: NestJS with Drizzle ORM (PostgreSQL via `pg` driver, Supabase hosted)
- **Auth**: `better-auth` library wrapped in `AuthModule` — handles email/password registration, verification, and Google OAuth
- **i18n**: `nestjs-i18n` supporting `en`, `ja`, `ko`, `zh-CN`, `zh-TW`; resolved via `lang` query param, `x-lang` header, or `Accept-Language`
- **Payments**: ECPay integration (`src/ecpay/`) with AIO checkout and invoice services
- **Real-time**: Socket.io gateway in `src/events/`
- **Email**: Nodemailer + Handlebars templates in `src/mails/`

### Module Map

| Module              | Path                 | Purpose                                                           |
| ------------------- | -------------------- | ----------------------------------------------------------------- |
| DrizzleModule       | `src/drizzle/`       | **Global** — injects DB instance via `DRIZZLE` token              |
| AuthModule          | `src/auth/`          | better-auth config, access-control statements, email verification |
| OrganizationsModule | `src/organizations/` | Organizations (tenants), teams, members                           |
| UsersModule         | `src/users/`         | User CRUD, admin-only user list with data-grid filters            |
| MenusModule         | `src/menus/`         | Menus, sections, items, offers, add-ons, modifiers                |
| OrdersModule        | `src/orders/`        | Order lifecycle, payment recording, menu-item sales reporting     |
| CouponsModule       | `src/coupons/`       | Coupons, user wallets (`userCoupon`), claim / grant / redeem      |
| PointsModule        | `src/points/`        | Loyalty point transactions and redemption                         |
| BannersModule       | `src/banners/`       | Marketing banners (public read + admin CRUD)                      |
| DonateCodesModule   | `src/donate-codes/`  | Invoice donation code lookup                                      |
| GcisModule          | `src/gcis/`          | 經濟部商工登記查詢 (business number lookup)                       |
| EcpayModule         | `src/ecpay/`         | Payment gateway (AIO checkout + invoices)                         |
| EventsModule        | `src/events/`        | Socket.io gateway (order status / menu updates)                   |
| MailsModule         | `src/mails/`         | Transactional email sending                                       |
| AttendanceModule    | `src/attendance/`    | Employees, shifts, punches, leave requests and balances           |
| PayrollModule       | `src/payroll/`       | Payroll terms, statements, and the official rule-set ingestion    |
| TasksModule         | `src/tasks/`         | Cleanup cron (daily 3AM) + payroll rule ingest (daily 4AM)        |

Most tenant-scoped routes are nested under `organizations/:organizationSlug/...`. Per-user
routes live under `users/me/...` (orders, coupons, points).

`DrizzleController` and `TasksController` are empty `nest generate` scaffolds — they register
routes but expose nothing. Same for the empty `dto/` + `entities/` folders under `drizzle/`,
`tasks/`, `gcis/`, and `organizations/`.

### Database Schema

Schema files live in `src/db/schema/` and are re-exported from `index.ts`:

- `users.ts` — `user`, `session`, `account`, `verification` (managed by better-auth)
- `organizations.ts` — `organization`, `team`, `teamMember`, `member`, `invitation`
- `menus.ts` — `menu`, `menuSection`, `menuItem`, `offer`, `menuItemAddOn`, `modifierGroup`, `modifier`, `menuItemModifierGroup`
- `orders.ts` — `order`, `orderItem`
- `coupons.ts` — `coupon`, `userCoupon`
- `points.ts` — `pointTransaction`
- `attendance.ts` — `attendanceEmployee`, `attendanceShift`, `attendanceEvent`, `attendanceRequest`,
  `attendanceLeaveType`, `attendanceLeaveCase`, `attendanceAudit`, settings and templates
- `payroll.ts` — `payrollRuleSet`, `payrollTerms`, `payrollStatement`
- `banners.ts` — `banner`
- `invoices.ts` — `invoice`
- `enums.ts` — shared pgEnums (`genders`, `languages`) plus `LocalizedText`, `DEFAULT_LANGUAGE`
- `columns.helpers.ts` — shared column builders. Its `timestamps` are `timestamp` **without** time zone;
  the attendance and payroll tables use `withTimezone: true` instead, so don't switch them to the helper.

Migrations are in `drizzle/` and applied with Drizzle Kit. The `drizzle.config.ts` at root reads `DATABASE_URL` from `.env`.

### Payroll Rule Sets

Insurance rates, 投保級距 and 基本工資 are **not** constants in code. `payroll_rule_set` holds one row per
effective period (`effective_from`, `YYYY-MM`) with the rates, the 級距 ladders, the source URLs,
and `rates_carried_from`. `PayrollService.snapshot` resolves the row in force for the statement's
month, so re-drafting an old month always uses that month's rates; a month with no row at all
raises `payrollRuleSetMissing`.

`PayrollRulesService.ingest()` refreshes the ladders from the official open-data APIs — 勞保
分級表 (`data.gov.tw/dataset/6258`) and 健保投保金額分級表 (`data.gov.tw/dataset/20251`), both
discovered through `data.gov.tw/api/v2/rest/dataset/{id}` so new years need no code change. Rates
are carried forward from the previous period rather than guessed, because they are statutory
(勞保 11.5% + 就保 1%, 健保 5.17%, 薪資 5% 就源扣繳) and change only by announcement. An ingested ladder
whose floor or ceiling moves down, or more than doubles, is rejected as a source change and the
previous ladder is kept. The withholding floor is `各類所得扣繳率標準` §13 — 應扣繳稅額 not over NT$2,000 — **not** a salary
threshold. Seeded for 2026-01 in `drizzle/0129_payroll_rule_sets.sql`; refreshed daily by
`TasksService` and on demand via `POST /api/payroll/rule-sets/ingest` (platform admin).

最低工資 has no official API. The monthly figure is taken from the 一般勞工 ladder's first grade, which
the 分級表 ties to it. The hourly figure cannot be derived, so when the monthly one moves the period
gets `unconfirmed: ['minimumHourlyWageCents']` and hourly drafts carry `minimumWageUnconfirmed` until
a platform admin sets the announced value via `PATCH /api/payroll/rule-sets/:effectiveFrom`.

An ingest that fetched both ladders and rejected none stamps `checked_at` on the latest period. A draft whose rule set is
the latest and was not checked on or after the start of the payroll month carries
`payrollRuleSetStale` — a failed January fetch must not silently bill last year's ladder. After deploying
`checked_at`, run one ingest or every draft is held.

勞保 has two ladders: `laborGrades` (一般勞工) and `partTimeLaborGrades` (部分工時勞工, floor NT$11,100),
chosen per employee by `insurance.laborLadder`, which is only accepted when `weeklyMinutes < 2400`; a
draft for an employee whose `weeklyMinutes` later reached 2400 carries `partTimeLadderRequiresPartTime`.
健保 has no part-time ladder — its floor stays 分級表第一級.

If an employee's stored `laborBasis` / `healthBasis` is not a grade in that month's ladder — what
happens every January when 基本工資 moves the floor — the draft carries an
`insuranceBasisOutdated` blocker instead of billing the stale grade.

### Published Payslips

A month with a `published` statement is closed for that employee. Anything that changes what its snapshot
reads — approving a request or a leave cancellation, creating or cancelling a shift, saving terms,
parental returns, moving `hiredAt` / `terminatedAt`, drafting another version — must call
`assertPayrollUnlocked` (`src/attendance/attendance-audit.ts`) first and fails with `payrollLocked`.
Leave approvals lock every month from the leave start onward, because medical and annual leave ledgers
carry into later months.

`PayrollService.reopen` stamps `reopened_at` on a published statement, which drops it out of the lock
so the month can be corrected and re-drafted; publishing the new version closes the month again.

### Attendance Audit

Attendance and payroll changes are audited by `writeAudit` (`src/attendance/attendance-audit.ts`) into
`attendance_audit`, **not** by `@Audit` / `audit_log`. The row is written inside the same transaction as the
change, and it is kept 60 months — 勞基法 §30 requires attendance records for five years, while `audit_log`
is purged after 12. Don't add `@Audit` to attendance or payroll handlers, and don't move these rows into
`audit_log`.

The attendance record tables and `payroll_*` reference `organization` with `ON DELETE restrict` (like
`order`), so an organization holding them cannot be deleted; don't switch them back to cascade.

### Weekly Hours

`attendanceEmployee.weeklyMinutesHistory` is the effective-dated record of the employee's contracted
hours; the `weekly_minutes` column is only a copy taken at the last save, so it goes stale once a
future-dated change takes effect. Never read or prorate from that column —
resolve the hours for the date that governs the entitlement with `weeklyMinutesAt` /`weeklyMinutesOf`
(`src/attendance/employee-hours.ts`). 特別休假 and the yearly 事假 / 家庭照顧假 / 病假 quotas are granted
at the period start (勞基法 §38: the right vests when the period is reached), so `annualLeavePeriod` and
`statutoryLeavePeriod` resolve the hours at `period.start` and a later change cannot shrink leave already
granted. Medical-leave day conversion resolves per day, event leave at the case start, the part-time
ladder at the payroll month. Changing the hours needs `weeklyMinutesFrom`, which cannot precede `hiredAt`
and locks like any other payroll-affecting change.

### Scheduled Breaks

`attendance_shift.break_starts_at/break_ends_at` (templates: `break_start_time/break_end_time`) mark the
scheduled break. Unless `paidBreak`, it is not working time: leave minutes, leave pay deductions, medical
leave units and the hourly scheduled hours all go through `scheduledWorkIntervals`, never the raw shift span.
A shift without a break keeps its whole span as working time.

### Localized Fields

Menu entities (menus, sections, items, modifiers) store localized copy as `jsonb` typed with
`LocalizedText` — `Partial<Record<Language, string>>`, i.e. `{ en, ja, ko, "zh-CN", "zh-TW" }`,
defined in `src/db/schema/enums.ts`. The `LocalizedField` DTO in `src/common/dto/` is the shared input shape.

### Dependency Injection Pattern

Services inject the Drizzle DB instance using the `DRIZZLE` injection token:

```typescript
constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}
```

### Roles & Auth

The `better-auth` instance is configured in `src/auth/index.ts` (admin, organization, and
multiSession plugins) and mounted at `/api/auth/*`. There are **two separate authorization
layers** — don't confuse them:

**1. Platform admin** — `user.role` (plain `text` column on `user`, set to `'user'` on signup).
Guarded by `AdminGuard` (`src/common/guards/admin.guard.ts`), which only passes for
`role === 'admin'`. Used for cross-tenant endpoints: `UsersController`, `AdminBannersController`,
`AdminCouponsController`, `AdminPayrollRulesController`, ECPay invoice management.

**2. Organization membership** — `member.role`, a pgEnum of `owner | admin | member`
(`src/db/schema/organizations.ts`). This is the main tenant-scoped mechanism:

- `src/auth/permissions.ts` declares the access-control statements (`coupon`, `menu`, `order`
  × `create|read|update|delete`) and builds `owner` / `admin` / `member` roles via better-auth's
  `createAccessControl`. `isAuthorized(role, action)` is the single entry point.
  `better-auth/plugins/access` is ESM-only, so jest cannot load this module: a spec whose subject
  imports `isAuthorized` must `jest.mock('src/auth/permissions', ...)` (the attendance services spec does).
- `@Roles(action, organizationParam)` (`src/menus/decorators/roles.decorator.ts`) annotates a
  handler, e.g. `@Roles({ order: ['update'] }, 'organizationSlug')`.
- `RolesGuard` (`src/menus/guards/roles.guard.ts`) is registered **globally** as `APP_GUARD` in
  `AppModule`. It resolves the session, derives the `organizationId` from whichever route param
  the decorator named — `organizationId`, `organizationSlug`, or by walking up the menu tree from
  `menuId` / `sectionId` / `menuItemId` / `offerId` / `addOnId` / `groupId` / `modifierId` —
  looks up the caller's `member` row, and calls `isAuthorized`. It also stashes the resolved
  `organizationId` on the request. Handlers **without** `@Roles` are passed through untouched.
- `@OrganizationMember(organizationParam)` (same file) runs the same guard without an action: any
  `member` of the organization passes. Use it for self-service routes (punching, own requests, own
  payslips) and scope the data to the caller's own employee row in the service.

When adding a tenant-scoped route whose param isn't already covered, extend both the
`OrganizationParam` union and the `resolveOrganizationId` switch.

Controllers often carry a class-level `@AllowAnonymous()` (from `@thallesp/nestjs-better-auth`)
while individual handlers add `@Roles(...)` or `@UseGuards(AdminGuard)` — the guards run
independently of `@AllowAnonymous`, so this combination is intentional, not a hole.

### Global Setup (`src/main.ts`)

- API prefix: `/api`
- Swagger docs at: `/api` (currently mounted unconditionally, including in production)
- Port: `PORT` env var (default 3001)
- `bodyParser: false` at the Nest factory — better-auth's module owns body parsing
- Global pipes: `I18nValidationPipe` with `transform`, `whitelist`, `forbidNonWhitelisted`
- Global filters: `AllExceptionsFilter` (i18n-aware; handles both HTTP and WS contexts)
- Global guards (`AppModule`): `RolesGuard`, then `ThrottlerGuard`
- Rate limiting: 100 req / 60s globally
- `trust proxy` — set from `TRUSTED_PROXIES` (`src/common/trusted-proxy.ts`), a comma-separated
  list of proxy addresses/CIDRs or proxy-addr presets. **Never `true` or a hop count.** `true`
  makes `req.ip` the leftmost `X-Forwarded-For` entry, i.e. whatever the caller claims, so any
  ingress that appends rather than overwrites lets an attacker forge the shop IP and defeat the
  attendance allowlist; a hop count breaks whenever the chain length differs between the public
  API and the Next.js rewrite. Trusting by address is chain-length independent and makes a forged
  entry become `req.ip` itself, which the allowlist then rejects. Unset means `false` — `req.ip`
  is the socket peer, so the allowlist fails closed (and `ThrottlerGuard` buckets every caller
  together) until the real proxy range is configured and verified with forged headers against the
  public API, Next.js rewrite, custom-domain and onrender.com paths.
  Reference: [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/).
- Also applied: `helmet`, `cookieParser`, `I18nMiddleware`, hbs view engine, CORS restricted to
  `NEXT_URL` + `NEXT_ADMIN_URL` with credentials

### Environment Variables

There is no `.env.example` and `ConfigModule.forRoot` runs without a `validationSchema`, so a
missing variable fails at request time rather than at boot. Required in `.env`:

- `DATABASE_URL` — PostgreSQL connection string (read directly via `process.env` in `src/db/index.ts`)
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` — read implicitly by better-auth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `MAIL_HOST` / `MAIL_USER` / `MAIL_PASS` — SMTP; `MAIL_PREVIEW=true` switches to jsonTransport + local preview
- `ECPAY_BASE_MERCHANT_ID` / `ECPAY_BASE_HASH_KEY` / `ECPAY_BASE_HASH_IV` / `ECPAY_BASE_RETURN_URL` — AIO checkout
- `ECPAY_INVOICE_MERCHANT_ID` / `ECPAY_INVOICE_HASH_KEY` / `ECPAY_INVOICE_HASH_IV` — invoicing
- `ECPAY_OPERATION_MODE` — ECPay stage vs. production endpoint selection
- `NEXT_URL` — Frontend origin (CORS + ECPay redirect allowlist)
- `NEXT_ADMIN_URL` — Admin frontend origin (same two uses)
- `FALLBACK_LANGUAGE` — Default i18n locale (e.g. `zh-TW`); read with `getOrThrow`
- `TRUSTED_PROXIES` — Comma-separated proxy addresses/CIDRs or proxy-addr presets. Unset means
  `trust proxy: false`, which fails the attendance IP allowlist closed
- `PORT` — HTTP port (default 3001)

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`,
and `POSTMAN_API_KEY` are present in `.env` but referenced nowhere in `src/` — leftovers from
before better-auth.

## Code Comments

**Default: no comment.** Never add one just to explain; new code ships with zero comments unless asked. Write one only when its absence would cause a mistake — it states a consequence or precondition that lives outside the code:

- `// 店家角色不該取得全平台組織清單` (security reason the conditional can't show)
- `// drizzle 會把 pg 錯誤包成 DrizzleQueryError，原始錯誤碼在 cause` (framework trap)

The test: delete it. Would a competent editor now make a wrong change? If the honest answer is only "會比較難懂", leave it deleted.

Never write:

- a restatement of the next line, or of a field/constant name (`// 綠界折讓單號` on `allowanceNo`)
- the reasoning from our conversation, or a defence of your own tradeoff
- JSDoc on a private helper
- a description of what the code currently does — it becomes a lie after the next change

**Adding more than one or two comments to a change is itself the signal** that the code isn't saying enough. Fix the naming or the structure instead; do not narrate.

When a change makes an existing comment false, fix or delete it in the same change — a stale comment is worse than none. Don't hardcode identifiers into comments; they rot into misinformation after a rename.

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
