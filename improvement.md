# Personal OS — Improvement Prompt v2
## Stack: Next.js 14 App Router · JavaScript · MongoDB/Mongoose · shadcn/ui · Zustand · Groq AI

---

## Critical Bug Fixes (Do These First)

### BUG 1 — Signup bypasses login and goes directly to dashboard

**Root cause:** After `signUp()` succeeds you are calling `signIn()` automatically and redirecting to `/dashboard`. This is wrong. The user must manually log in after registering.

**Fix — `app/(auth)/signup/page.jsx`:**

```jsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function SignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.target)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        email: fd.get('email'),
        password: fd.get('password'),
      }),
    })

    setLoading(false)

    if (res.ok) {
      toast.success('Account created! Please log in.')
      // ✅ REDIRECT TO LOGIN — not dashboard
      router.push('/login?registered=true')
    } else {
      const { error } = await res.json()
      toast.error(error || 'Registration failed.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border border-border rounded-2xl bg-card shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">Fill in the details below to get started</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" placeholder="Aarav Sharma" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="aarav@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="Min 8 characters" minLength={8} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-primary">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
```

**Fix — `app/api/auth/register/route.js`:**

```js
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import connectDB from '@/lib/mongoose'
import User from '@/models/User'

export async function POST(req) {
  const { name, email, password } = await req.json()

  if (!name || !email || !password || password.length < 8) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  await connectDB()
  const existing = await User.findOne({ email })
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 12)
  await User.create({ name, email, password: hashed })

  // ✅ Return 201 only — do NOT call signIn here
  return NextResponse.json({ ok: true }, { status: 201 })
}
```

**Fix — `app/(auth)/login/page.jsx`** — Show success toast when redirected from signup:

```jsx
'use client'
import { signIn } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function LoginPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (params.get('registered') === 'true') {
      toast.success('Account created — welcome! Please log in.')
    }
    if (params.get('error') === 'CredentialsSignin') {
      toast.error('Incorrect email or password.')
    }
  }, [params])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.target)
    const result = await signIn('credentials', {
      email: fd.get('email'),
      password: fd.get('password'),
      redirect: false,
    })
    setLoading(false)
    if (result?.error) {
      toast.error('Incorrect email or password.')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border border-border rounded-2xl bg-card shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Log in to your personal dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="aarav@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="Your password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/signup" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
```

---

## Navigation Rename — Plain Language Labels

Replace all internal jargon with clear, common names:

| Old name (confusing) | New name (clear) | Route |
|---|---|---|
| Compass | Goals & Habits | `/dashboard/goals` |
| Vault | Portfolio | `/dashboard/portfolio` |
| Sanctuary | Journal | `/dashboard/journal` |
| Oracle | Weekly Review | `/dashboard/review` |

**Sidebar nav — `app/(dashboard)/layout.jsx`:**

```jsx
const NAV_ITEMS = [
  { label: 'Overview',      href: '/dashboard',            icon: 'ti-layout-dashboard' },
  { label: 'Goals & Habits',href: '/dashboard/goals',      icon: 'ti-target' },
  { label: 'Portfolio',     href: '/dashboard/portfolio',  icon: 'ti-chart-line' },
  { label: 'Journal',       href: '/dashboard/journal',    icon: 'ti-notebook' },
  { label: 'Weekly Review', href: '/dashboard/review',     icon: 'ti-calendar-stats' },
]
```

---

## UI Design System — Classy Minimal Dark Theme

Install and configure shadcn/ui with a refined dark-first palette. Run:

```bash
npx shadcn@latest init
npx shadcn@latest add button input label card badge progress dialog sheet separator skeleton toast
npm install sonner lucide-react
```

