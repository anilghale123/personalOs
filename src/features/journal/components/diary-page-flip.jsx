"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const FLIP_MS = 720;
const SPIRAL_RINGS = 45;

function DiarySpiral() {
  return (
    <div className="diary-spiral" aria-hidden>
      <div className="diary-spiral-wire" />
      {Array.from({ length: SPIRAL_RINGS }, (_, i) => (
        <div key={i} className="diary-spiral-ring" />
      ))}
    </div>
  );
}

/**
 * Spiral-bound diary page — spiral on the LEFT, page turns from the left edge.
 */
export function DiaryPageFlip({
  activeDate,
  onNavigate,
  children,
  className,
}) {
  const [flip, setFlip] = React.useState(null);
  const [frozen, setFrozen] = React.useState(false);
  const flipperRef = React.useRef(null);

  const resetFlipper = React.useCallback(() => {
    const el = flipperRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.classList.remove("diary-flip-next", "diary-flip-prev");
    void el.offsetHeight;
    el.style.transition = "";
  }, []);

  const navigate = React.useCallback(
    async (direction, targetDate) => {
      if (flip || targetDate === activeDate) return;

      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReduced) {
        await onNavigate(targetDate);
        return;
      }

      setFrozen(true);
      setFlip(direction);

      await new Promise((r) => setTimeout(r, FLIP_MS));

      resetFlipper();
      setFlip(null);
      setFrozen(false);

      await onNavigate(targetDate);
    },
    [activeDate, flip, onNavigate, resetFlipper]
  );

  React.useEffect(() => {
    const handler = (e) => {
      const { direction, targetDate } = e.detail || {};
      if (direction && targetDate) navigate(direction, targetDate);
    };
    window.addEventListener("diary-navigate", handler);
    return () => window.removeEventListener("diary-navigate", handler);
  }, [navigate]);

  return (
    <div className={cn("diary-wrapper", className)}>
      <DiarySpiral />

      <div className="diary-scene">
        <div className="diary-page-underlay journal-lokta" aria-hidden />

        <div
          ref={flipperRef}
          className={cn(
            "diary-page-flipper journal-lokta",
            flip === "next" && "diary-flip-next",
            flip === "prev" && "diary-flip-prev"
          )}
        >
          <div
            className={cn(
              "diary-page-face diary-page-front",
              frozen && "pointer-events-none select-none"
            )}
          >
            {children}
          </div>
          <div className="diary-page-face diary-page-back" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function dispatchDiaryNavigate(direction, targetDate) {
  window.dispatchEvent(
    new CustomEvent("diary-navigate", {
      detail: { direction, targetDate },
    })
  );
}

export function shiftDate(key, days) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
