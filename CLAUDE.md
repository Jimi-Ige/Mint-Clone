# Mint Clone — Personal Finance Tracker

## Project Overview
A Mint-inspired personal finance tracker with Plaid bank integration, AI-powered categorization, and a modern React dashboard. Deployed on Azure.

## Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + Recharts + Lucide icons
- **Backend**: Express.js + TypeScript
- **Database**: SQLite (migrating to Azure PostgreSQL in Phase 1)
- **Bank Integration**: Plaid API (Node SDK)
- **AI Categorization**: Anthropic Claude API
- **Deployment**: Azure App Service + Azure PostgreSQL + Azure Key Vault
- **Monorepo**: npm workspaces (`client/`, `server/`)

## Architecture
```
client/          React SPA (Vite)
  src/
    components/  UI components organized by feature (layout/, ui/, dashboard/, etc.)
    pages/       Route-level page components
    hooks/       Custom React hooks (useApi, useTheme, etc.)
    context/     React context providers (ThemeContext)
    lib/         Utilities (api.ts, formatters.ts)
    types/       TypeScript interfaces

server/          Express API
  src/
    db/          Database connection, schema, migrations
    routes/      API route handlers (one file per resource)
    middleware/  Express middleware (errorHandler, auth, validate)
```

## Conventions
- **API routes**: RESTful, all under `/api/`. Resource routes return JSON.
- **Database**: All write operations that affect balances must be wrapped in transactions.
- **Components**: One component per file, named exports for utilities, default exports for components.
- **Styling**: Tailwind utility classes. Custom component classes defined in `index.css` (`card`, `btn-primary`, `btn-secondary`, `input`).
- **State management**: No global store. Custom hooks per resource wrapping fetch calls. Theme is the only React Context.
- **Error handling**: Server returns `{ error: string }` on failure. Client `api.ts` throws on non-OK responses.

## Running the App
```bash
npm install          # Install all workspace dependencies
npm run dev          # Start both client (5173) and server (3000) concurrently
```
Vite proxies `/api` requests to the Express server in development.

## Current State
- v1 complete: Dashboard, Transactions (CRUD + filters + pagination), Budget, Goals, Settings
- Notion integration: Mirror databases created in Notion workspace
- Seeded with 6 months of sample data, 15 categories, 1 default account

## Implementation Plan
See `PLAN.md` at the project root for the full phased roadmap.
The plan is also saved in Claude memory for cross-session reference.

## Key Decisions
- Plaid is central to the product — not optional. Real bank data is the core value.
- AI categorization uses flat ~20 categories in v1 (not 55 subcategories).
- Auth is a hard prerequisite before Plaid integration (access tokens are permanent bank credentials).
- NL-to-SQL was explicitly cut for security reasons.
- SQLite → PostgreSQL migration happens in Phase 1 before any Plaid work.
- All secrets (Plaid tokens, API keys) go through Azure Key Vault, never .env in production.
