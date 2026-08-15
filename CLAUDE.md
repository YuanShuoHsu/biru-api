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
| TasksModule         | `src/tasks/`         | Scheduled cleanup cron (daily 3AM, `PLATFORM_TIMEZONE`)           |

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
- `banners.ts` — `banner`
- `invoices.ts` — `invoice`
- `enums.ts` — shared pgEnums (`genders`, `languages`) plus `LocalizedText`, `DEFAULT_LANGUAGE`
- `columns.helpers.ts` — shared column builders

Migrations are in `drizzle/` and applied with Drizzle Kit. The `drizzle.config.ts` at root reads `DATABASE_URL` from `.env`.

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
`AdminCouponsController`, ECPay invoice management.

**2. Organization membership** — `member.role`, a pgEnum of `owner | admin | member`
(`src/db/schema/organizations.ts`). This is the main tenant-scoped mechanism:

- `src/auth/permissions.ts` declares the access-control statements (`coupon`, `menu`, `order`
  × `create|read|update|delete`) and builds `owner` / `admin` / `member` roles via better-auth's
  `createAccessControl`. `isAuthorized(role, action)` is the single entry point.
- `@Roles(action, organizationParam)` (`src/menus/decorators/roles.decorator.ts`) annotates a
  handler, e.g. `@Roles({ order: ['update'] }, 'organizationSlug')`.
- `RolesGuard` (`src/menus/guards/roles.guard.ts`) is registered **globally** as `APP_GUARD` in
  `AppModule`. It resolves the session, derives the `organizationId` from whichever route param
  the decorator named — `organizationId`, `organizationSlug`, or by walking up the menu tree from
  `menuId` / `sectionId` / `menuItemId` / `offerId` / `addOnId` / `groupId` / `modifierId` —
  looks up the caller's `member` row, and calls `isAuthorized`. It also stashes the resolved
  `organizationId` on the request. Handlers **without** `@Roles` are passed through untouched.

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
- `PORT` — HTTP port (default 3001)

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`,
and `POSTMAN_API_KEY` are present in `.env` but referenced nowhere in `src/` — leftovers from
before better-auth.

## Code Comments

**Write a comment only when its absence would cause a mistake** — it states a consequence or precondition that lives outside the code:

- `// 店家角色不該取得全平台組織清單` (security reason the conditional can't show)
- `// drizzle 會把 pg 錯誤包成 DrizzleQueryError，原始錯誤碼在 cause` (framework trap)

Not: restating the next line, conclusions from the chat, or defending your own tradeoffs. Don't hardcode identifiers into comments — they rot into misinformation after a rename.

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
