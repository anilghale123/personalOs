"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutEverywhere } from "@/lib/sign-out";
import {
  Target,
  BookOpen,
  Receipt,
  TrendingUp,
  CalendarDays,
  LogOut,
  X,
  User,
  Sparkles,
  MessageSquarePlus,
} from "lucide-react";
import { FeedbackDialog } from "@/features/feedback/feedback-dialog";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { ProBadge } from "@/components/pro-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallButton } from "@/components/install-button";
import { ProfileDialog } from "@/features/auth/components/profile-dialog";
import { useAppUser } from "@/components/app-user";

/**
 * Money leads the tabs after Home — it is the section that gets opened
 * daily. Journal moved into the More sheet: it is a place people go
 * deliberately, not something they tap between other things.
 */
const TABS = [
  { href: "/app", label: "Home", icon: Sparkles },
  { href: "/app/budget", label: "Money", icon: Receipt },
  { href: "/app/planner", label: "Planner", icon: CalendarDays },
];

const MORE_LINKS = [
  { href: "/app/goals", label: "Goals & habits", icon: Target },
  { href: "/app/journal", label: "Journal", icon: BookOpen },
  { href: "/app/portfolio", label: "Portfolio", icon: TrendingUp },
];

function isActive(pathname, href) {
  if (href === "/app") {
    return pathname === "/app" || pathname.startsWith("/app/discoveries");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Thumb-reach navigation for phones. Primary sections sit in the lower
 * third; everything else lives in the More sheet. Desktop uses the
 * sidebar instead — this renders nothing at md and up.
 */
export function BottomNav() {
  const pathname = usePathname();
  const user = useAppUser();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);

  // Discoveries is a tab of its own now, so "More" lights up purely for
  // the sections that live in the sheet.
  const moreActive = MORE_LINKS.some((l) => isActive(pathname, l.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-[8px] md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="flex gap-1 px-3.5 pb-[22px] pt-2.5">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-1 items-center justify-center rounded-md text-[11px] transition-colors",
                  active
                    ? "bg-sand-200 font-semibold text-foreground"
                    : "text-sand-600 active:bg-sand-200/60"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className={cn(
              "flex min-h-[52px] flex-1 items-center justify-center rounded-md text-[11px] transition-colors",
              moreActive
                ? "bg-sand-200 font-semibold text-foreground"
                : "text-sand-600 active:bg-sand-200/60"
            )}
          >
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
            onClick={() => setMoreOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-card animate-slide-up elev-lg"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <BrandMark wordClassName="text-base" />
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-sand-600 hover:bg-sand-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="px-3 pb-2 pt-1" aria-label="More sections">
              {MORE_LINKS.map((link) => {
                const Icon = link.icon;
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-[48px] items-center gap-3 rounded-md px-4 text-[15px] transition-colors",
                      active
                        ? "bg-sand-200 font-semibold text-foreground"
                        : "text-sand-700 hover:bg-sand-200/60 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-1 border-t border-border px-3 py-3">
              <InstallButton className="min-h-[44px] w-full justify-start" />
              <div className="flex min-h-[44px] items-center justify-between rounded-md px-3">
                <span className="text-sm text-sand-700">Theme</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setProfileOpen(true);
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm text-sand-700 hover:bg-sand-200/60 hover:text-foreground"
              >
                <User className="h-5 w-5" />
                <span className="truncate">{user?.name || "Profile"}</span>
                {user?.isPro && <ProBadge />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setFeedbackOpen(true);
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm text-sand-700 hover:bg-sand-200/60 hover:text-foreground"
              >
                <MessageSquarePlus className="h-5 w-5" />
                Send feedback
              </button>
              <button
                type="button"
                onClick={() => signOutEverywhere({ callbackUrl: "/login" })}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm text-sand-700 hover:bg-sand-200/60 hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
        onUpdated={() => {}}
      />

      {/* Lives outside the More sheet so closing the sheet doesn't take
          the dialog down with it. */}
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