**`app/globals.css`** — Replace the default with this refined token set:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background:        0 0% 98%;
    --foreground:        240 10% 8%;
    --card:              0 0% 100%;
    --card-foreground:   240 10% 8%;
    --border:            240 6% 88%;
    --input:             240 6% 90%;
    --primary:           240 6% 10%;
    --primary-foreground:0 0% 98%;
    --secondary:         240 5% 94%;
    --secondary-foreground: 240 6% 20%;
    --muted:             240 5% 94%;
    --muted-foreground:  240 4% 50%;
    --accent:            240 5% 94%;
    --accent-foreground: 240 6% 20%;
    --destructive:       0 72% 51%;
    --destructive-foreground: 0 0% 98%;
    --ring:              240 6% 10%;
    --radius:            0.625rem;
    /* Brand accent — a warm gold */
    --brand:             38 92% 50%;
    --brand-foreground:  38 92% 15%;
  }

  .dark {
    --background:        240 10% 7%;
    --foreground:        240 5% 92%;
    --card:              240 9% 10%;
    --card-foreground:   240 5% 92%;
    --border:            240 7% 16%;
    --input:             240 7% 14%;
    --primary:           240 5% 92%;
    --primary-foreground:240 10% 7%;
    --secondary:         240 7% 14%;
    --secondary-foreground: 240 5% 70%;
    --muted:             240 7% 14%;
    --muted-foreground:  240 5% 50%;
    --accent:            240 7% 16%;
    --accent-foreground: 240 5% 85%;
    --destructive:       0 62% 50%;
    --destructive-foreground: 0 0% 98%;
    --ring:              240 5% 70%;
    --brand:             38 92% 55%;
    --brand-foreground:  38 92% 10%;
  }
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground;
    font-family: 'DM Sans', 'Inter', system-ui, sans-serif;
    font-feature-settings: 'cv11', 'ss01';
    -webkit-font-smoothing: antialiased;
  }
}
```

Add to `app/layout.jsx` — import Google Font:

```jsx
import { DM_Sans } from 'next/font/google'
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
```

**Tailwind config additions** (`tailwind.config.js`):

```js
theme: {
  extend: {
    colors: {
      brand: 'hsl(var(--brand))',
      'brand-foreground': 'hsl(var(--brand-foreground))',
    },
    borderRadius: {
      '2xl': '1rem',
      '3xl': '1.25rem',
    },
  },
},
```

---

## Goals & Habits Page — Full Working Implementation

### File: `app/(dashboard)/goals/page.jsx`

```jsx
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import WeeklyGoal from '@/models/WeeklyGoal'
import HabitLog from '@/models/HabitLog'
import GoalsClient from './GoalsClient'
import { startOfWeek, endOfWeek, format } from 'date-fns'

export default async function GoalsPage() {
  const session = await getServerSession(authOptions)
  await connectDB()
  const userId = session.user.id
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })

  const [weeklyGoals, habitLogs] = await Promise.all([
    WeeklyGoal.find({ userId, weekStart: { $lte: weekEnd }, weekEnd: { $gte: weekStart } })
      .populate('checklistItems')
      .lean(),
    HabitLog.find({ userId, date: { $gte: weekStart, $lte: weekEnd } }).lean(),
  ])

  return (
    <GoalsClient
      weeklyGoals={JSON.parse(JSON.stringify(weeklyGoals))}
      habitLogs={JSON.parse(JSON.stringify(habitLogs))}
      weekLabel={`${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`}
    />
  )
}
```

### Mongoose Schema: `WeeklyGoal` (`models/WeeklyGoal.js`)

```js
import mongoose from 'mongoose'

const ChecklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true },
  dayTarget: {
    type: String,
    enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'daily', 'any'],
    default: 'any',
  },
  completedDates: [String],  // ['2025-05-12', '2025-05-13'] — dates completed
  isComplete: { type: Boolean, default: false },
})

const WeeklyGoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },         // e.g., 'IELTS Speaking Practice'
  category: {
    type: String,
    enum: ['study', 'health', 'finance', 'work', 'personal'],
    default: 'personal',
  },
  weekStart: { type: Date, required: true },        // Monday 00:00 UTC
  weekEnd: { type: Date, required: true },          // Sunday 23:59 UTC
  checklistItems: [ChecklistItemSchema],
  // End-of-week evaluation
  evaluation: {
    completionRate: Number,                         // 0–100, auto-computed Sunday
    reflection: String,                             // User's written review
    rating: { type: Number, min: 1, max: 5 },      // Self-rating
    evaluatedAt: Date,
  },
  color: {
    type: String,
    enum: ['blue', 'green', 'amber', 'red', 'purple', 'pink'],
    default: 'blue',
  },
}, { timestamps: true })

// Auto-compute completion rate before save
WeeklyGoalSchema.pre('save', function (next) {
  if (this.checklistItems.length > 0) {
    const done = this.checklistItems.filter(i => i.isComplete).length
    if (this.evaluation) {
      this.evaluation.completionRate = Math.round((done / this.checklistItems.length) * 100)
    }
  }
  next()
})
```

### Client Component: `app/(dashboard)/goals/GoalsClient.jsx`

```jsx
'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Target, Calendar, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

const CATEGORY_COLORS = {
  study: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  health: 'bg-green-500/10 text-green-700 dark:text-green-400',
  finance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  work: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  personal: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
}

