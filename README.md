# Personal OS — Your Operating System for Life

A unified Super App that consolidates **financial wealth tracking**, **daily
habits & journaling**, and **goal milestones** into a single, calm dashboard
powered by Groq AI.

Built with a clean, Notion-inspired interface.

## Modules

| Module | Route | Purpose |
|---|---|---|
| 🏠 **Overview** | `/` | At-a-glance dashboard: week progress, journal, portfolio, streak |
| 🎯 **Goals & Habits** | `/goals` | Weekly goal checklists, long-term milestone goals, 365-day habit heatmap |
| 📈 **Portfolio** | `/portfolio` | NEPSE holdings, P&L, SIP manager, CSV import |
| 📓 **Journal** | `/journal` | Distraction-free, local-first journaling |
| 🗓️ **Weekly Review** | `/review` | End-of-week goal evaluation + Groq AI executive briefing |

## Tech Stack

- **Next.js 14** (App Router, Server Components) — JavaScript, no TypeScript
- **MongoDB** via Mongoose ODM
- **shadcn/ui**-style components (Radix UI + Tailwind CSS)
- **Zustand** (v4) with `persist` middleware
- **Groq SDK** for AI briefings
- **Recharts** for portfolio allocation
- **NextAuth.js v5** (credentials provider)
- **papaparse** for broker CSV import
- **Vercel Cron** for the daily NEPSE price scraper

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env.local` and fill in:

   ```bash
   cp .env.example .env.local
   ```

   - `MONGODB_URI` — a MongoDB connection string (Atlas or local)
   - `AUTH_SECRET` / `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `GROQ_API_KEY` — from <https://console.groq.com>
   - `CRON_SECRET` — `openssl rand -hex 32`

3. **Run the dev server**

   ```bash
   npm run dev
   ```

4. Open <http://localhost:3000>, create an account, and you'll land on the
   Compass.

## Project Structure

```
src/
├── app/
│   ├── (auth)/login          → sign-in / sign-up
│   ├── (dashboard)/          → sidebar shell: /, /goals, /portfolio, /journal, /review
│   └── api/                  → auth, cron, ai, vault, compass, weekly-goals, sanctuary
├── lib/                      → mongoose, groq, auth, week, utils singletons
├── models/                   → Mongoose schemas (incl. WeeklyGoal)
├── components/               → UI primitives + shell components
└── features/                 → per-module stores, server actions, UI
```

> Routes use plain-language URLs (`/goals`, `/portfolio`…). Internal feature
> folders keep their original names (`features/compass`, `features/vault`…).

## Notes

- The **NEPSE scraper** (`/api/cron/scrape-nepse`) is wired to run weekdays at
  18:00 NPT via `vercel.json`. It expects the Vercel Cron `Authorization`
  header carrying `CRON_SECRET`.
- The **CSV importer** hashes each row (MD5) so re-importing the same file is
  idempotent — duplicates are skipped, not duplicated.
- The **journal** is local-first: edits persist instantly to `localStorage`
  via Zustand and sync to MongoDB on a 1.5s debounce.
