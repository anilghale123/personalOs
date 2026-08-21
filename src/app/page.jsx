import { auth } from "@/lib/auth";
import {
  LandingHeader,
  LandingHero,
} from "@/features/landing/components/landing-hero";
import { LandingPillars } from "@/features/landing/components/landing-pillars";
import { LandingWhy } from "@/features/landing/components/landing-why";
import { LandingPrivacy } from "@/features/landing/components/landing-privacy";
import {
  LandingClosing,
  LandingFooter,
} from "@/features/landing/components/landing-closing";

/**
 * Public landing page. The product lives under /app; signed-in visitors
 * get "Open selfView" in place of the signup call to action. The landing
 * is always dark — the product is dark-first — via the `dark` wrapper.
 */
export default async function LandingPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div className="dark">
      <div className="min-h-dvh bg-background font-body text-foreground">
        <LandingHeader signedIn={signedIn} />
        <main>
          <LandingHero signedIn={signedIn} />
          <LandingPillars />
          <LandingWhy />
          <LandingPrivacy />
          <LandingClosing signedIn={signedIn} />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
