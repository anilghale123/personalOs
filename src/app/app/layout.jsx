import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEntitlements } from "@/lib/entitlements";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { MobileTopBar } from "@/components/mobile-topbar";

/**
 * App shell — desktop gets a fixed sidebar, phones get a slim brand row
 * and a bottom tab bar within thumb reach. Unauthenticated visitors are
 * redirected to /login.
 */
export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  // Read from the database, not the JWT, so a plan change shows immediately.
  const { isPro } = await getEntitlements(session.user.id);
  const user = { ...session.user, isPro };

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar user={user} />

      <MobileTopBar />

      <div className="md:pl-[248px]">
        <main className="mx-auto w-full max-w-6xl animate-fade-in px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 md:px-14 md:pb-16 md:pt-11">
          {children}
        </main>
      </div>

      <BottomNav user={user} />
    </div>
  );
}
