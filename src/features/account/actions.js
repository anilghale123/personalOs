import connectDB from "@/lib/mongoose";
import { plain } from "@/lib/serialize";
import User from "@/models/User";
import { USER_COLLECTIONS, EXPORT_EXCLUDED } from "./collections";

/**
 * Everything the app holds about one user, as a plain object.
 *
 * The whole record rather than a summary: someone exporting their data is
 * usually either leaving or archiving, and both are badly served by a file
 * that turns out to be missing a year of expenses. Mongo internals are
 * flattened by `plain` so the file opens in anything.
 *
 * Read collection by collection rather than in one `Promise.all`, because
 * this can be a lot of documents and firing twenty unbounded finds at Atlas
 * at once is how a single export takes the app down for everybody.
 *
 * @param {string} userId
 */
export async function exportAccount(userId) {
  await connectDB();

  const user = await User.findById(userId)
    // Never the password hash, and never the internals that only mean
    // something to the app — a token version tells the reader nothing.
    .select("name email image provider linkedProviders plan preferences createdAt lastLoginAt")
    .lean();
  if (!user) return null;

  const data = {};
  for (const collection of USER_COLLECTIONS) {
    if (EXPORT_EXCLUDED.has(collection.name)) continue;
    const rows = await collection.model().find({ userId }).lean();
    data[collection.name] = plain(rows);
  }

  return {
    exportedAt: new Date().toISOString(),
    /**
     * So a file found on a disk in two years explains itself, and so anyone
     * writing an importer has something to check.
     */
    format: "selfview-account-export/1",
    account: plain(user),
    data,
  };
}
