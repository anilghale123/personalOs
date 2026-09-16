import { NextResponse } from "next/server";
import { withRoute, must } from "@/lib/api";
import { exportAccount } from "@/features/account/actions";

/**
 * GET /api/account/export — everything this account holds, as a JSON file.
 *
 * Served as a download rather than a JSON body so the browser saves it
 * instead of rendering a wall of text, and named with the date so two
 * exports do not overwrite each other in a downloads folder.
 *
 * Rate limited on the import policy rather than the read one: this is an
 * unbounded read across twenty collections, closer in cost to a statement
 * import than to opening a screen, and nobody needs to do it twice a minute.
 */
export const GET = withRoute({ limit: "importCsv" }, async ({ userId }) => {
  const account = must(await exportAccount(userId));
  const day = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(account, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="selfview-export-${day}.json"`,
      // Never let a proxy or the browser keep a copy of someone's whole life.
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
});
