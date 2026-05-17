# Senior Full-Stack Architect Prompt: "Personal Operating System" (Super App)

## Role & Mission

You are an elite Senior Full-Stack Engineer. Your task is to architect and implement a **"Personal Operating System"** — a unified Super App that consolidates financial wealth tracking, daily habit/journaling, and complex project milestones into a single cohesive dashboard powered by Groq AI.

**DO NOT** write placeholder text, lorem ipsum, marketing copy, or generic UI shells. Every component you output must be **production-grade, wired to real data, and immediately runnable**.

---

## Exact Tech Stack (Non-Negotiable)

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router, Server Components) |
| Language | JavaScript (ES2022+, JSDoc for type hints, NO TypeScript) |
| Database | MongoDB via Mongoose ODM |
| UI Library | shadcn/ui (Radix UI primitives + Tailwind CSS) |
| State Management | Zustand (v4+) with persist middleware |
| AI | Groq SDK (`groq-sdk` npm package) |
| Charts | Recharts (habit heatmaps, portfolio curves) |
| Job Scheduling | Vercel Cron Jobs (via `vercel.json`) |
| Auth | NextAuth.js v5 (App Router compatible) |
| File Handling | `papaparse` for CSV import, `multer` or Next.js built-in for uploads |

---

## Modular Directory Structure

Implement this **exact** folder layout. Do not flatten or reorganize it:

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.jsx
│   ├── (dashboard)/
│   │   ├── layout.jsx                  # Shared sidebar + nav shell
│   │   ├── page.jsx                    # Root redirect → /compass
│   │   ├── compass/
│   │   │   ├── page.jsx                # Goals & Habit Tracker UI
│   │   │   └── [goalId]/page.jsx       # Drill-down: sub-milestones
│   │   ├── vault/
│   │   │   ├── page.jsx                # Portfolio overview
│   │   │   ├── sip/page.jsx            # SIP manager
│   │   │   └── import/page.jsx         # CSV broker import UI
│   │   ├── sanctuary/
│   │   │   └── page.jsx                # Distraction-free journal editor
│   │   └── oracle/
│   │       └── page.jsx                # Groq AI weekly briefing dashboard
│   └── api/
│       ├── auth/[...nextauth]/route.js
│       ├── cron/
│       │   └── scrape-nepse/route.js   # GET — Vercel cron, scrapes NEPSE prices
│       ├── ai/
│       │   └── briefing/route.js       # POST — Groq weekly executive summary
│       ├── vault/
│       │   ├── import/route.js         # POST — CSV broker import
│       │   └── sip/route.js            # GET/POST — SIP CRUD
│       ├── compass/
│       │   ├── goals/route.js          # GET/POST goals
│       │   └── habits/route.js         # GET/POST habit logs
│       └── sanctuary/
│           └── entries/route.js        # GET/POST journal entries
├── lib/
│   ├── mongoose.js                     # MongoDB singleton connection
│   ├── groq.js                         # Groq SDK singleton
│   └── auth.js                         # NextAuth config
├── models/
│   ├── User.js
│   ├── Goal.js
│   ├── HabitLog.js
│   ├── StockPrice.js
│   ├── Transaction.js
│   ├── SIP.js
│   └── JournalEntry.js
└── features/
    ├── vault/
    │   ├── actions.js                  # Server actions: CSV parse, SIP calc, portfolio math
    │   └── store.js                    # Zustand: optimistic portfolio updates
    ├── compass/
    │   ├── actions.js                  # Server actions: goal CRUD, habit logging
    │   └── store.js                    # Zustand: heatmap data, goal tree state
    └── sanctuary/
        └── store.js                    # Zustand: local-first journal, background sync
```

---

## Module 1 — The Compass (Goals & Habits)

### Mongoose Schema: `Goal`

```js
// models/Goal.js
import mongoose from 'mongoose'

const MilestoneSchema = new mongoose.Schema({
  title: { type: String, required: true },
  targetValue: Number,          // e.g., 120 (hours of reading practice)
  currentValue: { type: Number, default: 0 },
  unit: String,                 // e.g., 'hours', 'band score', 'pages'
  dueDate: Date,
  isComplete: { type: Boolean, default: false },
  notes: String,
})

const GoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },        // e.g., 'IELTS Preparation'
  category: {
    type: String,
    enum: ['study', 'health', 'finance', 'career', 'personal'],
    required: true,
  },
  targetDate: Date,
  overallProgress: { type: Number, default: 0 },  // 0–100 percent, auto-computed
  milestones: [MilestoneSchema],
  // Band score tracking (IELTS-style structured sub-scores)
  subScores: [{
    label: String,   // 'Reading', 'Writing', 'Speaking', 'Listening'
    target: Number,  // e.g., 7.0
    current: Number, // e.g., 6.5
  }],
  isArchived: { type: Boolean, default: false },
}, { timestamps: true })

// Auto-compute overallProgress before save
GoalSchema.pre('save', function (next) {
  if (this.milestones.length > 0) {
    const completed = this.milestones.filter(m => m.isComplete).length
    this.overallProgress = Math.round((completed / this.milestones.length) * 100)
  }
  next()
})
```

### Mongoose Schema: `HabitLog`

```js
// models/HabitLog.js
import mongoose from 'mongoose'

const HabitLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  habitName: { type: String, required: true },   // e.g., 'Morning Run'
  date: { type: Date, required: true },           // Store as UTC midnight for consistent grouping
  completed: { type: Boolean, default: false },
  value: Number,                                  // Optional: e.g., 5.2 (km run), 30 (mins meditated)
  unit: String,                                   // e.g., 'km', 'minutes'
  note: String,
}, { timestamps: true })

// Compound index: one log per habit per day per user
HabitLogSchema.index({ userId: 1, habitName: 1, date: 1 }, { unique: true })

// Index for heatmap queries (range scans over date)
HabitLogSchema.index({ userId: 1, date: 1 })
```

### Zustand Store: Compass (`features/compass/store.js`)

```js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCompassStore = create(
  persist(
    (set, get) => ({
      goals: [],
      habitLogs: [],            // Last 365 days, loaded once on mount
      heatmapData: {},          // { 'YYYY-MM-DD': { [habitName]: boolean } }

      setGoals: (goals) => set({ goals }),

      // Optimistic habit toggle — UI updates instantly
      toggleHabit: (habitName, dateStr, completed) => {
        const prev = get().heatmapData
        set({
          heatmapData: {
            ...prev,
            [dateStr]: { ...(prev[dateStr] || {}), [habitName]: completed },
          },
        })
        // Background sync
        fetch('/api/compass/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ habitName, date: dateStr, completed }),
        }).catch(() => {
          // Rollback on failure
          set({ heatmapData: prev })
        })
      },
    }),
    { name: 'compass-store', partialize: (state) => ({ heatmapData: state.heatmapData }) }
  )
)
```

### Heatmap Query (Server Action)

```js
// features/compass/actions.js
'use server'
import connectDB from '@/lib/mongoose'
import HabitLog from '@/models/HabitLog'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function getHeatmapData(habitName) {
  const session = await getServerSession(authOptions)
  await connectDB()
  const since = new Date()
  since.setFullYear(since.getFullYear() - 1)

  const logs = await HabitLog.find({
    userId: session.user.id,
    habitName,
    date: { $gte: since },
  }).select('date completed value').lean()

  // Shape into { 'YYYY-MM-DD': { completed, value } } for Recharts/custom heatmap
  return logs.reduce((acc, log) => {
    const key = log.date.toISOString().split('T')[0]
    acc[key] = { completed: log.completed, value: log.value }
    return acc
  }, {})
}
```

---

## Module 2 — The Vault (Wealth & Finance)

### Mongoose Schema: `StockPrice`

```js
// models/StockPrice.js
import mongoose from 'mongoose'

const StockPriceSchema = new mongoose.Schema({
  ticker: { type: String, required: true, uppercase: true },  // 'CHCL', 'SAHAS', 'HIDCL'
  date: { type: Date, required: true },
  closePrice: { type: Number, required: true },
  openPrice: Number,
  highPrice: Number,
  lowPrice: Number,
  volume: Number,
  source: { type: String, default: 'nepse-scraper' },
}, { timestamps: true })

