import { NextResponse } from "next/server";
import { captureException, log } from "@/lib/logger";
import { runGoalTimeReminders } from "@/features/reminders/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — nudges for timed planner goals still unchecked after their time.
 *
 * Needs calling every 5 minutes or so. Vercel Hobby only allows daily crons,
 * so this is not in vercel.json; point an external scheduler (cron-job.org,
 * a GitHub Action, …) at it with `Authorization: Bearer $CRON_SECRET`. On a
 * Pro plan it can go in vercel.json as `*\/5 * * * *` instead.
 *
 * Authenticates with CRON_SECRET, like the other crons — no session.
 */
export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runGoalTimeReminders();
    if (result.sent) log.info("Goal-time reminders run", result);
    return NextResponse.json({ ...result, at: new Date().toISOString() });
  } catch (err) {
    const errorId = captureException(err, { route: "GET /api/cron/goal-reminders" });
    return NextResponse.json({ error: "Goal reminder run failed", errorId }, { status: 500 });
  }
}
