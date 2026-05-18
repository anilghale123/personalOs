import Link from "next/link";
import { ListChecks, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/** Picks a badge tone from a completion percentage. */
function tone(pct) {
  if (pct >= 80) return "success";
  if (pct >= 50) return "secondary";
  return "destructive";
}

/**
 * Weekly Review section that reports planner results — how many goal
 * days were completed vs. missed across the current week.
 */
export function PlannerReviewSummary({ summary }) {
  const items = summary?.items || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            Weekly Planner Results
          </CardTitle>
          {items.length > 0 && (
            <Badge variant={tone(summary.overall)}>
              {summary.overall}% complete
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No planner goals this week.{" "}
            <Link href="/planner" className="text-primary hover:underline">
              Open the Weekly Planner
            </Link>{" "}
            to set some.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item._id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-2.5 text-xs tabular-nums">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      {item.done}
                    </span>
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <X className="h-3.5 w-3.5" />
                      {item.missed}
                    </span>
                    <Badge variant={tone(item.completion)}>
                      {item.completion}%
                    </Badge>
                  </div>
                </div>
                <Progress value={item.completion} className="h-1.5" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
