import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import connectDB from "@/lib/mongoose";
import Insight from "@/models/Insight";
import { renderStatement } from "@/features/patterns/constants";
import { generateExplanation, generateNarration } from "@/features/patterns/narrate";

/**
 * POST /api/patterns/insights/[id]/narrate
 *
 * Body: { mode?: 'narrate' | 'explain', regenerate?: boolean }
 *
 * Turns a validated finding into prose. The model receives finished
 * numbers and returns language; if it invents a figure or asserts
 * causation, the output is discarded and the caller keeps the
 * deterministic statement it was already showing.
 *
 * Results are persisted, and an existing one is returned as-is unless
 * `regenerate` is set — narration costs tokens, and regenerating it on
 * every page view would be paying repeatedly for the same sentence.
 */
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "explain" ? "explain" : "narrate";
  const regenerate = Boolean(body?.regenerate);

  await connectDB();
  const doc = await Insight.findOne({
    _id: params.id,
    userId: session.user.id,
  }).lean();
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = mode === "explain" ? doc.explanation : doc.narration;
  if (existing?.text && !regenerate) {
    return NextResponse.json({ mode, text: existing.text, cached: true });
  }

  // The model never sees the stored document — only the finished figures,
  // plus the sentence the engine already wrote.
  const insight = {
    ...doc,
    id: String(doc._id),
    statement: renderStatement(doc.statementKey, doc.statementVars),
  };

  const result =
    mode === "explain"
      ? await generateExplanation(insight)
      : await generateNarration(insight);

  if (!result) {
    // Refused or unavailable. Not an error the user needs to act on —
    // the page is already showing the statement that matters.
    return NextResponse.json(
      {
        mode,
        text: null,
        reason: "unavailable",
        message: "Couldn't write this one up just now — the finding itself is unchanged.",
      },
      { status: 200 }
    );
  }

  const field = mode === "explain" ? "explanation" : "narration";
  await Insight.updateOne(
    { _id: doc._id, userId: session.user.id },
    {
      $set: {
        [field]: {
          text: result.text,
          model: result.model,
          generatedAt: new Date(),
        },
      },
    }
  );

  return NextResponse.json({ mode, text: result.text, cached: false });
}
