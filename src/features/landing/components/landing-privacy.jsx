import { Database, WifiOff, ShieldCheck, Sparkles, FileText } from "lucide-react";

const POINTS = [
  {
    icon: Database,
    title: "Your database, not an ad network",
    body: "Everything you record lives in a dedicated MongoDB database controlled by you or your operator. There is no advertising layer to feed.",
  },
  {
    icon: WifiOff,
    title: "The journal works offline",
    body: "Entries save to your device the moment you write and sync when you're back. A plane, a dead zone, a closed tab — your words survive all three.",
  },
  {
    icon: ShieldCheck,
    title: "No trackers",
    body: "The app ships without analytics SDKs, tracking pixels, or third-party beacons. Nothing watches you here.",
  },
  {
    icon: Sparkles,
    title: "AI only when you ask",
    body: "An entry reaches the Groq API only when you tap Reflect, or open your weekly review. Pattern detection itself never uses AI — the statistics are computed here, and a model is only ever asked to put a finished result into words.",
  },
  {
    icon: FileText,
    title: "Journal analysis is off until you turn it on",
    body: "You can let the app read the tone of each entry as you save it, so it has something to work with on days you didn't set a mood. That sends one entry at a time to Groq, automatically, whenever you save — which is why it's off by default and lives behind a switch in your profile. Turn it off and journal text stops leaving the app.",
  },
];

export function LandingPrivacy() {
  return (
    <section
      id="privacy"
      className="mx-auto w-full max-w-6xl scroll-mt-8 px-5 pt-24 sm:px-8 sm:pt-32"
    >
      <h2 className="font-display text-2xl tracking-tight sm:text-3xl lg:text-4xl">
        Private by design
      </h2>
      <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground sm:text-lg">
        A record of your life has to be safe to keep. These aren&apos;t
        aspirations — they&apos;re how the app is built.
      </p>
      <ul className="mt-10 grid gap-x-12 gap-y-6 sm:mt-14 sm:grid-cols-2">
        {POINTS.map((point) => {
          const Icon = point.icon;
          return (
            <li key={point.title} className="flex gap-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-brand">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold sm:text-base">
                  {point.title}
                </h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {point.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