StockPriceSchema.index({ ticker: 1, date: -1 }, { unique: true })
```

### Mongoose Schema: `Transaction`

```js
// models/Transaction.js
import mongoose from 'mongoose'

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ticker: { type: String, required: true, uppercase: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  quantity: { type: Number, required: true },
  pricePerUnit: { type: Number, required: true },
  totalAmount: Number,             // pricePerUnit * quantity (auto-computed)
  brokerCommission: Number,
  transactionDate: { type: Date, required: true },
  broker: { type: String, default: 'Midas' },  // e.g., 'Midas Stock Broking'
  csvRowRef: String,               // Original CSV row hash for deduplication on re-import
  notes: String,
}, { timestamps: true })

TransactionSchema.pre('save', function (next) {
  this.totalAmount = this.pricePerUnit * this.quantity
  next()
})

// Prevent duplicate CSV imports
TransactionSchema.index({ userId: 1, csvRowRef: 1 }, { unique: true, sparse: true })
```

### Mongoose Schema: `SIP`

```js
// models/SIP.js
import mongoose from 'mongoose'

const SIPSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fundName: { type: String, required: true },    // e.g., 'NMB Saral Bachat Fund-E'
  ticker: String,                                // Optional NEPSE ticker if listed
  monthlyAmount: { type: Number, required: true }, // e.g., 1000 (NPR)
  currency: { type: String, default: 'NPR' },
  startDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  // Track each installment
  installments: [{
    date: Date,
    amountInvested: Number,
    navAtPurchase: Number,   // Net Asset Value per unit
    unitsPurchased: Number,
  }],
}, { timestamps: true })
```

### NEPSE Scraper Cron Route

```js
// app/api/cron/scrape-nepse/route.js
import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongoose'
import StockPrice from '@/models/StockPrice'

const TICKERS = ['CHCL', 'SAHAS', 'HIDCL']

// Called daily at 6PM NPT by Vercel Cron
export async function GET(request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()
  const results = []

  for (const ticker of TICKERS) {
    try {
      // NEPSE's unofficial JSON endpoint (adjust URL/headers as needed)
      const res = await fetch(
        `https://nepalstock.com.np/api/nots/nepse-data/todaysprice?&size=500&businessDate=${getTodayNPT()}`,
        { headers: { 'Accept': 'application/json' }, next: { revalidate: 0 } }
      )
      const data = await res.json()
      const stockData = data?.content?.find(s => s.symbol === ticker)

      if (stockData) {
        await StockPrice.findOneAndUpdate(
          { ticker, date: new Date(getTodayNPT()) },
          {
            closePrice: stockData.closingPrice,
            openPrice: stockData.openPrice,
            highPrice: stockData.highPrice,
            lowPrice: stockData.lowPrice,
            volume: stockData.totalTradedQuantity,
          },
          { upsert: true, new: true }
        )
        results.push({ ticker, status: 'ok' })
      }
    } catch (err) {
      results.push({ ticker, status: 'error', message: err.message })
    }
  }

  return NextResponse.json({ scraped: results, at: new Date().toISOString() })
}

function getTodayNPT() {
  // Nepal is UTC+5:45 — compute correct date
  const now = new Date()
  const nptOffset = 5 * 60 + 45 // minutes
  const npt = new Date(now.getTime() + nptOffset * 60 * 1000)
  return npt.toISOString().split('T')[0]
}
```

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/scrape-nepse",
      "schedule": "15 12 * * 1-5"
    }
  ]
}
```

### CSV Import Server Action

