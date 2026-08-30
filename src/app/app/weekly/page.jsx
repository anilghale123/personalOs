import { redirect } from "next/navigation";

/**
 * The weekly review is folded into Discoveries — the weekly briefing on
 * the home screen covers the same ground. This redirect keeps old links,
 * bookmarks and any installed PWA shortcut working.
 */
export default function WeeklyRedirectPage() {
  redirect("/app");
}
