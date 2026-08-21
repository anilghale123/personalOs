import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { MobileTopBar } from "@/components/mobile-topbar";

/**
 * App shell — desktop gets a fixed sidebar, phones get a slim brand row
 * and a bottom tab bar within thumb reach. Unauthenticated visitors are
 * redirected to /login.
 */
export default async function AppLayout({ children }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar user={session.user} />

      <MobileTopBar />

      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl animate-fade-in px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-8 md:py-10">
          {children}
        </main>
      </div>

      <BottomNav user={session.user} />
    </div>
  );
}
