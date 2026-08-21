import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { HeroLifeline } from "./landing-fragments";

export function LandingHeader({ loggedIn }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <BrandMark />
      <nav className="hidden items-center gap-7 text-sm text-muted-foreground sm:flex">
        <a href="#pillars" className="transition-colors hover:text-foreground">
          What&apos;s inside
        </a>
        <a href="#why-one" className="transition-colors hover:text-foreground">
          Why one app
        </a>
        <a href="#privacy" className="transition-colors hover:text-foreground">
          Privacy
        </a>
      </nav>
      {loggedIn ? (
        <Button asChild size="sm">
          <Link href="/app">Open selfView</Link>
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start free</Link>
          </Button>
        </div>
      )}
    </header>
  );
}

export function LandingHero({ loggedIn }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-20">
      <div>
        <h1 className="text-balance font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
          Your money, habits, and journal — finally in one place.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          selfView is a private record of your financial life, your habits, and
          your days — with a weekly AI briefing that reads all three and tells
          you what connects them.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {loggedIn ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/app">
                Open selfView <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/signup">
                  Start your record <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="w-full sm:w-auto"
              >
                <a href="#pillars">See what&apos;s inside</a>
              </Button>
            </>
          )}
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground/80">
          Free to start · Your journal works offline · No ads, no trackers
        </p>
      </div>

      <HeroLifeline />
    </section>
  );
}
