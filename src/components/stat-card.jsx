import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * Compact metric tile used across dashboards.
 *
 * `onEdit` is optional: pass it when the number shown is something the
 * user can change, and the tile grows a pencil so it can be edited where
 * it is read rather than only from whatever list sits below it.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  onEdit,
  editLabel = "Edit",
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-positive",
    negative: "text-destructive",
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-1">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={editLabel}
              title={editLabel}
              className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
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
