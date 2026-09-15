import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** The "Pro" marker shown beside a Pro account's name. */
export function ProBadge({ className }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide text-white shadow-sm",
        className
      )}
      title="Pro plan"
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Pro
    </span>
  );
}
