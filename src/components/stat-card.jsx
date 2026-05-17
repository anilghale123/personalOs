import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * Compact metric tile used across dashboards.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = "default" }) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-destructive",
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </Card>
  );
}
