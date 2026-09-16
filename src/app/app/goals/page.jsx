import { Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CompassScreen } from "@/features/compass/components/compass-screen";

/**
 * Nothing is fetched here: the screen paints what was saved on this device
 * and reads /api/compass/screen behind it, so the route stays prerenderable
 * and the tab is prefetched whole rather than only as far as a skeleton.
 */
export default function GoalsPage() {
  return (
    <>
      <PageHeader
        icon={Target}
        title="Goals & Habits"
        subtitle="The week, your habits, the long game"
      />
      <CompassScreen />
    </>
  );
}
