import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { JournalScreen } from "@/features/journal/components/journal-screen";

/**
 * Nothing is fetched here, and `?date=` is read in the browser rather than
 * from the request, so this route stays prerenderable and the tab is
 * prefetched whole rather than only as far as a skeleton.
 *
 * The Suspense boundary is what `useSearchParams` needs in a prerendered
 * route: the build renders the fallback, and the browser fills in the screen
 * once it knows the query string.
 */
export default function JournalPage() {
  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Journal"
        subtitle="One entry a day, plus anything in between"
      />
      <Suspense>
        <JournalScreen />
      </Suspense>
    </>
  );
}
