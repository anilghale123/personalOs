import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import { getGroqClient } from "@/lib/groq";
import HabitLog from "@/models/HabitLog";
import Transaction from "@/models/Transaction";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";
import Goal from "@/models/Goal";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const userId = session.user.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceKey = sevenDaysAgo.toISOString().split("T")[0];

  // 1. Aggregate weekly data across every module.
  const [habits, transactions, journals, quickNotes, activeGoals] =
    await Promise.all([
      HabitLog.find({ userId, date: { $gte: sevenDaysAgo } }).lean(),
      Transaction.find({
        userId,
        transactionDate: { $gte: sevenDaysAgo },
      }).lean(),
      DailyJournal.find({ userId, date: { $gte: sinceKey } })
        .sort({ date: 1 })
        .lean(),
      QuickNote.find({ userId, date: { $gte: sinceKey } })
        .sort({ createdAt: 1 })
        .lean(),
      Goal.find({ userId, isArchived: false }).lean(),
    ]);

  // 2. Summarise for the prompt (keep tokens lean).
  const habitSummary = summarizeHabits(habits);
  const financeSummary = summarizeTransactions(transactions);
  const journalSummary = summarizeJournal(journals, quickNotes);
  const goalSummary =
    activeGoals
      .map((g) => `${g.title} (${g.overallProgress}% complete)`)
      .join(", ") || "No active goals.";

  const prompt = `You are a calm, perceptive personal advisor. Analyze the past 7 days and produce a "Weekly Review Briefing" in exactly this structure:

## 🎯 Goals Review
Summarize goal progress: ${goalSummary}

## 📈 Portfolio Report
Financial activity this week: ${financeSummary}

## 📓 Journal Reflection
Below are the user's daily journals and quick notes. Daily journals carry the most emotional weight; quick notes add texture and context. Identify emotional trends, recurring stress, repeated topics, positive patterns, gratitude moments, burnout signals, and energy shifts. Then give a short emotional summary, the recurring themes, and one gratitude reflection.

${journalSummary}

## 🔥 Habit Performance
${habitSummary}

## ⚡ 3 Actionable Recommendations
Based on everything above, give exactly 3 concrete, personalized actions for next week. Be direct, specific, warm, and encouraging. No generic advice.

Keep the entire briefing under 550 words. Use bullet points where helpful.`;

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 900,
      stream: false,
    });

    return NextResponse.json({
      briefing: completion.choices[0].message.content,
      generatedAt: new Date().toISOString(),
      dataWindow: {
        from: sevenDaysAgo.toISOString(),
        to: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to generate briefing" },
      { status: 500 }
    );
  }
}

function summarizeHabits(logs) {
  if (!logs.length) return "No habits tracked this week.";
  const grouped = logs.reduce((acc, log) => {
    if (!acc[log.habitName]) acc[log.habitName] = { done: 0 };
    if (log.completed) acc[log.habitName].done++;
    return acc;
  }, {});
  return Object.entries(grouped)
    .map(([name, { done }]) => `${name}: ${done}/7 days completed`)
    .join(", ");
}

function summarizeTransactions(txns) {
  if (!txns.length) return "No transactions this week.";
  const total = txns.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
  const buys = txns.filter((t) => t.type === "BUY").length;
  const sells = txns.filter((t) => t.type === "SELL").length;
  return `${txns.length} trades (${buys} buys, ${sells} sells), total volume: NPR ${total.toLocaleString()}`;
}

/**
 * Build the day-by-day journal context: each day's anchor reflection
 * followed by its quick notes — the AI aggregation format.
 */
function summarizeJournal(journals, quickNotes) {
  if (!journals.length && !quickNotes.length) {
    return "No journal entries or quick notes this week.";
  }

  const notesByDate = {};
  for (const n of quickNotes) {
    (notesByDate[n.date] ||= []).push(n.content);
  }

  const dates = [
    ...new Set([
      ...journals.map((j) => j.date),
      ...Object.keys(notesByDate),
    ]),
  ].sort();

  const journalByDate = Object.fromEntries(
    journals.map((j) => [j.date, j])
  );

  return dates
    .map((date) => {
      const j = journalByDate[date];
      const notes = notesByDate[date] || [];
      const reflection = j?.content?.trim()
        ? `"${j.content.slice(0, 280)}"`
        : "(no long-form entry)";
      const noteLines = notes.length
        ? notes.map((c) => `- "${c.slice(0, 140)}"`).join("\n")
        : "- (none)";
      return `DATE: ${date}\nMood: ${
        j?.mood || "unset"
      }\nDaily Reflection: ${reflection}\nQuick Notes:\n${noteLines}`;
    })
    .join("\n\n");
}
