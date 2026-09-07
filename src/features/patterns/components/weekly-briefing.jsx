"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ListChecks,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TONE_STYLE = {
  praise: { Icon: CheckCircle2, className: "text-sage-700" },
  nudge: { Icon: AlertTriangle, className: "text-clay-700" },
  miss: { Icon: XCircle, className: "text-destructive" },
  info: { Icon: Info, className: "text-sage-700" },
};

function NoteList({ notes }) {
  return (
    <ul className="space-y-2.5">
      {notes.map((n, i) => {
        const { Icon, className } = TONE_STYLE[n.tone] ?? TONE_STYLE.info;
        return (
          <li key={i} className="flex items-start gap-2.5">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
            <p className="text-[15px] leading-[1.65] text-sage-900 sm:text-[17px]">
              {n.text}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Your week, in plain words" — the week's habits and spending said the
 * way an honest friend would say them. The sentences arrive ready-made
 * from the server; this component only renders them.
 */
export function WeeklyBriefing({ briefing }) {
  if (!briefing) return null;
  const { habitNotes = [], moneyNotes = [], hasGoals } = briefing;
  if (!habitNotes.length && !moneyNotes.length && hasGoals) return null;

  return (
    <section className="mt-[34px] rounded-3xl bg-sage-200 px-6 py-7 sm:px-[34px] sm:py-[30px]">
      <h2 className="font-display text-[20px] text-sage-900">
        Your week, in plain words
      </h2>

      <div className="mt-4 space-y-5">
        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sage-800">
            <ListChecks className="h-3.5 w-3.5" />
            Habits &amp; goals
          </h3>
          {habitNotes.length > 0 ? (
            <NoteList notes={habitNotes} />
          ) : (
            <p className="text-[15px] leading-[1.65] text-sage-900">
              No goals listed for this week yet.{" "}
              <Link href="/app/planner" className="text-sage-800 underline underline-offset-[3px] hover:text-sage-900">
                List them in the Planner
              </Link>{" "}
              and your score keeps itself here.
            </p>
          )}
        </div>

        <div className="border-t border-sage-300 pt-4">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sage-800">
            <Wallet className="h-3.5 w-3.5" />
            Money
          </h3>
          {moneyNotes.length > 0 ? (
            <NoteList notes={moneyNotes} />
          ) : (
            <p className="text-[15px] leading-[1.65] text-sage-900">
              Nothing to say about money yet —{" "}
              <Link
                href="/app/budget/expenses"
                className="text-sage-800 underline underline-offset-[3px] hover:text-sage-900"
              >
                log an expense
              </Link>{" "}
              and check back.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
