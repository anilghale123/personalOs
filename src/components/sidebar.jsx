"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Target,
  TrendingUp,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Receipt,
  Wallet,
  Handshake,
  PiggyBank,
  ChevronDown,
  Menu,
  X,
  LogOut,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallButton } from "@/components/install-button";
import { ProfileDialog } from "@/features/auth/components/profile-dialog";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/goals", label: "Goals & Habits", icon: Target },
  { href: "/planner", label: "Weekly Planner", icon: CalendarDays },
  {
    href: "/budget",
    label: "Budgeting",
    icon: Receipt,
    children: [
      { href: "/budget/expenses", label: "Expenses", icon: Receipt },
      { href: "/budget/plan", label: "Budget", icon: Wallet },
      { href: "/budget/debts", label: "Debts", icon: Handshake },
      { href: "/budget/goals", label: "Goals", icon: PiggyBank },
    ],
  },
  { href: "/portfolio", label: "Portfolio", icon: TrendingUp },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/review", label: "Weekly Review", icon: CalendarCheck },
];

function isActivePath(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onNavigate, nested = false }) {
  const Icon = item.icon;
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-lg text-sm transition-colors",
        nested ? "px-2.5 py-1.5" : "px-2.5 py-2",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-foreground")} />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

function NavGroup({ item, pathname, onNavigate }) {
  const Icon = item.icon;
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
          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
          inSection
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", inSection && "text-foreground")} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
          {item.children.map((child) => (
            <NavLink
              key={child.href}
              item={child}
              pathname={pathname}
              onNavigate={onNavigate}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavContent({ user, pathname, onNavigate, onOpenProfile }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CircleDot className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Personal OS</p>
          <p className="text-xs text-muted-foreground">
            Your operating system
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Modules
        </p>
        {NAV.map((item) =>
          item.children ? (
            <NavGroup
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ) : (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          )
        )}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-accent/60">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1 text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
              {(user?.name || user?.email || "U").charAt(0)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">
                {user?.name || "User"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </button>
          <ThemeToggle />
        </div>
        <InstallButton className="mt-1 w-full justify-start" />
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ user }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  // Local overlay so an edited name shows immediately without waiting
  // for a fresh sign-in to reissue the JWT (which is what the session
  // actually carries under the jwt strategy).
  const [displayUser, setDisplayUser] = React.useState(user);

  function handleOpenProfile() {
    setOpen(false);
    setProfileOpen(true);
  }

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card md:block">
        <NavContent user={displayUser} pathname={pathname} onOpenProfile={handleOpenProfile} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold">Personal OS</span>
        <div className="ml-auto">
          <InstallButton />
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-card animate-fade-in">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
            <NavContent
              user={displayUser}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
              onOpenProfile={handleOpenProfile}
            />
          </aside>
        </div>
      )}

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={displayUser}
        onUpdated={(patch) => setDisplayUser((u) => ({ ...u, ...patch }))}
      />
    </>
  );
}
