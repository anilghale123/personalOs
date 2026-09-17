"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

/**
 * Sticky phone brand row. Transparent at rest; once the page scrolls it
 * gains a hairline and a soft shadow so content reads as passing under it.
 * Tapping the mark goes home (Discoveries).
 */
export function MobileTopBar() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    // Phones scroll the app pane rather than the page (see the app layout).
    const pane = document.getElementById("app-scroll");
    const onScroll = () =>
      setScrolled(window.scrollY > 4 || (pane?.scrollTop ?? 0) > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    pane?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      pane?.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center justify-between px-4 transition-[background-color,box-shadow,border-color] duration-200 md:hidden",
        "border-b border-transparent bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        scrolled && "border-border/60 shadow-sm"
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <Link href="/app" aria-label="Discoveries — home" className="inline-flex h-11 items-center">
        <BrandMark />
      </Link>
    </header>
  );
}