```js
// features/vault/actions.js
'use server'
import Papa from 'papaparse'
import crypto from 'crypto'
import connectDB from '@/lib/mongoose'
import Transaction from '@/models/Transaction'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Parses a Midas broker CSV and upserts transactions.
 * Expected CSV columns (Midas format):
 * Date, Symbol, Transaction Type, Quantity, Rate, Amount, Commission
 */
export async function importBrokerCSV(formData) {
  const session = await getServerSession(authOptions)
  const file = formData.get('file')
  const text = await file.text()
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })

  await connectDB()
  let imported = 0
  let skipped = 0
  const errors = []

  for (const row of data) {
    try {
      const rowHash = crypto
        .createHash('md5')
        .update(JSON.stringify(row))
        .digest('hex')

      await Transaction.findOneAndUpdate(
        { userId: session.user.id, csvRowRef: rowHash },
        {
          userId: session.user.id,
          ticker: row['Symbol']?.trim().toUpperCase(),
          type: row['Transaction Type']?.toUpperCase().includes('BUY') ? 'BUY' : 'SELL',
          quantity: parseFloat(row['Quantity']),
          pricePerUnit: parseFloat(row['Rate']),
          brokerCommission: parseFloat(row['Commission'] || '0'),
          transactionDate: new Date(row['Date']),
          broker: 'Midas',
          csvRowRef: rowHash,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      imported++
    } catch (err) {
      if (err.code === 11000) skipped++ // Duplicate
      else errors.push({ row, error: err.message })
    }
  }

  return { imported, skipped, errors }
}

/**
 * Computes portfolio summary: total invested, current value, P&L per ticker
 */
export async function getPortfolioSummary(userId) {
  await connectDB()
  const StockPrice = (await import('@/models/StockPrice')).default

  const transactions = await Transaction.find({ userId }).lean()
  const tickers = [...new Set(transactions.map(t => t.ticker))]

  const latestPrices = await StockPrice.aggregate([
    { $match: { ticker: { $in: tickers } } },
    { $sort: { date: -1 } },
    { $group: { _id: '$ticker', closePrice: { $first: '$closePrice' } } },
  ])
  const priceMap = Object.fromEntries(latestPrices.map(p => [p._id, p.closePrice]))

  return tickers.map(ticker => {
    const txns = transactions.filter(t => t.ticker === ticker)
    const totalUnits = txns.reduce((sum, t) => sum + (t.type === 'BUY' ? t.quantity : -t.quantity), 0)
    const totalInvested = txns
      .filter(t => t.type === 'BUY')
      .reduce((sum, t) => sum + t.totalAmount + (t.brokerCommission || 0), 0)
    const currentValue = totalUnits * (priceMap[ticker] || 0)
    return {
      ticker,
      totalUnits,
      totalInvested,
      currentValue,
      pnl: currentValue - totalInvested,
      pnlPercent: totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0,
    }
  })
}
```

### Zustand Store: Vault (`features/vault/store.js`)

```js
import { create } from 'zustand'

export const useVaultStore = create((set, get) => ({
  portfolio: [],
  sips: [],
  isImporting: false,
  importResult: null,

  setPortfolio: (portfolio) => set({ portfolio }),

  // Optimistic SIP add
  addSIP: (sip) => {
    const tempId = `temp-${Date.now()}`
    const optimistic = { ...sip, _id: tempId, isOptimistic: true }
    set({ sips: [...get().sips, optimistic] })

    return fetch('/api/vault/sip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sip),
    })
      .then(r => r.json())
      .then(saved => {
        set({
          sips: get().sips.map(s => (s._id === tempId ? saved : s)),
        })
      })
      .catch(() => {
        set({ sips: get().sips.filter(s => s._id !== tempId) })
      })
  },

  importCSV: async (formData) => {
    set({ isImporting: true })
    const { importBrokerCSV } = await import('./actions')
    const result = await importBrokerCSV(formData)
    set({ isImporting: false, importResult: result })
    return result
  },
}))
```

---

## Module 3 — The Sanctuary (Local-First Journaling)

### Mongoose Schema: `JournalEntry`

```js
// models/JournalEntry.js
import mongoose from 'mongoose'

const JournalEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },  // 'YYYY-MM-DD' — one entry per day
  content: { type: String, default: '' },  // Rich text or Markdown
  mood: {
    type: String,
    enum: ['amazing', 'good', 'okay', 'bad', 'awful'],
  },
  tags: [String],                          // e.g., ['productive', 'stressed']
  wordCount: Number,
  isSynced: { type: Boolean, default: true },
}, { timestamps: true })

JournalEntrySchema.index({ userId: 1, date: 1 }, { unique: true })
```

### Zustand Store: Sanctuary (`features/sanctuary/store.js`)

