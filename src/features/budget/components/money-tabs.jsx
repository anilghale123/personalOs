"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake, PiggyBank, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Money section's own navigation, for phones.
 *
 * Desktop reaches Budget, Debts and Savings goals through the sidebar's
 * nested links — on a phone the sidebar isn't there, which left three
 * quarters of the section unreachable. This is that sidebar group,
 * flattened into a scrollable row.
 */
const SECTIONS = [
  { href: "/app/budget/expenses", label: "Expenses", icon: Receipt },
  { href: "/app/budget/plan", label: "Budget", icon: Wallet },
  { href: "/app/budget/debts", label: "Debts", icon: Handshake },
  { href: "/app/budget/goals", label: "Savings", icon: PiggyBank },
];

export function MoneyTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Money sections"
      className="-mx-4 mb-4 overflow-x-auto px-4 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-1.5">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "bg-sand-200 text-sand-700 active:bg-sand-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
