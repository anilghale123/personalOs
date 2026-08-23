import { redirect } from "next/navigation";

/**
 * The weekly review moved to /app/weekly when it became Weekly
 * Discoveries. This redirect keeps old links, bookmarks and any installed
 * PWA shortcut working; it can go one release after the rename.
 */
export default function ReviewRedirectPage() {
  redirect("/app/weekly");
}
