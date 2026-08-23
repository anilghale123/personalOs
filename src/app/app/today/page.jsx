import Link from "next/link";
import { format, subDays } from "date-fns";
import {
  ArrowRight,
  Target,
  TrendingUp,
  BookOpen,
  Flame,
} from "lucide-react";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import {
  getWeeklyGoals,
  getAllHeatmapData,
} from "@/features/compass/actions";
import { getPortfolioSummary } from "@/features/vault/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Lifeline } from "@/components/brand-mark";
import { formatNPR, toDateKey } from "@/lib/utils";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** Count consecutive days (ending today) with at least one habit done. */
function computeStreak(heatmap) {
  let count = 0;
  const d = new Date();
  const today = toDateKey();
  while (count < 366) {
    const k = toDateKey(d);
    const done = Object.values(heatmap[k] || {}).some(Boolean);
    if (done) count++;
    else if (k !== today) break;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/**
 * How much of each of the last 7 days is on record: habits kept carry
 * sixty percent, a written entry forty. Zero habits tracked that day
 * means the entry carries the whole bar.
 */
function computeLifeline(heatmap, journalWordCounts) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const key = toDateKey(d);
    const habitEntries = Object.values(heatmap[key] || {});
    const habitsTotal = habitEntries.length;
    const habitsDone = habitEntries.filter(Boolean).length;
    const words = journalWordCounts[key] || 0;
    const habitScore = habitsTotal ? habitsDone / habitsTotal : 0;
    const journalScore = Math.min(words / 150, 1);
    const value =
      habitsTotal > 0 ? habitScore * 0.6 + journalScore * 0.4 : journalScore;
    days.push({ key, label: format(d, "EEEEE"), value });
  }
  return days;
}

export default async function OverviewPage() {
  const session = await auth();
  const today = toDateKey();

  const [weeklyGoals, portfolio, { heatmap }] = await Promise.all([
    getWeeklyGoals(),
    getPortfolioSummary(),
    getAllHeatmapData(),
  ]);

  let todayEntry = null;
  let journalWordCounts = {};
  if (session?.user?.id) {
    await connectDB();
    const weekAgo = toDateKey(subDays(new Date(), 6));
    const [entry, weekEntries] = await Promise.all([
      DailyJournal.findOne({ userId: session.user.id, date: today }).lean(),
      DailyJournal.find({
        userId: session.user.id,
        date: { $gte: weekAgo, $lte: today },
      })
        .select("date content")
        .lean(),
    ]);
    todayEntry = entry;
    journalWordCounts = Object.fromEntries(
      weekEntries.map((e) => [
        e.date,
        (e.content || "").trim() ? (e.content || "").trim().split(/\s+/).length : 0,
      ])
    );
  }

  const allItems = weeklyGoals.flatMap((g) => g.checklistItems || []);
  const doneItems = allItems.filter((i) => i.isComplete).length;
  const weekPct = allItems.length
    ? Math.round((doneItems / allItems.length) * 100)
    : 0;

  const portfolioValue = portfolio.reduce((s, p) => s + p.currentValue, 0);
  const portfolioPnl = portfolio.reduce((s, p) => s + p.pnl, 0);
  const streak = computeStreak(heatmap);
  const firstName = session?.user?.name?.split(" ")[0] || "there";
  const lifelineDays = computeLifeline(heatmap, journalWordCounts);

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Good {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
      </div>

      {/* The Lifeline — the week, as recorded */}
      <Link
        href="/app/journal"
        className="block rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-foreground/20 sm:px-5"
        aria-label="Your week on record — open the journal"
      >
        <div className="flex items-end justify-between gap-4">
          <Lifeline
            values={lifelineDays.map((d) => d.value)}
            className="h-8 w-40 text-brand sm:h-9 sm:w-48"
            animated={false}
          />
          <div className="flex gap-1.5">
            {lifelineDays.map((d) => (
              <span
                key={d.key}
                className="w-5 text-center text-[10px] uppercase text-muted-foreground/80"
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </Link>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* Today's journal */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Today&apos;s journal
            </CardTitle>
            <Link
              href="/app/journal"
              className="flex min-h-[44px] items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-0"
            >
              {todayEntry ? "Continue writing" : "Write"}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {todayEntry?.content?.trim() ? (
              <div className="space-y-2">
                {todayEntry.mood && (
                  <Badge variant="secondary" className="capitalize">
                    {todayEntry.mood}
                  </Badge>
                )}
                <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                  {todayEntry.content}
                </p>
              </div>
            ) : (
              <div className="py-3">
                <p className="text-sm text-muted-foreground">
                  Nothing written yet today.
                </p>
                <Link
                  href="/app/journal"
                  className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-brand hover:underline sm:min-h-0"
                >
                  Start with one honest sentence →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Portfolio */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Portfolio value
            </CardTitle>
            <Link
              href="/app/portfolio"
              className="flex min-h-[44px] items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-0"
            >
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <p className="tnum font-display text-3xl font-semibold">
              {formatNPR(portfolioValue)}
            </p>
            <p
              className={`tnum mt-1 text-sm ${
                portfolioPnl >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {portfolioPnl >= 0 ? "+" : ""}
              {formatNPR(portfolioPnl)} total P&L
            </p>
          </CardContent>
        </Card>

        {/* Weekly goals */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-muted-foreground" />
              This week&apos;s goals
            </CardTitle>
            <Link
              href="/app/goals"
              className="flex min-h-[44px] items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-0"
            >
              Open goals <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="tnum font-display text-3xl font-semibold">
                {weekPct}%
              </span>
              <span className="tnum text-xs text-muted-foreground">
                {doneItems}/{allItems.length} tasks
              </span>
            </div>
            <Progress value={weekPct} className="h-1.5" />
            <div className="space-y-1.5">
              {weeklyGoals.slice(0, 3).map((g) => {
                const items = g.checklistItems || [];
                const pct = items.length
                  ? Math.round(
                      (items.filter((i) => i.isComplete).length /
                        items.length) *
                        100
                    )
                  : 0;
                return (
                  <div
                    key={g._id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-muted-foreground">
                      {g.title}
                    </span>
                    <Badge variant="outline" className="tnum shrink-0">
                      {pct}%
                    </Badge>
                  </div>
                );
              })}
              {weeklyGoals.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No goals set for this week yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Habit streak */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Flame className="h-4 w-4 text-muted-foreground" />
              Habit streak
            </CardTitle>
            <Link
              href="/app/goals"
              className="flex min-h-[44px] items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-0"
            >
              Track <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="tnum font-display text-3xl font-semibold">
                {streak}
              </span>
              <span className="text-sm text-muted-foreground">
                {streak === 1 ? "day" : "days"} in a row
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {streak > 0
                ? "Kept going — nice."
                : "One habit today starts a streak."}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
