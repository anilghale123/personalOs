/** Three thin lines — money, habits, journal — converging into one briefing. */
function Convergence() {
  return (
    <svg
      viewBox="0 0 320 120"
      className="mt-10 w-full"
      role="img"
      aria-label="Money, habits and journal converging into a single briefing"
    >
      <path
        d="M8 20 C 120 20, 180 58, 268 58"
        fill="none"
        stroke="hsl(var(--brand))"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 60 C 120 60, 180 59, 268 59"
        fill="none"
        stroke="hsl(var(--foreground) / 0.45)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 100 C 120 100, 180 60, 268 60"
        fill="none"
        stroke="hsl(var(--foreground) / 0.25)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M268 59 L 308 59"
        fill="none"
        stroke="hsl(var(--brand))"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="312" cy="59" r="3.5" fill="hsl(var(--brand))" />
      <text x="8" y="12" fill="hsl(var(--muted-foreground))" fontSize="10">
        Money
      </text>
      <text x="8" y="52" fill="hsl(var(--muted-foreground))" fontSize="10">
        Habits
      </text>
      <text x="8" y="114" fill="hsl(var(--muted-foreground))" fontSize="10">
        Journal
      </text>
      <text
        x="268"
        y="80"
        fill="hsl(var(--brand))"
        fontSize="10"
        fontWeight="600"
      >
        Briefing
      </text>
    </svg>
  );
}

export function LandingWhy() {
  return (
    <section
      id="why-one"
      className="mx-auto w-full max-w-6xl scroll-mt-8 px-5 pt-24 sm:px-8 sm:pt-32"
    >
      <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
        Why one app instead of four
      </h2>
      <div className="mt-5 max-w-xl space-y-4 leading-relaxed text-muted-foreground sm:text-lg">
        <p>
          A budgeting app can&apos;t notice that you spend more in the weeks
          you sleep badly. A habit app can&apos;t see that your longest streaks
          begin on days you write. A journal can&apos;t weigh your mood against
          your money.
        </p>
        <p>
          The interesting truths about a life live <em className="text-foreground not-italic font-medium">between</em> the
          categories. selfView&apos;s weekly briefing is where they meet — and
          it only works because everything is already in one place. Nothing to
          export, connect, or reconcile.
        </p>
      </div>
      <Convergence />
    </section>
  );
}
