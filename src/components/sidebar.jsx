"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutEverywhere } from "@/lib/sign-out";
import {
  Target,
  TrendingUp,
  BookOpen,
  CalendarDays,
  Receipt,
  Wallet,
  Handshake,
  PiggyBank,
  ChevronDown,
  LogOut,
  Sparkles,
  MessageSquarePlus,
} from "lucide-react";
import { FeedbackDialog } from "@/features/feedback/feedback-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallButton } from "@/components/install-button";
import { ProfileDialog } from "@/features/auth/components/profile-dialog";
import { ProBadge } from "@/components/pro-badge";
import { useAppUser } from "@/components/app-user";

/**
 * Discoveries leads, because that is what this app is for. Everything
 * else is where the data comes from.
 */
const NAV = [
  { href: "/app", label: "Home", icon: Sparkles },
  {
    href: "/app/budget",
    label: "Money",
    icon: Receipt,
    children: [
      { href: "/app/budget/expenses", label: "Expenses", icon: Receipt },
      { href: "/app/budget/plan", label: "Budget", icon: Wallet },
      { href: "/app/budget/debts", label: "Debts", icon: Handshake },
      { href: "/app/budget/goals", label: "Savings goals", icon: PiggyBank },
    ],
  },
  { href: "/app/planner", label: "Planner", icon: CalendarDays },
  { href: "/app/goals", label: "Habits & Goals", icon: Target },
  { href: "/app/journal", label: "Journal", icon: BookOpen },
  { href: "/app/portfolio", label: "Portfolio", icon: TrendingUp },
];

function isActivePath(pathname, href) {
  // /app is Discoveries, and /app/discoveries is its archive — both light
  // the same nav entry.
  if (href === "/app") {
    return pathname === "/app" || pathname.startsWith("/app/discoveries");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, nested = false }) {
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-md text-[15px] transition-colors",
        nested ? "px-3 py-1.5" : "px-3 py-2.5",
        active
          ? "bg-sand-200 font-semibold text-foreground"
          : "text-sand-700 hover:bg-sand-200/60 hover:text-foreground"
      )}
    >
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

function NavGroup({ item, pathname }) {
  const inSection = isActivePath(pathname, item.href);
  const [open, setOpen] = React.useState(inSection);

  React.useEffect(() => {
    if (inSection) setOpen(true);
  }, [inSection]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition-colors",
          inSection
            ? "font-semibold text-foreground"
            : "text-sand-700 hover:bg-sand-200/60 hover:text-foreground"
        )}
      >
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-sand-600 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {item.children.map((child) => (
            <NavLink
              key={child.href}
              item={child}
              pathname={pathname}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavContent({ user, pathname, onOpenProfile }) {
  return (
    <div className="flex h-full flex-col gap-6 px-[18px] py-[26px]">
      <div className="px-2.5">
        <BrandMark />
      </div>

      <nav className="flex-1 space-y-[3px] overflow-y-auto">
        {NAV.map((item) =>
          item.children ? (
            <NavGroup key={item.href} item={item} pathname={pathname} />
          ) : (
            <NavLink key={item.href} item={item} pathname={pathname} />
          )
        )}
      </nav>

      <div>
        <div className="flex items-center gap-1 rounded-md bg-sand-200 p-2.5">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex min-w-0 flex-1 items-center gap-[11px] text-left"
          >
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-clay-300 text-[13px] font-bold uppercase text-clay-900">
              {(user?.name || user?.email || "U").charAt(0)}
            </div>
            <div className="min-w-0 flex-1 leading-[1.25]">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                <span className="truncate">{user?.name || "User"}</span>
                {user?.isPro && <ProBadge />}
              </p>
              <p className="truncate text-xs text-sand-600">{user?.email}</p>
            </div>
          </button>
          <ThemeToggle />
        </div>
        <InstallButton className="mt-1 w-full justify-start" />
        <FeedbackDialog
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start text-sand-600"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Send feedback
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-sand-600"
          onClick={() => signOutEverywhere({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

/** Desktop sidebar — phones use BottomNav instead. */
export function Sidebar() {
  const pathname = usePathname();
  const user = useAppUser();
  const [profileOpen, setProfileOpen] = React.useState(false);
  // Local overlay so an edited name shows immediately without waiting
  // for a fresh sign-in to reissue the JWT (which is what the session
  // actually carries under the jwt strategy).
  const [patch, setPatch] = React.useState(null);
  const displayUser = React.useMemo(
    () => (user ? { ...user, ...patch } : null),
    [user, patch]
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r bg-background md:block">
        <NavContent
          user={displayUser}
          pathname={pathname}
          onOpenProfile={() => setProfileOpen(true)}
        />
      </aside>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={displayUser}
        onUpdated={(update) => setPatch((held) => ({ ...held, ...update }))}
      />
    </>
  );
}
