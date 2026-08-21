import {
  WealthFragment,
  HabitsFragment,
  JournalFragment,
  BriefingFragment,
} from "./landing-fragments";

const PILLARS = [
  {
    name: "Wealth",
    sentence:
      "Log an expense in two taps, import your NEPSE broker file, and keep budgets, debts, SIPs and savings goals honest.",
    fragment: <WealthFragment />,
  },
  {
    name: "Habits",
    sentence:
      "Check off today's habits and this week's goals. A 365-day heatmap keeps the honest score.",
    fragment: <HabitsFragment />,
  },
  {
    name: "Journal",
    sentence:
      "One entry a day, plus quick notes the moment they happen. Write offline on a plane — it syncs when you land.",
    fragment: <JournalFragment />,
  },
  {
    name: "AI briefings",
    sentence:
      "Once a week, an executive briefing reads across all three and tells you what actually moved.",
    fragment: <BriefingFragment />,
  },
];

export function LandingPillars() {
  return (
    <section
      id="pillars"
      className="mx-auto w-full max-w-6xl scroll-mt-8 px-5 pt-24 sm:px-8 sm:pt-32"
    >
      <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
        Four records of the same life
      </h2>
      <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground sm:text-lg">
        Each is simple on its own. Kept together, they start to explain each
        other.
      </p>
      <div className="mt-10 space-y-10 sm:mt-14 sm:space-y-16">
        {PILLARS.map((pillar, i) => (
          <div
            key={pillar.name}
            className="grid items-center gap-5 sm:grid-cols-2 sm:gap-10 lg:gap-16"
          >
            <div className={i % 2 === 1 ? "sm:order-2" : ""}>
              <h3 className="font-display text-lg font-semibold sm:text-xl">
                {pillar.name}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                {pillar.sentence}
              </p>
            </div>
            <div className={i % 2 === 1 ? "sm:order-1" : ""}>
              {pillar.fragment}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
