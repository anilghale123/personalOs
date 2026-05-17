import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import { getGroqClient } from "@/lib/groq";
import DailyJournal from "@/models/DailyJournal";
import QuickNote from "@/models/QuickNote";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/journal/reflect
 * Generates a short, warm AI reflection for a single day from its
 * anchor journal + quick notes, and persists it as `aiSummary`.
 * Body: { date }
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { date } = await request.json();
  if (!DATE_RE.test(date || "")) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  await connectDB();
  const [journal, notes] = await Promise.all([
    DailyJournal.findOne({ userId: session.user.id, date }),
    QuickNote.find({ userId: session.user.id, date })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const hasContent =
    (journal?.content && journal.content.trim()) || notes.length > 0;
  if (!hasContent) {
    return NextResponse.json(
      { error: "Nothing to reflect on yet — write a little first." },
      { status: 400 }
    );
  }

  const noteLines = notes.length
    ? notes.map((n) => `- "${n.content}"`).join("\n")
    : "(none)";
  const prompt = `You are a calm, supportive journaling companion. Reflect on this single day with warmth and zero judgement.

DATE: ${date}
Mood: ${journal?.mood || "unset"}

Daily Reflection:
"${journal?.content?.trim() || "(no long-form entry)"}"

Quick Notes:
${noteLines}

Write a SHORT reflection (3-4 sentences, under 90 words). Gently name the emotional thread of the day, acknowledge one thing that went well, and offer one soft, encouraging nudge. Speak directly to the person ("you"). Do not use headings or bullet points.`;

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 220,
    });
    const aiSummary = completion.choices[0].message.content.trim();

    if (journal) {
      journal.aiSummary = aiSummary;
      await journal.save();
    } else {
      await DailyJournal.findOneAndUpdate(
        { userId: session.user.id, date },
        { $set: { aiSummary }, $setOnInsert: { userId: session.user.id, date } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    return NextResponse.json({ aiSummary });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Reflection failed" },
      { status: 500 }
    );
  }
}
