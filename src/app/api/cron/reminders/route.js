import { NextResponse } from "next/server";
import { captureException, log } from "@/lib/logger";
import { runReminders } from "@/features/reminders/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — the 10 am and 8 pm (Nepal time) push reminders, called by Vercel
 * Cron (see vercel.json) or any scheduler that sends the bearer secret.
 *
 * The slot comes from the Nepal-local hour, so the same URL serves both
 * schedules; `?slot=morning|evening` forces one for a manual run.
 *
 * Not wrapped in `withRoute` for the same reason as the NEPSE cron: it has
 * no session and authenticates with CRON_SECRET instead.
 */
export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const param = new URL(request.url).searchParams.get("slot");
  const slot = param === "morning" || param === "evening" ? param : undefined;

  try {
    const result = await runReminders({ slot });
    log.info("Reminders run", result);
    return NextResponse.json({ ...result, at: new Date().toISOString() });
  } catch (err) {
    const errorId = captureException(err, { route: "GET /api/cron/reminders" });
    return NextResponse.json({ error: "Reminder run failed", errorId }, { status: 500 });
  }
}
