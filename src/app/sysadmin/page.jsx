import Link from "next/link";
import { ArrowRight, TrendingUp, Users } from "lucide-react";
import { getAdminOverview } from "@/features/admin/analytics";
import { StatTile, AdoptionBar } from "@/features/admin/components/stat-tile";
import { SignupTrend } from "@/features/admin/components/signup-trend";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard · Admin" };

/** "2 hours ago" from an ISO string, in the coarse units a dashboard needs. */
function ago(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function AdminDashboard() {
  const data = await getAdminOverview();
  const { users, features, mostUsed, untouched, goneQuiet, signupTrend } = data;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below is derived from stored records — there is no tracking
          pixel and no third party. It measures what people <em>create</em>,
          which is the honest signal for what to build next.
        </p>
      </header>

      {/* ---- People ------------------------------------------------- */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" />
          People
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total users"
            value={users.total}
            hint={`${users.newWeek} joined this week`}
          />
          <StatTile
            label="Active this week"
            value={users.activeWeek}
            hint={`${users.weeklyActiveRate}% of everyone · ${users.activeDay} today`}
            tone={users.weeklyActiveRate >= 40 ? "good" : undefined}
          />
          <StatTile
            label="Active this month"
            value={users.activeMonth}
            hint={`${users.newMonth} joined in the same period`}
          />
          <StatTile
            label="Never signed in"
            value={users.neverSignedIn}
            hint="Signed up and never came back — the sharpest onboarding signal"
            tone={users.neverSignedIn > 0 ? "warn" : "good"}
          />
        </div>

        {signupTrend.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-background p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Signups, last 30 days
            </p>
            <SignupTrend data={signupTrend} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(users.byProvider).map(([provider, count]) => (
            <span key={provider} className="rounded-full bg-muted px-2.5 py-1">
              {provider === "google" ? "Google" : "Email"}: {count}
            </span>
          ))}
          {users.suspended > 0 && (
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">
              Suspended: {users.suspended}
            </span>
          )}
        </div>
      </section>

      {/* ---- Features ----------------------------------------------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4" />
            What people actually use
          </h2>
          <Link
            href="/sysadmin/features"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Full breakdown
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {/* Most used */}
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Most used
            </p>
            {mostUsed.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {mostUsed.map((f) => (
                  <li key={f.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{f.label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {f.users} {f.users === 1 ? "user" : "users"}
                      </span>
                    </div>
                    <AdoptionBar percent={f.adoption} className="mt-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {f.adoption}% adoption · {f.intensity} records each
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Untouched */}
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Untouched
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Not one record, from anyone.
            </p>
            {untouched.length === 0 ? (
              <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-500">
                Every feature has been used at least once.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {untouched.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate">{f.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {f.area}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Gone quiet */}
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Gone quiet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tried, then abandoned — usually more interesting than untouched.
            </p>
            {goneQuiet.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Nothing has been abandoned.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {goneQuiet.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate">{f.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      last {ago(f.lastUsedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Generated {ago(data.generatedAt)} · &ldquo;recent&rdquo; means the last{" "}
        {data.recentDays} days
      </p>
    </div>
  );
}
