# Client — React Frontend

## Stack
React 18 + Vite + TypeScript + Tailwind CSS + Recharts + Lucide React

## Structure
- `src/pages/` — One page per route (DashboardPage, TransactionsPage, etc.)
- `src/components/` — Organized by feature (layout/, ui/, dashboard/, transactions/, etc.)
- `src/hooks/` — Custom hooks. `useApi.ts` is the base data-fetching hook; domain hooks wrap it.
- `src/lib/api.ts` — Fetch wrapper. All requests go through this. Base URL is `/api`.
- `src/context/ThemeContext.tsx` — Dark/light mode. Only global state.
- `src/types/index.ts` — All shared TypeScript interfaces.

## Conventions
- Tailwind utility classes for styling. Reusable classes in `index.css`.
- No global state library. Per-page hooks manage data fetching + mutations.
- Vite proxies `/api` to `http://localhost:3000` in dev.
- Dark mode via `class` strategy on `<html>`. Use `dark:` Tailwind variants.

## Key Components
- `Layout.tsx` — App shell (Sidebar + Topbar + Outlet)
- `Modal.tsx` — Portal-based modal with backdrop + Escape key
- `ProgressBar.tsx` — Reusable progress indicator for budgets/goals
