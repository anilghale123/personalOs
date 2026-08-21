import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

/**
 * Shared dashboard shell — fixed sidebar + responsive content area.
 * Unauthenticated visitors are redirected to /login.
 */
export default async function DashboardLayout({ children }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={session.user} />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