```js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useSanctuaryStore = create(
  persist(
    (set, get) => ({
      entries: {},              // { 'YYYY-MM-DD': { content, mood, tags, isSynced } }
      activeDate: new Date().toISOString().split('T')[0],
      syncQueue: [],            // Dates pending background sync

      setActiveDate: (date) => set({ activeDate: date }),

      // Instant local write — no waiting for DB
      updateEntry: (date, patch) => {
        const entries = get().entries
        const current = entries[date] || { content: '', mood: null, tags: [] }
        const updated = { ...current, ...patch, isSynced: false }

        set({
          entries: { ...entries, [date]: updated },
          syncQueue: [...new Set([...get().syncQueue, date])],
        })

        // Debounced background sync (1.5s after last keystroke)
        clearTimeout(get()._syncTimer)
        const timer = setTimeout(() => get()._flushSync(date), 1500)
        set({ _syncTimer: timer })
      },

      _flushSync: async (date) => {
        const entry = get().entries[date]
        if (!entry || entry.isSynced) return

        try {
          await fetch('/api/sanctuary/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, ...entry }),
          })
          set({
            entries: {
              ...get().entries,
              [date]: { ...get().entries[date], isSynced: true },
            },
            syncQueue: get().syncQueue.filter(d => d !== date),
          })
        } catch {
          // Entry stays in syncQueue; retry on next mount
        }
      },

      // Call on app mount to flush any unsynced entries from previous session
      flushAll: async () => {
        const queue = get().syncQueue
        for (const date of queue) await get()._flushSync(date)
      },
    }),
    {
      name: 'sanctuary-store',
      // Only persist entries and queue — not timers
      partialize: (state) => ({ entries: state.entries, syncQueue: state.syncQueue }),
    }
  )
)
```

---

## Module 4 — The Oracle (Groq AI Weekly Briefing)

### Groq Singleton (`lib/groq.js`)

```js
import Groq from 'groq-sdk'

let groq

export function getGroqClient() {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groq
}
```

### Weekly Briefing API Route

```js
// app/api/ai/briefing/route.js
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import { getGroqClient } from '@/lib/groq'
import HabitLog from '@/models/HabitLog'
import Transaction from '@/models/Transaction'
import JournalEntry from '@/models/JournalEntry'
import Goal from '@/models/Goal'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const userId = session.user.id
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 1. Aggregate weekly data
  const [habits, transactions, journalEntries, activeGoals] = await Promise.all([
    HabitLog.find({ userId, date: { $gte: sevenDaysAgo } }).lean(),
    Transaction.find({ userId, transactionDate: { $gte: sevenDaysAgo } }).lean(),
    JournalEntry.find({
      userId,
      date: { $gte: sevenDaysAgo.toISOString().split('T')[0] },
    }).lean(),
    Goal.find({ userId, isArchived: false }).lean(),
  ])

  // 2. Summarize for prompt (keep tokens lean)
  const habitSummary = summarizeHabits(habits)
  const financeSummary = summarizeTransactions(transactions)
  const journalSummary = journalEntries
    .map(e => `[${e.date}] Mood: ${e.mood || 'unset'}. ${e.content?.slice(0, 200)}`)
    .join('\n')
  const goalSummary = activeGoals
    .map(g => `${g.title} (${g.overallProgress}% complete)`)
    .join(', ')

  const prompt = `You are a personal executive advisor. Analyze the past 7 days and produce a "Sunday Executive Briefing" in exactly this structure:

## 🧭 Compass Review
Summarize goal progress: ${goalSummary}

## 💰 Vault Report  
Financial activity this week: ${financeSummary}

## 🌿 Sanctuary Reflection
Journal mood trend and key themes: ${journalSummary}

## 🔥 Habit Performance
${habitSummary}

## ⚡ 3 Actionable Recommendations
Based on the above, give exactly 3 concrete, personalized actions for next week. Be direct, specific, and encouraging. No generic advice.

