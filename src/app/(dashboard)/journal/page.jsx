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

export default async function JournalPage() {
  const today = toDateKey();
  const now = new Date();
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
        subtitle="Write on lokta — your daily anchor for reflection."
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
