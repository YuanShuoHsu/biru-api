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

| Module | Path | Purpose |
|--------|------|---------|
| DrizzleModule | `src/drizzle/` | **Global** — injects DB instance via `DRIZZLE` token |
| AuthModule | `src/auth/` | better-auth config + email verification endpoints |
| UsersModule | `src/users/` | User CRUD, profile management |
| StoresModule | `src/stores/` | Store/table/menu management with localized fields |
| EcpayModule | `src/ecpay/` | Payment gateway (checkout + invoices) |
| EventsModule | `src/events/` | WebSocket gateway |
| MailsModule | `src/mails/` | Transactional email sending |
| TasksModule | `src/tasks/` | Scheduled tasks |

### Database Schema
Schema files live in `src/db/schema/`. Three files:
- `users.ts` — `user`, `session`, `account`, `verification` tables (managed by better-auth)
- `stores.ts` — `stores`, `tables`, `menus`
- `orders.ts` — `orders`

Migrations are in `drizzle/` and applied with Drizzle Kit. The `drizzle.config.ts` at root reads `DATABASE_URL` from `.env`.

### Localized Fields
Many domain entities (stores, menus, tables) use a `LocalizedText` JSON type: `{ en, ja, ko, "zh-CN", "zh-TW" }`. The `LocalizedField` DTO in `src/common/dto/` is the shared input shape.

### Dependency Injection Pattern
Services inject the Drizzle DB instance using the `DRIZZLE` injection token:
```typescript
constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}
```

### Roles & Auth
User roles are `admin | manager | staff | user` (enum in `src/db/schema/users.ts`). The `better-auth` instance is configured in `src/auth/index.ts` and mounted at `/api/auth/*`.

### Global Setup (`src/main.ts`)
- API prefix: `/api`
- Swagger docs at: `/api`
- Port: `PORT` env var (default 3001)
- Global pipes: `ValidationPipe` with `transform: true`
- Global filters: `AllExceptionsFilter` (i18n-aware)
- Rate limiting: 10 req / 60s globally

### Environment Variables
Required in `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`
- `MAIL_HOST` / `MAIL_USER` / `MAIL_PASS`
- `ECPAY_*` — ECPay merchant credentials
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `NEXT_URL` — Frontend origin for CORS
- `FALLBACK_LANGUAGE` — Default i18n locale (e.g. `zh-TW`)