Keep the entire briefing under 500 words. Use bullet points where appropriate.`

  const groq = getGroqClient()
  const completion = await groq.chat.completions.create({
    model: 'llama3-70b-8192',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 800,
    stream: false,
  })

  return NextResponse.json({
    briefing: completion.choices[0].message.content,
    generatedAt: new Date().toISOString(),
    dataWindow: { from: sevenDaysAgo.toISOString(), to: new Date().toISOString() },
  })
}

function summarizeHabits(logs) {
  const grouped = logs.reduce((acc, log) => {
    if (!acc[log.habitName]) acc[log.habitName] = { done: 0, missed: 0 }
    log.completed ? acc[log.habitName].done++ : acc[log.habitName].missed++
    return acc
  }, {})
  return Object.entries(grouped)
    .map(([name, { done, missed }]) => `${name}: ${done}/7 days completed`)
    .join(', ')
}

function summarizeTransactions(txns) {
  if (!txns.length) return 'No transactions this week.'
  const total = txns.reduce((sum, t) => sum + (t.totalAmount || 0), 0)
  const buys = txns.filter(t => t.type === 'BUY').length
  const sells = txns.filter(t => t.type === 'SELL').length
  return `${txns.length} trades (${buys} buys, ${sells} sells), total volume: NPR ${total.toLocaleString()}`
}
```

---

## Module 5 — MongoDB Connection Singleton

```js
// lib/mongoose.js
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) throw new Error('MONGODB_URI is not defined in .env.local')

let cached = global.mongoose || { conn: null, promise: null }

export default async function connectDB() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      dbName: 'personal-os',
    })
  }

  cached.conn = await cached.promise
  global.mongoose = cached
  return cached.conn
}
```

---

## Environment Variables (`.env.local`)

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
GROQ_API_KEY=gsk_...
CRON_SECRET=<generate with: openssl rand -hex 32>
```

---

## shadcn/ui Component Conventions

- Use `shadcn/ui` as the **sole** component library. Do NOT import from Radix directly.
- Install components via CLI: `npx shadcn@latest add card button input badge progress tabs sheet dialog`
- The Sidebar nav should use `Sheet` for mobile, fixed layout for desktop.
- Journal editor: use a bare `<Textarea>` from shadcn with auto-resize (`onInput` height adjustment).
- Habit heatmap: build a custom `HabitHeatmap` component using `Recharts` `<ResponsiveContainer>` + a grid of colored `<rect>` SVG elements. Do not use a third-party heatmap library.

### Heatmap Data Shape for Recharts

```js
// Expected shape for the 365-day heatmap
const heatmapData = Array.from({ length: 365 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (364 - i))
  const key = date.toISOString().split('T')[0]
  return {
    date: key,
    count: habitLogs[key]?.completed ? 1 : 0,
    // 0 = missed, 1 = done (can extend to 0-4 intensity levels)
  }
})
```

---

## Critical Architectural Rules

1. **Never import Mongoose models directly in Client Components.** All DB access goes through Server Actions (`'use server'`) or Route Handlers.
2. **Zustand stores are client-only.** Initialize them in `'use client'` components wrapped in a `StoreProvider`.
3. **Cron security:** Always validate `Authorization: Bearer ${CRON_SECRET}` before processing cron requests.
4. **CSV dedup:** Use MD5 hash of raw CSV row as `csvRowRef` to prevent duplicate imports on re-runs.
5. **Date handling:** Store all `HabitLog.date` and `JournalEntry.date` in UTC. Display in local timezone using `Intl.DateTimeFormat`. Nepal Standard Time is UTC+5:45 — handle NPT offsets explicitly in the NEPSE scraper.
6. **Groq prompt efficiency:** Summarize data server-side before sending to Groq. Never send raw Mongoose documents — extract only the fields that matter. Keep prompts under 1500 tokens to stay in the free-tier context window.
7. **MongoDB indexes:** All schemas above include compound indexes. Run `mongoose.syncIndexes()` in development; in production, manage indexes via Atlas UI or migration scripts.

---

## Implementation Order

Build in this sequence to unblock the critical path:

```
1. lib/mongoose.js + lib/auth.js + models (all schemas)
2. /api routes (CRUD only, no business logic yet)
3. features/*/store.js (Zustand stores)
4. features/*/actions.js (Server Actions + business logic)
5. (dashboard)/layout.jsx + sidebar nav
6. compass/ UI (heatmap + goal tree)
7. vault/ UI (portfolio table + SIP manager + CSV import)
8. sanctuary/ UI (journal editor with optimistic sync)
9. oracle/ UI (briefing display + trigger button)
10. api/cron/scrape-nepse (NEPSE scraper + vercel.json)
```

---

*This prompt is self-contained. Each section maps 1:1 to a file in the directory structure. Implement sequentially, validate each module's API route with a REST client before wiring the UI.*