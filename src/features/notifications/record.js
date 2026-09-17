import { log } from "@/lib/logger";
import Notification from "@/models/Notification";

/**
 * Write notifications to the in-app inbox.
 *
 * Never throws: the inbox is a record alongside the push, and failing to
 * write it must not stop the push itself from going out. Entries whose
 * `dedupeKey` already exists are skipped (duplicate-key errors are expected
 * on a cron retry and ignored).
 *
 * @param {{userId: any, kind: string, title: string, body?: string, url?: string, dedupeKey?: string}[]} docs
 */
export async function recordNotifications(docs) {
  if (!docs.length) return;
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    const onlyDuplicates =
      err?.code === 11000 ||
      (Array.isArray(err?.writeErrors) && err.writeErrors.every((e) => e.code === 11000));
    if (!onlyDuplicates) {
      log.warn("Could not record notifications", { message: err?.message });
    }
  }
}
