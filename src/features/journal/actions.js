"use server";

import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";
import { NOTE_PAGE_SIZE } from "@/features/journal/constants";

function plain(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/** The daily anchor journal + quick notes for one day. */
export async function getJournalDay(date) {
  const session = await auth();
  if (!session?.user?.id) {
    return { journal: null, notes: [], notesTotal: 0, notesHasMore: false };
  }
  await connectDB();
  const userId = session.user.id;
  const [journal, notes, notesTotal] = await Promise.all([
    DailyJournal.findOne({ userId, date }).lean(),
    QuickNote.find({ userId, date })
      .sort({ createdAt: 1 })
      .limit(NOTE_PAGE_SIZE)
      .lean(),
    QuickNote.countDocuments({ userId, date }),
  ]);
  return {
    journal: journal ? plain(journal) : null,
    notes: plain(notes),
    notesTotal,
    notesHasMore: notes.length < notesTotal,
  };
}

/**
 * Per-day mood / content map for a date range — powers the calendar.
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to 'YYYY-MM-DD'
 */
export async function getCalendarMoods(from, to) {
  const session = await auth();
  if (!session?.user?.id) return {};
  await connectDB();
  const userId = new mongoose.Types.ObjectId(session.user.id);

  const [journals, noteCounts] = await Promise.all([
    DailyJournal.find({ userId, date: { $gte: from, $lte: to } })
      .select("date mood content title")
      .lean(),
    QuickNote.aggregate([
      { $match: { userId, date: { $gte: from, $lte: to } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
    ]),
  ]);

  const noteMap = Object.fromEntries(
    noteCounts.map((n) => [n._id, n.count])
  );
  const calendar = {};
  for (const j of journals) {
    calendar[j.date] = {
      mood: j.mood || null,
      title: j.title || "",
      hasContent: Boolean(j.content && j.content.trim()),
      noteCount: noteMap[j.date] || 0,
    };
  }
  for (const [date, count] of Object.entries(noteMap)) {
    if (!calendar[date]) {
      calendar[date] = {
        mood: null,
        title: "",
        hasContent: false,
        noteCount: count,
      };
    }
  }
  return calendar;
}

/** Most recently updated journal entries. */
export async function getRecentEntries(limit = 8) {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectDB();
  const entries = await DailyJournal.find({ userId: session.user.id })
    .select("date mood title content updatedAt")
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  return plain(entries);
}
