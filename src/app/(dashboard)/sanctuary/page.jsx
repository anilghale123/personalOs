import { Leaf } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import JournalEntry from "@/models/JournalEntry";
import { SanctuaryClient } from "@/features/sanctuary/components/sanctuary-client";

export const dynamic = "force-dynamic";

export default async function SanctuaryPage() {
  const session = await auth();
  let entries = [];
  if (session?.user?.id) {
    await connectDB();
    const docs = await JournalEntry.find({ userId: session.user.id })
      .sort({ date: -1 })
      .lean();
    entries = JSON.parse(JSON.stringify(docs));
  }

  return (
    <>
      <PageHeader
        icon={Leaf}
        title="Sanctuary"
        subtitle="A distraction-free space to reflect. Everything saves itself."
      />
      <SanctuaryClient initialEntries={entries} />
    </>
  );
}
