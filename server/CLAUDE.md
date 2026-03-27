# Server — Express API

## Stack
Express.js + TypeScript + PostgreSQL (pg) + Zod validation

## Structure
- `src/index.ts` — App bootstrap, middleware, route mounting, static file serving, graceful shutdown
- `src/routes/` — One file per resource (18 route files)
- `src/db/connection.ts` — PostgreSQL pool (pg) with SSL in production
- `src/db/schema.ts` — Database initialization via migration runner
- `src/db/migrate.ts` — Sequential SQL migration runner with `_migrations` tracking
- `src/db/migrations/` — Versioned `.sql` migration files
- `src/middleware/` — auth, errorHandler, validate, requestLogger, auditLog, envCheck
- `src/schemas.ts` — Centralized Zod schemas for all API input validation
- `src/lib/logger.ts` — Structured logger (JSON in prod, pretty-print in dev)

## Conventions
- All routes mounted under `/api/`. Each route file exports an Express Router.
- No ORM. Direct SQL queries via `pool.query()` with parameterized statements.
- Write operations affecting balances MUST use transactions (`client.query('BEGIN')` / `COMMIT`).
- Errors return `{ error: string }` JSON. Use the centralized errorHandler middleware.
- All mutation endpoints use Zod validation via `validate()` middleware.
- In production, Express serves `client/dist/` static files and handles SPA fallback.

## Security
- Helmet for security headers
- Per-endpoint rate limiting (auth: 10/15min, AI: 5/15min, global: 200/15min)
- JWT auth on all `/api/*` routes (except auth endpoints)
- Env validation at startup (DATABASE_URL, JWT_SECRET required)

## API Endpoints
- `POST /api/auth/register|login` — Authentication
- `GET/POST /api/accounts` — Bank accounts CRUD
- `GET/POST /api/categories` — Categories CRUD (hierarchical)
- `GET/POST /api/transactions` — CRUD + filters + pagination + CSV export
- `GET/POST /api/budgets` — Budget tracking by category/month
- `GET/POST/PATCH /api/goals` — Savings goals + contributions
- `GET /api/dashboard` — Aggregated KPIs and chart data
- `POST /api/plaid/*` — Plaid Link, sync, webhooks
- `GET /api/analytics/*` — Spending trends, comparisons, anomalies
- `GET/POST /api/recurring` — Recurring pattern detection
- `GET/POST /api/transfers` — Inter-account transfers
- `GET /api/snapshots` — Balance snapshots for net worth
- `GET/POST /api/tags` — Transaction tagging
- `GET/POST /api/filter-presets` — Saved filter configurations
- `POST /api/splits` — Split transactions across categories
- `GET /api/reports` — PDF reports and data export
- `GET/POST /api/currency` — Multi-currency exchange rates

## Database
- PostgreSQL via `pg` pool (5 connections dev, 20 production)
- SSL required in production (`rejectUnauthorized: false` for Azure)
- Migrations in `src/db/migrations/` — run at startup or via `npm run migrate`
- 14 tables with 25+ indexes
