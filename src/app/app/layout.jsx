import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { MobileTopBar } from "@/components/mobile-topbar";
import { AppUserProvider } from "@/components/app-user";
import { ReminderPrompt } from "@/features/reminders/components/reminder-prompt";
import { NotificationBell } from "@/features/notifications/components/notification-bell";

/**
 * App shell — desktop gets a fixed sidebar, phones get a slim brand row
 * and a bottom tab bar within thumb reach.
 *
 * ## Nothing here reads the request, and that is the point
 *
 * This layout used to resolve the session and the user's plan before
 * rendering. Doing so made it — and therefore every screen underneath it —
 * server-rendered on demand, and Next prefetches a dynamic route only as far
 * as its `loading.jsx`. So every tab in this shell had exactly one thing
 * prefetched: its skeleton. Tapping a tab showed that skeleton and then
 * waited on a round trip for the screen behind it, however little work that
 * screen actually did.
 *
 * With no request-bound input left, this shell and the tabs inside it are
 * prerendered at build and prefetched whole, and switching between them is a
 * local render with nothing in the way. Who is signed in comes from
 * `AppUserProvider`, which asks `/api/me` once per open.
 *
 * The auth gate moved rather than disappeared: `src/middleware.js` bounces
 * anyone without a session cookie before this renders, `AppUserProvider`
 * sends anyone whose cookie does not resolve to a session to sign in, and
 * every route and action that touches data re-validates it regardless. See
 * the note in `components/app-user.jsx`.
 */
export default function AppLayout({ children }) {
  return (
    <AppUserProvider>
      <div className="min-h-dvh bg-background">
        <Sidebar />

        <MobileTopBar />

        <NotificationBell />

        <div className="md:pl-[248px]">
          <main className="mx-auto w-full max-w-6xl animate-fade-in px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-14 md:pb-16 md:pt-11">
            {children}
          </main>
        </div>

        <BottomNav />

        <ReminderPrompt />
      </div>
    </AppUserProvider>
  );
}
