import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import { getGroqClient } from "@/lib/groq";
import HabitLog from "@/models/HabitLog";
import Transaction from "@/models/Transaction";
import JournalEntry from "@/models/JournalEntry";
import Goal from "@/models/Goal";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const userId = session.user.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 1. Aggregate weekly data
  const [habits, transactions, journalEntries, activeGoals] =
    await Promise.all([
      HabitLog.find({ userId, date: { $gte: sevenDaysAgo } }).lean(),
      Transaction.find({
        userId,
        transactionDate: { $gte: sevenDaysAgo },
      }).lean(),
      JournalEntry.find({
        userId,
        date: { $gte: sevenDaysAgo.toISOString().split("T")[0] },
      }).lean(),
      Goal.find({ userId, isArchived: false }).lean(),
    ]);

  // 2. Summarize for prompt (keep tokens lean)
  const habitSummary = summarizeHabits(habits);
  const financeSummary = summarizeTransactions(transactions);
  const journalSummary =
    journalEntries
      .map(
        (e) =>
          `[${e.date}] Mood: ${e.mood || "unset"}. ${
            e.content?.slice(0, 200) || ""
          }`
      )
      .join("\n") || "No journal entries this week.";
  const goalSummary =
    activeGoals
      .map((g) => `${g.title} (${g.overallProgress}% complete)`)
      .join(", ") || "No active goals.";

  const prompt = `You are a personal executive advisor. Analyze the past 7 days and produce a "Sunday Executive Briefing" in exactly this structure:

## 🧭 Compass Review
Summarize goal progress: ${goalSummary}

## 💰 Vault Report
Financial activity this week: ${financeSummary}

## 🌿 Sanctuary Reflection
Journal mood trend and key themes: ${journalSummary}

## 🔥 Habit Performance
${habitSummary}

## ⚡ 3 Actionable Recommendations
Based on the above, give exactly 3 concrete, personalized actions for next week. Be direct, specific, and encouraging. No generic advice.

Keep the entire briefing under 500 words. Use bullet points where appropriate.`;

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
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
    if (!acc[log.habitName]) acc[log.habitName] = { done: 0, missed: 0 };
    log.completed
      ? acc[log.habitName].done++
      : acc[log.habitName].missed++;
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
