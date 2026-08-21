"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Target,
  BookOpen,
  Receipt,
  TrendingUp,
  CalendarDays,
  CalendarCheck,
  LogOut,
  MoreHorizontal,
  X,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallButton } from "@/components/install-button";
import { ProfileDialog } from "@/features/auth/components/profile-dialog";

const TABS = [
  { href: "/app/planner", label: "Planner", icon: CalendarDays },
  { href: "/app/budget", label: "Budget", icon: Receipt },
  { href: "/app/journal", label: "Journal", icon: BookOpen },
];

const MORE_LINKS = [
  { href: "/app", label: "Today", icon: LayoutDashboard },
  { href: "/app/goals", label: "Goals", icon: Target },
  { href: "/app/portfolio", label: "Portfolio", icon: TrendingUp },
  { href: "/app/review", label: "Weekly review", icon: CalendarCheck },
];

function isActive(pathname, href) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Thumb-reach navigation for phones. Primary sections sit in the lower
 * third; everything else lives in the More sheet. Desktop uses the
 * sidebar instead — this renders nothing at md and up.
 */
export function BottomNav({ user }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);

  // "More" lights up only for secondary sections — /app (Today) is the
  // home base, so it never marks the More tab.
  const moreActive = MORE_LINKS.filter((l) => l.href !== "/app").some((l) =>
    isActive(pathname, l.href)
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/90 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 transition-colors",
                  active
                    ? "text-brand"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className={cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-0.5 transition-colors",
              moreActive
                ? "text-brand"
                : "text-muted-foreground active:text-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={moreActive ? 2.4 : 2} />
            <span className="text-[11px] font-medium">More</span>
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
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t bg-card animate-slide-up"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <BrandMark wordClassName="text-base" />
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
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
                      "flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-[15px] transition-colors",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-1 border-t px-3 py-3">
              <InstallButton className="min-h-[44px] w-full justify-start" />
              <div className="flex min-h-[44px] items-center justify-between rounded-lg px-3">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setProfileOpen(true);
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                <User className="h-5 w-5" />
                {user?.name || "Profile"}
              </button>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
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
    </>
  );
}
