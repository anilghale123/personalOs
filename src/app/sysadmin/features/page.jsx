import { getAdminOverview } from "@/features/admin/analytics";
import { AdoptionBar } from "@/features/admin/components/stat-tile";

export const dynamic = "force-dynamic";

export const metadata = { title: "Feature usage · Admin" };

/** Group features by product area, preserving the ranked order within each. */
function byArea(features) {
  const groups = new Map();
  for (const feature of features) {
    if (!groups.has(feature.area)) groups.set(feature.area, []);
    groups.get(feature.area).push(feature);
  }
  return [...groups.entries()];
}

export default async function FeatureUsagePage() {
  const data = await getAdminOverview();
  const areas = byArea(data.features);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Feature usage</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          Counted from stored records across {data.users.total}{" "}
          {data.users.total === 1 ? "account" : "accounts"}.{" "}
          <strong className="font-medium text-foreground">Adoption</strong> is
          the share of users with at least one record;{" "}
          <strong className="font-medium text-foreground">depth</strong> is
          records per adopting user — which is what separates &ldquo;everyone
          tried it once&rdquo; from &ldquo;a few people live in it&rdquo;.
        </p>
      </header>

      {areas.map(([area, features]) => (
        <section key={area}>
          <h2 className="mb-2 text-sm font-semibold">{area}</h2>

          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Feature</th>
                  <th className="px-4 py-2.5 font-medium">Adoption</th>
                  <th className="px-4 py-2.5 text-right font-medium">Users</th>
                  <th className="px-4 py-2.5 text-right font-medium">Records</th>
                  <th className="px-4 py-2.5 text-right font-medium">Depth</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Last {data.recentDays}d
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => {
                  const untouched = f.users === 0;
                  const quiet = f.records > 0 && f.recentRecords === 0;
                  return (
                    <tr
                      key={f.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{f.label}</span>
                        {untouched && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            untouched
                          </span>
                        )}
                        {quiet && (
                          <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-500">
                            gone quiet
                          </span>
                        )}
                      </td>
                      <td className="w-40 px-4 py-3">
                        <AdoptionBar percent={f.adoption} />
                        <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                          {f.adoption}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {f.users}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {f.records.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {f.intensity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {f.recentRecords.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
        <strong className="font-medium">What this does not measure:</strong>{" "}
        reading. Someone who opens their weekly briefing every Sunday but never
        writes a journal entry shows here as not using the journal. For deciding
        what to build, creation is the sturdier signal — a feature nobody puts
        data into is a feature nobody has adopted — but it is not the whole
        picture.
      </p>
    </div>
  );
}
