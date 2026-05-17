"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Compass,
  Wallet,
  Leaf,
  Sparkles,
  Menu,
  X,
  LogOut,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  {
    href: "/compass",
    label: "Compass",
    icon: Compass,
    desc: "Goals & habits",
  },
  {
    href: "/vault",
    label: "Vault",
    icon: Wallet,
    desc: "Wealth & finance",
  },
  {
    href: "/sanctuary",
    label: "Sanctuary",
    icon: Leaf,
    desc: "Daily journal",
  },
  {
    href: "/oracle",
    label: "Oracle",
    icon: Sparkles,
    desc: "AI briefing",
  },
];

function NavContent({ user, pathname, onNavigate }) {
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

      <nav className="flex-1 space-y-1 px-3 py-2">
        <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Modules
        </p>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active && "text-foreground"
                )}
              />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
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
          <ThemeToggle />
        </div>
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

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card md:block">
        <NavContent user={user} pathname={pathname} />
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
              user={user}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
