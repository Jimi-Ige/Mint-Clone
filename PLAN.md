# Mint Clone — Implementation Plan

> Revised 2026-03-26 after expert panel critique.
> Reference repo: [ammarhusain/expense-tracker](https://github.com/ammarhusain/expense-tracker)

---

## Phase 1: Auth + Database Migration

**Goal**: Secure the app and move to a production-grade database before adding bank integrations.

### Tasks
1. Add user registration/login (JWT-based, bcrypt passwords)
2. Protect all `/api/*` routes with auth middleware
3. Migrate from SQLite to PostgreSQL (Azure Database for PostgreSQL, Flexible Server)
4. Use `pg` + `postgres-migrations` for schema management
5. Migrate existing seed data and update all queries
6. Deploy server to Azure App Service, DB to Azure PostgreSQL
7. Add express-rate-limit middleware
8. Write tests for auth flow and all existing endpoints (Jest + supertest)

### Schema Changes
- New `users` table (id, email, password_hash, name, created_at)
- Add `user_id` FK to: accounts, transactions, categories, budgets, savings_goals

### New Dependencies (server)
- `pg`, `jsonwebtoken`, `bcrypt`, `express-rate-limit`, `postgres-migrations`
- `jest`, `supertest`, `@types/jest` (dev)

---

## Phase 2: Plaid Integration

**Goal**: Connect real bank accounts and auto-import transactions.

### 2a: Account Linking
- New `institutions` table (id, user_id, name, plaid_access_token_encrypted, plaid_item_id, cursor, status, last_sync, created_at)
- `POST /api/plaid/create-link-token` — scoped to logged-in user
- `POST /api/plaid/exchange-token` — exchange public token, encrypt access token via Azure Key Vault, store institution + accounts
- React: Plaid Link drop-in component on Settings page
- Handle onSuccess, onExit, onEvent callbacks

### 2b: Transaction Sync
- `POST /api/plaid/sync/:institutionId` — cursor-based incremental sync
- Handle pagination (has_more loop, cap at 50 pages)
- Handle all three response arrays: added, modified, removed
- Map Plaid fields → transactions schema (merchant_name, plaid_category, plaid_transaction_id, pending)
- Deduplicate via upsert on plaid_transaction_id
- Update account balances from Plaid balance data
- Store new cursor after successful sync

### 2c: Webhooks
- `POST /api/plaid/webhook` — handle TRANSACTIONS webhook type
- SYNC_UPDATES_AVAILABLE → trigger auto-sync
- ITEM_ERROR / ITEM_LOGIN_REQUIRED → flag for re-auth
- Verify webhook JWT signature
- Queue events via Azure Service Bus (don't process inline)

### 2d: UI
- Settings: "Link Bank Account" → Plaid Link modal
- Connected accounts list (last sync, status, balance)
- "Sync Now" per institution
- Error states: re-auth needed, institution down, sync failed

### New Dependencies
- `plaid` (Node SDK)
- `@azure/keyvault-secrets`, `@azure/identity` (Key Vault)
- `react-plaid-link` (client)

---

## Phase 3: AI Categorization (Simplified v1)

**Goal**: Auto-categorize transactions using Claude with manual override.

### Tasks
1. Add columns to transactions: ai_category, ai_reason, manual_category
2. Define flat category list (~20 categories — not 55 subcategories)
3. Build Claude prompt: transaction description + merchant + amount + date → category + reason
4. `POST /api/transactions/:id/categorize` — single transaction
5. `POST /api/transactions/categorize-bulk` — all uncategorized, queued with progress
6. Rate limit: max 10 LLM calls/minute, batch with delays
7. Fallback: if Claude fails → mark "Uncategorized" with error reason
8. Effective category: COALESCE(manual_category, ai_category, category_name, 'Uncategorized')
9. UI: "Auto-categorize" button, inline category override dropdown

### New Dependencies
- `@anthropic-ai/sdk`

---

## Phase 4: Enhanced Dashboard + Filters

**Goal**: Rich visualizations and filtering like the original expense-tracker.

### Tasks
1. Rebuild `/api/dashboard` to accept filter params (date range, categories, accounts, amount min/max)
2. Exclude transfer-category transactions from income/expense KPIs
3. Charts: Monthly income vs expenses (bar), Spending by category (treemap/sunburst), Trend line
4. KPIs: Net worth, Monthly net flow, Savings rate, Top merchants
5. Filters: Date range picker, account multi-select, category multi-select — persisted in URL params
6. Responsive design for mobile

---

## Phase 5: CSV Import + Export

**Goal**: Alternative data path for users who don't want Plaid.

### Tasks
1. Import: Drag-and-drop CSV upload, column mapping UI, preview, duplicate detection
2. Export: GET /api/transactions/export?format=csv with current filters
3. Inline editing: Click to edit manual_category and notes on transaction rows
4. Download button on Transactions page

### New Dependencies
- `json2csv` (server), `papaparse` (client)

---

## What Was Cut (and Why)

| Feature | Reason |
|---------|--------|
| NL-to-SQL queries | SQL injection vector by design, low user value |
| S3 backup | Azure PostgreSQL has automated backups |
| Tag system | v2 feature, adds complexity without core value |
| Transfer detection | v2 feature, needs multi-account data first |
| 55-subcategory taxonomy | Flat list works for v1, expand later |

---

## Azure Architecture

```
React SPA (Vite)  →  Azure App Service (Express API)  →  Azure PostgreSQL
                            ↓              ↓
                     Azure Key Vault    Plaid API
                     (tokens, keys)       ↓
                                      Webhooks → Azure Service Bus → Worker

                     Anthropic Claude API (categorization)
```

---

## Estimated Effort

| Phase | Sessions |
|-------|----------|
| Phase 1: Auth + Postgres | 3-4 |
| Phase 2: Plaid | 4-5 |
| Phase 3: AI Categorization | 2 |
| Phase 4: Dashboard | 2 |
| Phase 5: CSV Import/Export | 1-2 |

---

## v2 Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| v2.1 | Azure Deployment (Bicep + CI/CD) | Done |
| v2.2 | Mobile-responsive redesign | Done |
| v2.3 | Recurring transaction detection + bill reminders | Done |
| v2.4 | Transfer detection between accounts | Done |
| v2.5 | Net worth tracking over time | Done |
| v2.6 | Tag system (travel, recurring, refund) | Done |
| v2.7 | Hierarchical subcategory taxonomy | Done |
| v2.8 | Multi-currency support | Done |

---

## v3 Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| v3.1 | Search & advanced filters (date range, amount range, multi-select, saved presets, sort) | Done |
| v3.2 | Spending insights & analytics (trends, comparisons, anomaly detection) | Done |
| v3.3 | Split transactions (multi-category allocation) | Done |
| v3.4 | Scheduled/recurring transactions (auto-create from patterns) | Planned |
| v3.5 | Data export & reports (PDF statements, custom date ranges) | Planned |
| v3.6 | User preferences & onboarding (guided setup, default settings) | Planned |
| v3.7 | Performance & polish (virtualized lists, skeleton loading, optimistic updates) | Planned |
| v3.8 | Testing suite (unit + integration + E2E) | Planned |
