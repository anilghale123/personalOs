import Link from "next/link";
import { format } from "date-fns";
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

export default async function OverviewPage() {
  const session = await auth();
  const today = toDateKey();

  const [weeklyGoals, portfolio, { heatmap }] = await Promise.all([
    getWeeklyGoals(),
    getPortfolioSummary(),
    getAllHeatmapData(),
  ]);

  let todayEntry = null;
  if (session?.user?.id) {
    await connectDB();
    todayEntry = await DailyJournal.findOne({
      userId: session.user.id,
      date: today,
    }).lean();
  }

  const allItems = weeklyGoals.flatMap((g) => g.checklistItems || []);
  const doneItems = allItems.filter((i) => i.isComplete).length;
  const weekPct = allItems.length
    ? Math.round((doneItems / allItems.length) * 100)
    : 0;

  const portfolioValue = portfolio.reduce(
    (s, p) => s + p.currentValue,
    0
  );
  const portfolioPnl = portfolio.reduce((s, p) => s + p.pnl, 0);
  const streak = computeStreak(heatmap);
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Good {greeting()}, {firstName}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Weekly goals */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-muted-foreground" />
              This week&apos;s goals
            </CardTitle>
            <Link
              href="/goals"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold">{weekPct}%</span>
              <span className="text-xs text-muted-foreground">
                {doneItems}/{allItems.length} tasks
              </span>
            </div>
            <Progress value={weekPct} className="h-2" />
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
                    <Badge variant="outline" className="shrink-0">
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

        {/* Today's journal */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Today&apos;s journal
            </CardTitle>
            <Link
              href="/journal"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {todayEntry ? "Edit" : "Write"}{" "}
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
              <div className="py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No entry yet today.
                </p>
                <Link
                  href="/journal"
                  className="mt-1 inline-block text-xs text-foreground underline underline-offset-4"
                >
                  Start writing →
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
              href="/portfolio"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {formatNPR(portfolioValue)}
            </p>
            <p
              className={
                portfolioPnl >= 0
                  ? "mt-1 text-sm text-emerald-600 dark:text-emerald-400"
                  : "mt-1 text-sm text-destructive"
              }
            >
              {portfolioPnl >= 0 ? "+" : ""}
              {formatNPR(portfolioPnl)} total P&L
            </p>
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
              href="/goals"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Track <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{streak}</span>
              <span className="text-sm text-muted-foreground">
                {streak === 1 ? "day" : "days"} in a row
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {streak > 0
                ? "Keep the momentum going."
                : "Complete a habit today to start a streak."}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
