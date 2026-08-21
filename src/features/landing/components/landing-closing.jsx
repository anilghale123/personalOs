import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

export function LandingClosing({ signedIn }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-10 pt-28 text-center sm:px-8 sm:pt-36">
      <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
        Start tonight.
      </h2>
      <p className="mx-auto mt-4 max-w-md text-balance leading-relaxed text-muted-foreground">
        Write one entry. Log one expense. Keep one habit. Next Sunday, read
        the briefing.
      </p>
      <div className="mt-8 flex justify-center">
        <Button asChild size="lg" className="h-12 w-full max-w-xs text-base sm:w-auto">
          <Link href={signedIn ? "/app" : "/signup"}>
            {signedIn ? "Open selfView" : "Start your record"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:px-8">
        <BrandMark wordClassName="text-sm" markClassName="h-3.5" />
        <p>Private by design.</p>
        <p>© {new Date().getFullYear()} selfView</p>
      </div>
    </footer>
  );
}
