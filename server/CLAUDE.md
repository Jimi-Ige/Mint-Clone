# Server — Express API

## Stack
Express.js + TypeScript + SQLite (migrating to PostgreSQL in Phase 1)

## Structure
- `src/index.ts` — App bootstrap, middleware, route mounting, static file serving
- `src/routes/` — One file per resource (accounts, categories, transactions, budgets, goals, dashboard)
- `src/db/connection.ts` — Database singleton (currently better-sqlite3, will become pg Pool)
- `src/db/schema.ts` — Table creation + seed data
- `src/middleware/` — Error handler, auth (coming Phase 1), validation

## Conventions
- All routes mounted under `/api/`. Each route file exports an Express Router.
- No ORM. Direct SQL queries via `db.prepare().run/get/all()`.
- Write operations affecting balances MUST use `db.transaction()` for atomicity.
- Errors return `{ error: string }` JSON. Use the centralized errorHandler middleware.
- In production, Express serves `client/dist/` static files and handles SPA fallback.

## API Endpoints
- `GET/POST /api/accounts` — CRUD
- `GET/POST /api/categories` — CRUD
- `GET/POST /api/transactions` — CRUD + filters (startDate, endDate, categoryId, type, search, page, limit)
- `GET/POST /api/budgets` — CRUD (with spent amount calculated via subquery)
- `GET/POST/PATCH /api/goals` — CRUD + `/goals/:id/contribute`
- `GET /api/dashboard` — Aggregated stats (balance, income, expenses, savings rate, charts data)

## Database
- SQLite file at `server/data/finance.db` (gitignored)
- WAL mode enabled, foreign keys enforced
- Tables: accounts, categories, transactions, budgets, savings_goals
- Indexes on transactions: date, category_id, account_id, type
