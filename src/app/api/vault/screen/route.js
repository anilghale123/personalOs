import { withRoute, json } from "@/lib/api";
import {
  getPortfolioSummary,
  getRecentTransactions,
} from "@/features/vault/actions";

/**
 * GET /api/vault/screen — everything the Portfolio screen shows, in one
 * request.
 *
 * The page used to await these two reads before rendering, which made the
 * route dynamic and so left tapping Portfolio waiting on a round trip behind
 * a skeleton. Now the screen paints its saved copy and calls this in the
 * background, the same way Home uses /api/patterns/home.
 */
export const GET = withRoute({ limit: "read", db: false }, async () => {
  // Both fetchers connect and resolve the session themselves.
  const [portfolio, transactions] = await Promise.all([
    getPortfolioSummary(),
    getRecentTransactions(),
  ]);
  return json({ portfolio, transactions });
});
