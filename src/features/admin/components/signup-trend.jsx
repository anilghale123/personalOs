/**
 * Signups per day, as a bar strip.
 *
 * Hand-drawn rather than a charting library: this is thirty bars with no axes,
 * no tooltips and no interaction, and pulling in recharts for it would add
 * over 100KB to a page that is otherwise pure server-rendered HTML.
 *
 * The API returns only days that had a signup, so the series is filled in here
 * — a gap-free strip is the whole point of a trend, and drawing only the
 * non-zero days would make a quiet fortnight look like continuous activity.
 */
export function SignupTrend({ data, days = 30 }) {
  const counts = new Map(data.map((d) => [d.date, d.count]));

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }

  const max = Math.max(1, ...series.map((s) => s.count));
  const total = series.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <div className="flex h-16 items-end gap-[3px]">
        {series.map((point) => (
          <div
            key={point.date}
            className="group relative flex-1"
            title={`${point.date}: ${point.count} signup${point.count === 1 ? "" : "s"}`}
          >
            <div
              className={
                point.count > 0
                  ? "w-full rounded-sm bg-foreground"
                  : "w-full rounded-sm bg-muted"
              }
              style={{
                // Zero days keep a 2px stub, so the baseline reads as a
                // timeline rather than as missing data.
                height: point.count > 0 ? `${(point.count / max) * 100}%` : "2px",
                minHeight: point.count > 0 ? "3px" : "2px",
              }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{days} days ago</span>
        <span>
          {total} total · peak {max}/day
        </span>
        <span>today</span>
      </p>
    </div>
  );
}
