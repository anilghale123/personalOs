import { BookOpen } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { PageHeader } from "@/components/page-header";
import { toDateKey } from "@/lib/utils";
import {
  getJournalDay,
  getCalendarMoods,
  getRecentEntries,
} from "@/features/journal/actions";
import { JournalScreen } from "@/features/journal/components/journal-screen";

export const dynamic = "force-dynamic";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default async function JournalPage({ searchParams }) {
  // `?date=` lets the evidence rows on a discovery link straight to the
  // day they were computed from. Anything malformed just opens today.
  const requested = searchParams?.date;
  const today = DATE_KEY.test(requested ?? "") ? requested : toDateKey();
  const now = new Date(`${today}T12:00:00`);
  const from = toDateKey(startOfWeek(startOfMonth(now), { weekStartsOn: 1 }));
  const to = toDateKey(endOfWeek(endOfMonth(now), { weekStartsOn: 1 }));

  const [{ journal, notes, notesTotal, notesHasMore }, calendar, recents] =
    await Promise.all([
      getJournalDay(today),
      getCalendarMoods(from, to),
      getRecentEntries(),
    ]);

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Journal"
        subtitle="One entry a day, plus anything worth capturing in between."
      />
      <JournalScreen
        initialData={{
          date: today,
          journal,
          notes,
          notesTotal,
          notesHasMore,
          calendar,
          recents,
        }}
      />
    </>
  );
}
