import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { HeroLifeline } from "./landing-fragments";

export function LandingHeader({ signedIn }) {
  return (
    <header className="mx-auto flex w-full max-w-[1312px] items-center gap-8 px-5 py-[26px] sm:px-8 lg:px-16">
      <BrandMark />
      <div className="flex-1" />
      <nav className="hidden items-center gap-7 text-[15px] text-sand-700 sm:flex">
        <a href="#pillars" className="transition-colors hover:text-foreground">
          What&apos;s inside
        </a>
        <a href="#why-one" className="transition-colors hover:text-foreground">
          Why one app
        </a>
        <a href="#privacy" className="transition-colors hover:text-foreground">
          Privacy
        </a>
        <a href="#install" className="transition-colors hover:text-foreground">
          Get the app
        </a>
      </nav>
      {signedIn ? (
        <Button asChild className="rounded-full px-[22px] py-[11px]">
          <Link href="/app">Open selfView</Link>
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            className="hidden rounded-full sm:inline-flex"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="rounded-full px-[22px] py-[11px]">
            <Link href="/signup">Start free</Link>
          </Button>
        </div>
      )}
    </header>
  );
}

export function LandingHero({ signedIn }) {
  return (
    <section className="mx-auto grid w-full max-w-[1312px] items-center gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1fr_460px] lg:gap-16 lg:px-16 lg:pb-[68px] lg:pt-[52px]">
      <div>
        <p className="kicker mb-[22px] text-[13px] text-clay-700">
          For people with no time to track anything
        </p>
        <h1 className="max-w-[15ch] text-balance font-display text-[42px] leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[76px]">
          Your whole life on one quiet page.
        </h1>
        <p className="mt-[26px] max-w-[44ch] text-base leading-[1.6] text-sand-700 sm:text-[19px]">
          Money, habits and journal in one place. Log ten seconds a day — we do
          the reading and hand you the single thing worth knowing.
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          {signedIn ? (
            <Button
              asChild
              className="w-full rounded-full px-[30px] py-[15px] text-base sm:w-auto"
            >
              <Link href="/app">Open selfView</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="w-full rounded-full px-[30px] py-[15px] text-base sm:w-auto"
              >
                <Link href="/signup">Start free</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full rounded-full px-[26px] py-[15px] text-base sm:w-auto"
              >
                <a href="#install">Get the app</a>
              </Button>
            </>
          )}
        </div>
        <p className="mt-[22px] text-sm text-sand-600">
          No card, no app store. Your data stays yours — export it any day.
        </p>
      </div>

      {/* Organic frames the hero art as a circle, with a sage disc breaking
          out behind it. The frame holds the Lifeline until a photograph
          replaces it. */}
      <div className="relative mx-auto w-full max-w-[460px]">
        <div
          aria-hidden
          className="absolute -right-[26px] -top-[26px] hidden h-[180px] w-[180px] rounded-full bg-sage-200 lg:block"
        />
        <div className="relative aspect-square overflow-hidden rounded-full bg-sand-100 elev-md">
          <div className="flex h-full w-full items-center justify-center p-12">
            <HeroLifeline />
          </div>
        </div>
      </div>
    </section>
  );
}
