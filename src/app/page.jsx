import { getSession } from "@/lib/session";
import {
  LandingHeader,
  LandingHero,
} from "@/features/landing/components/landing-hero";
import { LandingPillars } from "@/features/landing/components/landing-pillars";
import { LandingWhy } from "@/features/landing/components/landing-why";
import { LandingPrivacy } from "@/features/landing/components/landing-privacy";
import { LandingInstall } from "@/features/landing/components/landing-install";
import {
  LandingClosing,
  LandingFooter,
} from "@/features/landing/components/landing-closing";

/**
 * Public landing page. The product lives under /app; signed-in visitors
 * get "Open selfView" in place of the signup call to action. Organic is a
 * light system, so the landing follows the visitor's theme rather than
 * pinning itself dark.
 */
export default async function LandingPage() {
  const session = await getSession();
  const signedIn = Boolean(session?.user);

  return (
    <div className="min-h-dvh bg-background font-body text-foreground">
      <LandingHeader signedIn={signedIn} />
      <main>
        <LandingHero signedIn={signedIn} />
        <LandingPillars />
        <LandingWhy />
        <LandingPrivacy />
        {/* Before the closing CTA on purpose: installing first, then signing
            up inside the installed app, is what leaves someone with both. */}
        <LandingInstall signedIn={signedIn} />
        <LandingClosing signedIn={signedIn} />
      </main>
      <LandingFooter />
    </div>
  );
}
