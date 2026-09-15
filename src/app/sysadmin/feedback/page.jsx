import { feedbackCounts, listFeedback } from "@/features/feedback/admin-service";
import { FeedbackInbox } from "@/features/admin/components/feedback-inbox";

export const dynamic = "force-dynamic";

export const metadata = { title: "Feedback · Admin" };

const STATUSES = ["new", "read", "archived", "all"];

export default async function FeedbackPage({ searchParams }) {
  const params = await searchParams;
  const status = STATUSES.includes(params?.status) ? params.status : "new";

  const [initial, counts] = await Promise.all([
    listFeedback({ status }),
    feedbackCounts(),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What users have told us, newest first. Notes are internal and never
          shown to the sender.
        </p>
      </header>

      <FeedbackInbox
        key={status}
        status={status}
        counts={counts}
        initial={initial}
      />
    </div>
  );
}
