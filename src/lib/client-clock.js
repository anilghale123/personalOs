"use client";

import * as React from "react";

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * React warns about `useLayoutEffect` during server rendering, and rightly —
 * there is no layout to read. Swapping it out keeps the warning away without
 * giving up the timing in the place it matters.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * State seeded from the viewer's clock, on the viewer's device.
 *
 * ## Why this is not just `useState(() => new Date())`
 *
 * The app shell and its tabs are prerendered at build time, which is what
 * lets Next prefetch them whole and makes switching tabs instant (see
 * `app/app/layout.jsx`). The flip side is that anything read from the clock
 * *during render* is read once, at build, and then frozen: "Good evening" on
 * a Tuesday morning, last month's week in the planner. Worse, the browser
 * would compute something different at hydration, and React would report the
 * mismatch and throw that part of the tree away.
 *
 * So the build's render gets `null` — screens show their own placeholder for
 * it — and the browser fills in the real value itself.
 *
 * ## Why a layout effect
 *
 * A passive effect runs *after* the browser paints, so arriving on a screen
 * would show one frame of the placeholder before the real value replaced it.
 * A layout effect runs before that paint, so a navigation into one of these
 * screens shows the right thing the first time it is drawn. On the initial
 * page load it still runs after hydration, so the markup React checks is the
 * markup the build wrote.
 *
 * @template T
 * @param {() => T} read called once, in the browser
 * @returns {[T|null, React.Dispatch<React.SetStateAction<T|null>>]}
 */
export function useClientClock(read) {
  // Held in a ref so callers can pass an inline arrow without re-reading.
  const readRef = React.useRef(read);
  readRef.current = read;

  const [value, setValue] = React.useState(null);

  useIsomorphicLayoutEffect(() => {
    // `?? ` rather than a plain assignment: a screen that set this itself
    // between render and effect (the planner's week pager) keeps its choice.
    setValue((held) => held ?? readRef.current());
  }, []);

  return [value, setValue];
}
