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

/** Shared shell so Money and Habits read as two halves of one briefing. */
function BriefingCard({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="rounded-3xl bg-sage-200 px-6 py-6 sm:px-[34px] sm:py-7">
      <h2 className="flex items-center gap-2 font-display text-[20px] text-sage-900">
        <Icon className="h-[18px] w-[18px] text-sage-700" />
        {title}
      </h2>
      {subtitle ? (
        <p className="mb-3.5 mt-0.5 text-[13px] text-sage-800">{subtitle}</p>
      ) : (
        <div className="mb-3.5" />
      )}
      {children}
    </section>
  );
}

/**
 * Money, in plain words — the first thing on the home screen, because it
 * is the thing people open this app to check.
 *
 * Monthly, not weekly: the bills that move this number are monthly, and
 * so is every budget the user set, so a week-long window kept reading as
 * alarm when nothing was actually wrong. The label names the month in
 * the user's own calendar, which for a Nepali month is the only way the
 * dates behind the number are not a mystery.
 */
export function MoneyBriefing({ briefing }) {
  const notes = briefing?.moneyNotes ?? [];

  return (
    <BriefingCard
      icon={Wallet}
      title="Your money this month"
      subtitle={briefing?.monthLabel}
    >
      {notes.length > 0 ? (
        <NoteList notes={notes} />
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

      <Link
        href="/app/budget/expenses"
        className="mt-4 inline-flex min-h-[40px] items-center rounded-full bg-sage-300/70 px-4 text-sm font-medium text-sage-900 transition-colors hover:bg-sage-300"
      >
        Open Money
      </Link>
    </BriefingCard>
  );
}

/**
 * Habits and goals, grouped rather than enumerated. The sentences arrive
 * ready-made from the server; this component only renders them.
 */
export function HabitsBriefing({ briefing }) {
  const notes = briefing?.habitNotes ?? [];

  return (
    <BriefingCard icon={ListChecks} title="Your habits &amp; goals">
      {notes.length > 0 ? (
        <NoteList notes={notes} />
      ) : (
        <p className="text-[15px] leading-[1.65] text-sage-900">
          No goals listed for this week yet.{" "}
          <Link
            href="/app/planner"
            className="text-sage-800 underline underline-offset-[3px] hover:text-sage-900"
          >
            List them in the Planner
          </Link>{" "}
          and your score keeps itself here.
        </p>
      )}

      <Link
        href="/app/planner"
        className="mt-4 inline-flex min-h-[40px] items-center rounded-full bg-sage-300/70 px-4 text-sm font-medium text-sage-900 transition-colors hover:bg-sage-300"
      >
        Open Planner
      </Link>
    </BriefingCard>
  );
}
