import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import { getGroqClient, GROQ_CHAT_MODEL } from "@/lib/groq";
import { formatMoney } from "@/lib/money";
import { toDateKey } from "@/lib/utils";
import HabitLog from "@/models/HabitLog";
import Transaction from "@/models/Transaction";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";
import Goal from "@/models/Goal";
import Expense from "@/models/Expense";
import Category from "@/models/Category";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const userId = session.user.id;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Local calendar key — the string-dated collections store local dates,
  // so a UTC-derived key would slice the window a day off in Nepal.
  const sinceKey = toDateKey(sevenDaysAgo);

  // 1. Aggregate weekly data across every module.
  const [habits, transactions, journals, quickNotes, activeGoals, expenses, categories] =
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
      Expense.find({ userId, deletedAt: null, date: { $gte: sinceKey } })
        .select("amountPaisa categoryId date")
        .lean(),
      Category.find({ userId }).select("name type").lean(),
    ]);

  // 2. Summarise for the prompt (keep tokens lean).
  const habitSummary = summarizeHabits(habits);
  const financeSummary = summarizeTransactions(transactions);
  const spendSummary = summarizeExpenses(expenses, categories);
  const journalSummary = summarizeJournal(journals, quickNotes);
  const goalSummary =
    activeGoals
      .map((g) => `${g.title} (${g.overallProgress}% complete)`)
      .join(", ") || "No active goals.";

  const prompt = `You are a calm, perceptive personal advisor. Analyze the past 7 days and produce a "Weekly Review Briefing" in exactly this structure:

## 🎯 Goals Review
Summarize goal progress: ${goalSummary}

## 💸 Spending Report
Day-to-day money this week: ${spendSummary}
Only describe the numbers given above — do not estimate, extrapolate or invent any figure.

## 📈 Portfolio Report
Investment activity this week: ${financeSummary}

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
      model: GROQ_CHAT_MODEL,
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

/**
 * Everyday spending for the week — the half of "financial activity" this
 * briefing used to miss entirely, because it read `Transaction` (NEPSE
 * trades) and never `Expense`.
 *
 * All arithmetic happens here, in integer paisa, so the model only ever
 * receives finished figures.
 */
function summarizeExpenses(expenses, categories) {
  if (!expenses.length) return "No expenses logged this week.";

  const byId = Object.fromEntries(categories.map((c) => [String(c._id), c]));
  const byType = { need: 0, want: 0, savings: 0 };
  const byCategory = {};
  let totalPaisa = 0;

  for (const e of expenses) {
    const paisa = Number(e.amountPaisa) || 0;
    const category = byId[String(e.categoryId)];
    totalPaisa += paisa;
    if (category?.type in byType) byType[category.type] += paisa;
    const name = category?.name || "Uncategorised";
    byCategory[name] = (byCategory[name] || 0) + paisa;
  }

  const top = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, paisa]) => `${name} ${formatMoney(paisa)}`)
    .join(", ");

  const activeDays = new Set(expenses.map((e) => e.date)).size;

  return `${formatMoney(totalPaisa)} across ${expenses.length} expenses on ${activeDays} of 7 days. Needs ${formatMoney(
    byType.need
  )}, wants ${formatMoney(byType.want)}, savings ${formatMoney(
    byType.savings
  )}. Biggest categories: ${top}.`;
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
