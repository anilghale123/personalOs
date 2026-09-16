import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export const metadata = {
  title: "Privacy",
  description:
    "What selfView stores, who can reach it, what leaves the server, and how to take your data out or delete it.",
};

/**
 * The privacy page.
 *
 * Written to be read by someone deciding whether to keep a year of their
 * spending and their journal here, so it answers the question they actually
 * ask — "can you read this?" — in the first section rather than the last,
 * and answers it with "yes, technically" because that is the truth.
 *
 * Every claim here is one the code keeps. If a claim and the code ever
 * disagree, the code is what users experience, so this page is what has to
 * change. The specific things it rests on:
 *
 *   - `src/features/admin/analytics.js` counts and aggregates; it never
 *     reads anyone's content.
 *   - `src/lib/logger.js` refuses to print journal text, notes or amounts.
 *   - `src/app/api/journal/extract/route.js` refuses to run unless the user
 *     has switched journal analysis on.
 *   - `public/sw.js` never caches a private page.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background font-body text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="selfView home">
            <BrandMark />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
          Privacy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated 16 September 2026
        </p>

        <Section title="Can the people who run selfView read my data?">
          <P>
            <strong className="font-semibold text-foreground">
              Yes, technically.
            </strong>{" "}
            Your entries are stored in a MongoDB database, unencrypted at the
            field level. Anyone holding that database&apos;s credentials could
            query it and read your expenses and your journal. selfView is not
            end-to-end encrypted, and we would rather say so plainly than let
            the word &ldquo;encrypted&rdquo; do work it cannot do.
          </P>
          <P>
            There is a simple test for this, and it works on any app, not just
            this one: <em>what happens if you forget your password?</em> If the
            service can restore your data, your data is not locked with your
            password — which means the service holds the key. That is true of
            selfView, and of most apps that offer search, insights or anything
            computed from what you write.
          </P>
          <P>What we do instead of claiming the impossible:</P>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-muted-foreground">
            <Bullet>
              <strong className="font-medium text-foreground">
                The admin tools cannot show anyone your content.
              </strong>{" "}
              The internal console reports counts — how many people logged an
              expense this week — and is built so that reading an individual
              entry is not something it can do. It shows names, email
              addresses, plans and sign-in dates, and nothing you have written.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-foreground">
                Logs cannot print your entries.
              </strong>{" "}
              Journal text, note text, AI summaries and money amounts are on a
              deny-list that is applied to everything written to a log, so a
              stray error report cannot carry your data out with it.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-foreground">
                There is no advertising layer and no tracking.
              </strong>{" "}
              The app ships without analytics SDKs, tracking pixels or
              third-party beacons. Your data is not a product being sold, and
              there is nobody to sell it to.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-foreground">
                Direct database access is for keeping the service running.
              </strong>{" "}
              Restoring a backup, fixing a failed migration, investigating a
              bug you reported. Not for reading what you wrote.
            </Bullet>
          </ul>
        </Section>

        <Section title="What is stored">
          <P>
            Your account — name, email address, and a hashed password if you
            did not sign in with Google. A password hash cannot be reversed
            into your password.
          </P>
          <P>
            Everything you record: expenses and income, budgets, categories,
            debts, savings goals, portfolio transactions and SIPs, journal
            entries and quick notes, habits, goals, weekly goals and planner
            entries, and the patterns the app finds across them.
          </P>
          <P>
            A little operational data: when you last signed in, which device
            asked for reminders, and any feedback you have sent.
          </P>
        </Section>

        <Section title="What leaves the server">
          <P>
            Three things, and nothing else.
          </P>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-muted-foreground">
            <Bullet>
              <strong className="font-medium text-foreground">
                AI features send text to Groq.
              </strong>{" "}
              When you tap Reflect on a journal entry, or open your weekly
              briefing, the relevant text goes to the Groq API — a company in
              the United States — which returns the wording. Pattern detection
              itself never uses AI: the statistics are computed here, and a
              model is only ever asked to put a finished result into words.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-foreground">
                Journal analysis is off until you turn it on.
              </strong>{" "}
              Switched on, it sends one entry at a time to Groq automatically
              as you save, so the app can read the tone of days you did not
              set a mood. It defaults to off, lives behind a switch in your
              profile, and turning it off stops journal text leaving
              altogether.
            </Bullet>
            <Bullet>
              <strong className="font-medium text-foreground">
                Reminders and email.
              </strong>{" "}
              If you turn on daily reminders, the notification goes through
              your browser&apos;s push service (Google, Apple or Mozilla,
              depending on your device). It carries your first name and a short
              nudge — never an amount or anything you have written. Password
              reset codes go out by email.
            </Bullet>
          </ul>
        </Section>

        <Section title="What is kept on your device">
          <P>
            The app saves a copy of each screen in your browser&apos;s storage
            so it opens instantly instead of waiting on the network, and keeps
            your journal draft there so nothing is lost if a tab closes. This
            never leaves your device.
          </P>
          <P>
            Signing out clears it, along with the app&apos;s offline caches —
            which matters on a shared computer. Private pages are never written
            to the offline cache in the first place.
          </P>
        </Section>

        <Section title="Taking your data out">
          <P>
            You can download everything the app holds about you as a single
            JSON file, from your profile, at any time. It is the whole record,
            not a summary — every entry, in a format you can keep or move
            elsewhere. Nothing is held back and there is nothing to ask for.
          </P>
        </Section>

        <Section title="Deleting your account">
          <P>
            Ask, and your account and everything in it will be deleted. Use{" "}
            <span className="text-foreground">Send feedback</span> in the app,
            or reply to any email you have had from us. It reaches a person,
            not a queue.
          </P>
          <P>
            This is deliberately a request rather than a button. Deletion here
            is immediate and total — there is no grace period and no copy kept
            in reserve — and an action that final is one we would rather not
            have sitting a tap away from a settings switch. Export your data
            first if you want to keep it; once the deletion runs there is
            nothing left to export.
          </P>
          <P>
            One exception, stated plainly: if you have sent feedback, the
            message itself is kept, with your account and email address
            stripped from it. It stops being connected to you. Feedback is
            often a bug report that is still being fixed, and deleting the
            description of a problem does not help the next person to hit it.
          </P>
        </Section>

        <Section title="Where it is hosted">
          <P>
            The app runs on Vercel and the database is MongoDB Atlas. Both hold
            your data on their infrastructure under their own security
            practices, and both can see it in the same technical sense your
            operator can.
          </P>
        </Section>

        <Section title="Questions">
          <P>
            If something here is unclear, or you want to know whether a
            specific thing is stored, ask — there is a{" "}
            <span className="text-foreground">Send feedback</span> option in the
            app, and it reaches a person.
          </P>
        </Section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-8 text-xs text-muted-foreground sm:px-8">
          <BrandMark wordClassName="text-sm" markClassName="h-3.5" />
          <p>© {new Date().getFullYear()} selfView</p>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-12 border-t border-border/60 pt-8 first-of-type:mt-10">
      <h2 className="font-display text-xl tracking-tight sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function P({ children }) {
  return (
    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground first:mt-0">
      {children}
    </p>
  );
}

function Bullet({ children }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-brand"
      />
      <span>{children}</span>
    </li>
  );
}
