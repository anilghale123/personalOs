import { Database, WifiOff, ShieldCheck, Sparkles } from "lucide-react";

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
    body: "An entry is sent to the Groq API only when you tap Reflect or generate the weekly briefing. Nothing is sent anywhere else, ever unprompted.",
  },
];

export function LandingPrivacy() {
  return (
    <section
      id="privacy"
      className="mx-auto w-full max-w-6xl scroll-mt-8 px-5 pt-24 sm:px-8 sm:pt-32"
    >
      <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
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
