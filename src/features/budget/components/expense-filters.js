"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toDateKey } from "@/lib/utils";
import {
  compareMonthCursors,
  currentMonthCursor,
  cursorForDateKey,
  monthCursorRange,
} from "@/lib/months";
import { useBudgetStore } from "../store";
import { useIsomorphicLayoutEffect } from "@/lib/client-clock";

/**
 * The expenses screen's filter set, owned one level above the list.
 *
 * On a phone the filters live in their own tab, which means the list is
 * unmounted while they're being changed — so the state (and the fetch it
 * drives) has to sit above both, in the screen that is always mounted.
 */
export function useExpenseFilters({ earliestDate, cal }) {
  const loadExpenses = useBudgetStore((s) => s.loadExpenses);

  // A discovery's evidence rows link here with the day already selected,
  // so the user lands on exactly the expenses a finding was computed from.
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get("dateFrom") ?? "";
  const initialTo = searchParams.get("dateTo") ?? "";

  // With a monthly record the list opens on the current month, unless a
  // deep-link already pinned a range.
  const openingRange = React.useMemo(() => {
    if (initialFrom || initialTo || !earliestDate) return null;
    const cur = currentMonthCursor(cal, toDateKey());
    const earliest = cursorForDateKey(earliestDate, cal);
    return compareMonthCursors(earliest, cur) < 0 ? monthCursorRange(cur) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [q, setQ] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState(
    initialFrom || openingRange?.from || ""
  );
  const [dateTo, setDateTo] = React.useState(
    initialTo || openingRange?.to || ""
  );
  const [sort, setSort] = React.useState("date_desc");
  const [showFilters, setShowFilters] = React.useState(
    Boolean(initialFrom || initialTo)
  );

  /**
   * Re-read whenever a filter changes.
   *
   * The opening load runs **before the browser paints**, and not on a timer.
   * `loadExpenses` seeds the list from the copy saved on this device before
   * its first `await`, so running it here means the list is already on
   * screen the first time the screen is drawn. Deferring it — which a
   * passive effect or even a zero-delay timeout does — put a frame of
   * placeholder rows in front of a list the device already had.
   *
   * Later changes are a different matter: typing in the search box should
   * not fire a request per keystroke, so those stay debounced.
   */
  const firstLoad = React.useRef(true);
  useIsomorphicLayoutEffect(() => {
    const load = () =>
      loadExpenses({ q, categoryId, paymentMethod, dateFrom, dateTo, sort });
    if (firstLoad.current) {
      firstLoad.current = false;
      load();
      return undefined;
    }
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryId, paymentMethod, dateFrom, dateTo, sort]);

  const clearFilters = React.useCallback(() => {
    setQ("");
    setCategoryId("");
    setPaymentMethod("");
    setDateFrom("");
    setDateTo("");
  }, []);

  return {
    q,
    setQ,
    categoryId,
    setCategoryId,
    paymentMethod,
    setPaymentMethod,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sort,
    setSort,
    showFilters,
    setShowFilters,
    clearFilters,
  };
}