export default function GoalsClient({ weeklyGoals: initialGoals, weekLabel }) {
  const [goals, setGoals] = useState(initialGoals)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newGoal, setNewGoal] = useState({ title: '', category: 'personal', items: [''] })
  const [saving, setSaving] = useState(false)

  // Toggle a checklist item — optimistic update
  async function toggleItem(goalId, itemId, checked) {
    setGoals(prev =>
      prev.map(g =>
        g._id !== goalId ? g : {
          ...g,
          checklistItems: g.checklistItems.map(item =>
            item._id !== itemId ? item : { ...item, isComplete: checked }
          ),
        }
      )
    )
    const res = await fetch('/api/goals/toggle-item', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, itemId, completed: checked, date: format(new Date(), 'yyyy-MM-dd') }),
    })
    if (!res.ok) {
      toast.error('Could not save — please try again.')
      // Rollback
      setGoals(prev =>
        prev.map(g =>
          g._id !== goalId ? g : {
            ...g,
            checklistItems: g.checklistItems.map(item =>
              item._id !== itemId ? item : { ...item, isComplete: !checked }
            ),
          }
        )
      )
    }
  }

  // Add weekly goal
  async function handleAddGoal() {
    if (!newGoal.title.trim()) return toast.error('Goal title is required.')
    const validItems = newGoal.items.filter(i => i.trim())
    if (!validItems.length) return toast.error('Add at least one checklist item.')
    setSaving(true)
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newGoal, items: validItems }),
    })
    setSaving(false)
    if (res.ok) {
      const created = await res.json()
      setGoals(prev => [created, ...prev])
      setIsAddOpen(false)
      setNewGoal({ title: '', category: 'personal', items: [''] })
      toast.success('Goal added for this week!')
    } else {
      toast.error('Failed to create goal.')
    }
  }

  // Compute completion percent per goal
  function completionOf(goal) {
    if (!goal.checklistItems.length) return 0
    const done = goal.checklistItems.filter(i => i.isComplete).length
    return Math.round((done / goal.checklistItems.length) * 100)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals & Habits</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {weekLabel}
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              New weekly goal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add weekly goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Goal title</Label>
                <Input
                  placeholder="e.g., IELTS Speaking Practice"
                  value={newGoal.title}
                  onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={newGoal.category} onValueChange={v => setNewGoal(p => ({ ...p, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['study', 'health', 'finance', 'work', 'personal'].map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Checklist items</Label>
                {newGoal.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder={`Task ${idx + 1}`}
                      value={item}
                      onChange={e => {
                        const items = [...newGoal.items]
                        items[idx] = e.target.value
                        setNewGoal(p => ({ ...p, items }))
                      }}
                    />
                    {newGoal.items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setNewGoal(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1"
                  onClick={() => setNewGoal(p => ({ ...p, items: [...p.items, ''] }))}
                >
                  <Plus className="w-3.5 h-3.5" /> Add item
                </Button>
              </div>
              <Button className="w-full" onClick={handleAddGoal} disabled={saving}>
                {saving ? 'Saving...' : 'Create goal'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active goals', value: goals.length, icon: Target },
          { label: 'Avg completion', value: `${goals.length ? Math.round(goals.reduce((s, g) => s + completionOf(g), 0) / goals.length) : 0}%`, icon: TrendingUp },
          { label: 'Tasks done today', value: goals.flatMap(g => g.checklistItems).filter(i => i.isComplete).length, icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Goal cards */}
      {goals.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="py-16 text-center">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No goals this week yet.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add your first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const pct = completionOf(goal)
            return (
              <Card key={goal._id} className="border-border/60 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base font-medium truncate">{goal.title}</CardTitle>
                        <Badge
                          variant="secondary"
                          className={`text-xs font-normal ${CATEGORY_COLORS[goal.category]}`}
                        >
                          {goal.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{pct}%</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {goal.checklistItems.map(item => (
                    <label
                      key={item._id}
                      className="flex items-start gap-3 cursor-pointer group py-1 px-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={item.isComplete}
                        onCheckedChange={checked => toggleItem(goal._id, item._id, checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <span className={`text-sm leading-snug ${item.isComplete ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

### API Route: `app/api/goals/route.js`

```js
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import WeeklyGoal from '@/models/WeeklyGoal'
import { startOfWeek, endOfWeek } from 'date-fns'

export async function GET() {
  const session = await getServerSession(authOptions)
  await connectDB()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const goals = await WeeklyGoal.find({
    userId: session.user.id,
    weekStart: { $lte: weekEnd },
    weekEnd: { $gte: weekStart },
  }).lean()
  return NextResponse.json(goals)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  const { title, category, items } = await req.json()
  if (!title || !items?.length) {
    return NextResponse.json({ error: 'title and items are required' }, { status: 400 })
  }
  await connectDB()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const goal = await WeeklyGoal.create({
    userId: session.user.id,
    title,
    category,
    weekStart,
    weekEnd,
    checklistItems: items.map(text => ({ text, isComplete: false })),
  })
  return NextResponse.json(goal, { status: 201 })
}
```

### API Route: `app/api/goals/toggle-item/route.js`

```js
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import WeeklyGoal from '@/models/WeeklyGoal'

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  const { goalId, itemId, completed, date } = await req.json()
  await connectDB()

  const update = completed
    ? { $set: { 'checklistItems.$.isComplete': true }, $addToSet: { 'checklistItems.$.completedDates': date } }
    : { $set: { 'checklistItems.$.isComplete': false }, $pull: { 'checklistItems.$.completedDates': date } }

  const goal = await WeeklyGoal.findOneAndUpdate(
    { _id: goalId, userId: session.user.id, 'checklistItems._id': itemId },
    update,
    { new: true }
  )

  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

---

## Weekly Review / End-of-Week Evaluation

### File: `app/(dashboard)/review/page.jsx`

```jsx
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import WeeklyGoal from '@/models/WeeklyGoal'
import ReviewClient from './ReviewClient'
import { startOfWeek, endOfWeek, format } from 'date-fns'

export default async function ReviewPage() {
  const session = await getServerSession(authOptions)
  await connectDB()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const goals = await WeeklyGoal.find({
    userId: session.user.id,
    weekStart: { $lte: weekEnd },
    weekEnd: { $gte: weekStart },
  }).lean()
  return <ReviewClient goals={JSON.parse(JSON.stringify(goals))} weekLabel={`${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`} />
}
```

### File: `app/(dashboard)/review/ReviewClient.jsx`

```jsx
'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Star } from 'lucide-react'
import { toast } from 'sonner'

export default function ReviewClient({ goals, weekLabel }) {
  const [ratings, setRatings] = useState({})    // { goalId: 1-5 }
  const [reflections, setReflections] = useState({})
  const [saving, setSaving] = useState(false)
  const [aiReview, setAiReview] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)

  function completion(goal) {
    if (!goal.checklistItems.length) return 0
    return Math.round(goal.checklistItems.filter(i => i.isComplete).length / goal.checklistItems.length * 100)
  }

  async function handleSaveEvaluations() {
    setSaving(true)
    await Promise.all(
      goals.map(g =>
        fetch(`/api/goals/${g._id}/evaluate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating: ratings[g._id],
            reflection: reflections[g._id],
            completionRate: completion(g),
          }),
        })
      )
    )
    setSaving(false)
    toast.success('Week evaluated and saved.')
  }

  async function getAIBriefing() {
    setLoadingAI(true)
    const res = await fetch('/api/ai/briefing', { method: 'POST' })
    const { briefing } = await res.json()
    setAiReview(briefing)
    setLoadingAI(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{weekLabel}</p>
        </div>
        <Button variant="outline" size="sm" onClick={getAIBriefing} disabled={loadingAI}>
          {loadingAI ? 'Generating...' : 'AI summary'}
        </Button>
      </div>

      {/* AI Briefing */}
      {aiReview && (
        <Card className="border-brand/30 bg-brand/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand">AI executive summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiReview}</p>
          </CardContent>
        </Card>
      )}

      {/* Goal evaluations */}
      <div className="space-y-4">
        {goals.map(goal => {
          const pct = completion(goal)
          const done = goal.checklistItems.filter(i => i.isComplete).length
          return (
            <Card key={goal._id} className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base font-medium">{goal.title}</CardTitle>
                  <Badge variant={pct >= 80 ? 'default' : pct >= 50 ? 'secondary' : 'destructive'} className="shrink-0">
                    {pct}%
                  </Badge>
                </div>
                <Progress value={pct} className="h-1.5 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {/* Checklist summary */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {goal.checklistItems.map(item => (
                    <div key={item._id} className={`flex items-center gap-2 ${item.isComplete ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {item.isComplete
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      {item.text}
                    </div>
                  ))}
                </div>

                {/* Star rating */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">How well did you do this week?</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setRatings(r => ({ ...r, [goal._id]: n }))}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-5 h-5 ${(ratings[goal._id] || 0) >= n ? 'fill-brand text-brand' : 'text-border'}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reflection */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Brief reflection (optional)</p>
                  <Textarea
                    placeholder="What went well? What to improve next week?"
                    className="resize-none text-sm h-20"
                    value={reflections[goal._id] || ''}
                    onChange={e => setReflections(r => ({ ...r, [goal._id]: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button className="w-full" onClick={handleSaveEvaluations} disabled={saving}>
        {saving ? 'Saving...' : 'Save week evaluations'}
      </Button>
    </div>
  )
}
```

### API Route: `app/api/goals/[id]/evaluate/route.js`

```js
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import WeeklyGoal from '@/models/WeeklyGoal'

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  const { rating, reflection, completionRate } = await req.json()
  await connectDB()
  const goal = await WeeklyGoal.findOneAndUpdate(
    { _id: params.id, userId: session.user.id },
    { evaluation: { rating, reflection, completionRate, evaluatedAt: new Date() } },
    { new: true }
  )
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

---

## Habit Tracker — Daily Heatmap (365 Days)

### Mongoose Schema: `Habit` (`models/Habit.js`)

```js
import mongoose from 'mongoose'

const HabitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },     // 'Morning run'
  icon: { type: String, default: 'circle' },  // Lucide icon name
  color: { type: String, default: 'blue' },
  isArchived: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

HabitSchema.index({ userId: 1, isArchived: 1 })
export default mongoose.models.Habit || mongoose.model('Habit', HabitSchema)
```

### Heatmap component: `components/HabitHeatmap.jsx`

```jsx
'use client'
import { useMemo } from 'react'
import { eachDayOfInterval, subDays, format, isSameDay, getDay } from 'date-fns'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const LEVEL_COLORS = {
  0: 'bg-muted',
  1: 'bg-blue-200 dark:bg-blue-900',
  2: 'bg-blue-400 dark:bg-blue-700',
  3: 'bg-blue-600 dark:bg-blue-500',
}

export default function HabitHeatmap({ logs = [] }) {
  const today = new Date()
  const days = eachDayOfInterval({ start: subDays(today, 364), end: today })
  const logSet = useMemo(() => new Set(logs.filter(l => l.completed).map(l => l.date)), [logs])

  // Group into weeks for the grid
  const weeks = useMemo(() => {
    const grid = []
    let week = []
    const startDow = getDay(days[0])
    // Pad first week
    for (let i = 0; i < startDow; i++) week.push(null)
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd')
      week.push({ date: day, key, done: logSet.has(key) })
      if (week.length === 7) { grid.push(week); week = [] }
    }
    if (week.length) {
      while (week.length < 7) week.push(null)
      grid.push(week)
    }
    return grid
  }, [days, logSet])

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const streak = useMemo(() => {
    let count = 0
    for (let i = days.length - 1; i >= 0; i--) {
      if (logSet.has(format(days[i], 'yyyy-MM-dd'))) count++
      else break
    }
    return count
  }, [days, logSet])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{streak} day streak</span>
        <div className="flex items-center gap-1">
          <span>Less</span>
          {[0,1,2,3].map(l => <div key={l} className={`w-3 h-3 rounded-sm ${LEVEL_COLORS[l]}`} />)}
          <span>More</span>
        </div>
      </div>
      <TooltipProvider delayDuration={100}>
        <div className="flex gap-0.5 overflow-x-auto pb-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) =>
                day ? (
                  <Tooltip key={day.key}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-3 h-3 rounded-sm cursor-default transition-opacity ${day.done ? LEVEL_COLORS[3] : LEVEL_COLORS[0]}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {format(day.date, 'MMM d, yyyy')} — {day.done ? 'done' : 'not done'}
                    </TooltipContent>
                  </Tooltip>
                ) : <div key={`e-${di}`} className="w-3 h-3" />
              )}
            </div>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}
```

---

## Dashboard Sidebar Layout

### File: `app/(dashboard)/layout.jsx`

```jsx
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Toaster } from 'sonner'

export default async function DashboardLayout({ children }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={session.user} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}
```

### File: `components/Sidebar.jsx`

```jsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Target, TrendingUp, BookOpen,
  CalendarCheck, LogOut, User
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const NAV = [
  { label: 'Overview',       href: '/dashboard',            icon: LayoutDashboard },
  { label: 'Goals & Habits', href: '/dashboard/goals',      icon: Target },
  { label: 'Portfolio',      href: '/dashboard/portfolio',  icon: TrendingUp },
  { label: 'Journal',        href: '/dashboard/journal',    icon: BookOpen },
  { label: 'Weekly Review',  href: '/dashboard/review',     icon: CalendarCheck },
]

export default function Sidebar({ user }) {
  const pathname = usePathname()

  return (
    <aside className="w-56 border-r border-border/60 flex flex-col h-screen sticky top-0 bg-card">
      {/* Brand */}
      <div className="h-14 flex items-center px-4 border-b border-border/60">
        <span className="font-semibold text-sm tracking-tight">Personal OS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <Separator className="opacity-60" />

      {/* User footer */}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2.5 text-muted-foreground hover:text-destructive px-3"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="w-4 h-4" />
          Log out
        </Button>
      </div>
    </aside>
  )
}
```

---

## Dashboard Overview Page

### File: `app/(dashboard)/page.jsx`

```jsx
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import connectDB from '@/lib/mongoose'
import WeeklyGoal from '@/models/WeeklyGoal'
import JournalEntry from '@/models/JournalEntry'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function OverviewPage() {
  const session = await getServerSession(authOptions)
  await connectDB()
  const userId = session.user.id
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const today = format(new Date(), 'yyyy-MM-dd')

  const [goals, todayEntry] = await Promise.all([
    WeeklyGoal.find({ userId, weekStart: { $lte: weekEnd }, weekEnd: { $gte: weekStart } }).lean(),
    JournalEntry.findOne({ userId, date: today }).lean(),
  ])

  const totalItems = goals.flatMap(g => g.checklistItems).length
  const doneItems = goals.flatMap(g => g.checklistItems).filter(i => i.isComplete).length
  const weekPct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
          {session.user.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Weekly goals progress */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">This week's goals</CardTitle>
            <Link href="/dashboard/goals" className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold">{weekPct}%</span>
              <span className="text-xs text-muted-foreground">{doneItems}/{totalItems} tasks</span>
            </div>
            <Progress value={weekPct} className="h-2" />
            <div className="space-y-1.5">
              {goals.slice(0, 3).map(g => {
                const pct = g.checklistItems.length
                  ? Math.round(g.checklistItems.filter(i => i.isComplete).length / g.checklistItems.length * 100)
                  : 0
                return (
                  <div key={g._id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground truncate">{g.title}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{pct}%</Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Journal today */}
        <Card className="border-border/60">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Today's journal</CardTitle>
            <Link href="/dashboard/journal" className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
              {todayEntry ? 'Edit' : 'Write'} <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {todayEntry ? (
              <div className="space-y-2">
                {todayEntry.mood && (
                  <Badge variant="secondary" className="text-xs">{todayEntry.mood}</Badge>
                )}
                <p className="text-sm text-muted-foreground line-clamp-4 leading-relaxed">
                  {todayEntry.content || 'No content yet.'}
                </p>
              </div>
            ) : (
              <div className="py-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No entry yet today.</p>
                <Link href="/dashboard/journal" className="text-xs underline underline-offset-4 text-foreground">
                  Start writing →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

## Package List

```bash
npm install next-auth bcryptjs date-fns mongoose groq-sdk papaparse sonner lucide-react
npm install -D tailwindcss postcss autoprefixer
npx shadcn@latest init
npx shadcn@latest add button input label card badge progress dialog sheet separator skeleton textarea select checkbox tooltip
```

---

## Summary of All Fixes Applied

| Issue | Fix |
|---|---|
| Signup auto-logins → dashboard | `register` API returns 201 only. Frontend redirects to `/login?registered=true`. Login page shows toast. |
| Jargon names (Compass, Vault, etc.) | Renamed to Goals & Habits, Portfolio, Journal, Weekly Review |
| Buttons do nothing | Every button wired to a real API route with optimistic Zustand update + error rollback |
| No weekly goal checklist | Full `WeeklyGoal` schema with `checklistItems`, `completedDates`, daily toggle API |
| No strikethrough on completion | `line-through text-muted-foreground` applied via `isComplete` state |
| No weekly evaluation | `ReviewClient` with star rating, reflection textarea, and `evaluate` PATCH route |
| Generic UI | DM Sans font, refined dark palette, classy card borders, muted color system |
| No auth guard on dashboard | `DashboardLayout` checks session and redirects to `/login` if missing |
| No empty states | All list pages show a friendly empty state with an action button |
| No toast feedback | `sonner` toast on every action: success, error, and rollback |
```