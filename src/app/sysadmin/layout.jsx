import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getAdminActor } from "@/features/admin/guard";
import { ROLE_LABELS } from "@/lib/roles";
import { AdminNav } from "@/features/admin/components/admin-nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  // Keep the console out of search results and previews.
  robots: { index: false, follow: false },
};

/**
 * The admin shell.
 *
 * Every page underneath is gated here, so a new admin route is protected by
 * default rather than by remembering to add a check. The API routes guard
 * themselves independently via `withAdminRoute` — this layout protects the
 * rendering, not the data, and one is not a substitute for the other.
 *
 * `notFound()` rather than a redirect or a 403: answering "forbidden" would
 * confirm to anyone probing that an admin console lives at this path.
 */
export default async function SysadminLayout({ children }) {
  const actor = await getAdminActor();
  if (!actor) notFound();

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
          <Link href="/sysadmin" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
              <ShieldCheck className="h-4 w-4" />
            </span>
            selfView admin
          </Link>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {actor.email}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {ROLE_LABELS[actor.role] ?? actor.role}
            </span>
            <Link
              href="/app"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to app
            </Link>
          </div>
        </div>

        <AdminNav />
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}
