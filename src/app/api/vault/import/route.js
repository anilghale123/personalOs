import { withRoute, json, badRequest } from "@/lib/api";
import { importBrokerCSV } from "@/features/vault/actions";
import { invalidatePortfolio } from "@/lib/cache";

/**
 * POST — multipart/form-data with a `file` field (broker CSV).
 *
 * Parsing, size/row caps and the bulk upsert all live in the server action;
 * this route exists to apply the rate limit and the session check before any
 * of that work begins. Importing is the most expensive thing an
 * authenticated user can ask for, and a legitimate one does it rarely.
 */
export const POST = withRoute(
  { limit: "importCsv", db: false },
  async ({ request, userId }) => {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      throw badRequest("Expected a file upload.");
    }

    const result = await importBrokerCSV(formData);

    // Only when rows actually landed — a rejected oversized file must not
    // clear a perfectly good cache.
    if (result.imported > 0) invalidatePortfolio(userId);

    // The action reports row-level problems in `errors` while still
    // importing everything valid, so a partial success is a 200 with detail
    // rather than an error that hides what landed.
    return json(result);
  }
);
