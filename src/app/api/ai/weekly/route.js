import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Insight from "@/models/Insight";
import PatternRun from "@/models/PatternRun";
import { getGroqClient, GROQ_CHAT_MODEL } from "@/lib/groq";
import { weekRange } from "@/lib/week";
import { toDateKey } from "@/lib/utils";
import { renderStatement } from "@/features/patterns/constants";
import { getDailySignals } from "@/features/patterns/signals";
import { addDays } from "@/features/patterns/dates";
import {
  allowedNumbers,
  assertNoCausalClaims,
  assertNoInventedNumbers,
} from "@/features/patterns/narrate";
import { buildWeeklyDigest, buildWeeklyPrompt, weeklyPromptPayload } from "@/features/patterns/weekly";

/**
 * POST /api/ai/weekly — the Weekly Discoveries digest.
 *
 * Supersedes `/api/ai/briefing` for this screen. The difference that
 * matters: the briefing asked a model to look at raw data and say
 * something; this hands over a digest the engine already computed and
 * asks only for words. Every number in the reply is checked against that
 * digest before it is shown.
 *
 * Body: { weekOf?: 'YYYY-MM-DD' }  — defaults to the current week.
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const anchor = body?.weekOf ? new Date(`${body.weekOf}T12:00:00`) : new Date();
  const { weekStart, weekEnd } = weekRange(anchor);
  const from = toDateKey(weekStart);
  const to = toDateKey(weekEnd);

  await connectDB();
  const userId = session.user.id;

  const [docs, signals, priorSignals, lastRun] = await Promise.all([
    Insight.find({ userId, status: { $in: ["active", "stale"] } }).lean(),
    getDailySignals(userId, from, to),
    getDailySignals(userId, addDays(from, -7), addDays(from, -1)),
    PatternRun.findOne({ userId, error: null }).sort({ runAt: -1 }).lean(),
  ]);

  const digest = buildWeeklyDigest({
    insights: docs.map((doc) => ({
      id: String(doc._id),
      statement: renderStatement(doc.statementKey, doc.statementVars),
      status: doc.status,
      confidence: doc.confidence,
      n: doc.n,
      timesConfirmed: doc.timesConfirmed,
      firstDetectedAt: doc.firstDetectedAt,
      strengthHistory: doc.strengthHistory ?? [],
    })),
    signals,
    priorSignals,
    weekStart: from,
    weekEnd: to,
    testedCount: lastRun?.hypotheses ?? 0,
  });

  const reflection = await writeReflection(digest);

  return NextResponse.json({
    weekStart: from,
    weekEnd: to,
    digest,
    reflection,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * Ask for the reflection, and refuse it if it invents a figure or asserts
 * causation. Returning null is fine — the page renders the digest itself,
 * which was always the substance.
 */
async function writeReflection(digest, attempts = 2) {
  const allowed = allowedNumbers(weeklyPromptPayload(digest));
  const prompt = buildWeeklyPrompt(digest);

  for (let attempt = 0; attempt < attempts; attempt++) {
    let text = null;
    try {
      const groq = getGroqClient();
      const completion = await groq.chat.completions.create({
        model: GROQ_CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 500,
        stream: false,
      });
      text = completion.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      console.error("Weekly reflection call failed:", err.message);
      return null;
    }
    if (!text) continue;

    const numbers = assertNoInventedNumbers(text, allowed);
    const causal = assertNoCausalClaims(text);
    if (numbers.ok && causal.ok) return { text, model: GROQ_CHAT_MODEL };

    console.warn("Weekly reflection rejected", {
      invented: numbers.invented,
      causalTerms: causal.terms,
    });
  }
  return null;
}
