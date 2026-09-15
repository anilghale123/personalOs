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

  // Re-fetch whenever any filter changes. The opening load runs at once —
  // it paints from the saved copy, so a delay there is pure waiting; only
  // later changes (typing in search) are debounced.
  const firstLoad = React.useRef(true);
  React.useEffect(() => {
    const delay = firstLoad.current ? 0 : 250;
    firstLoad.current = false;
    const t = setTimeout(() => {
      loadExpenses({ q, categoryId, paymentMethod, dateFrom, dateTo, sort });
    }, delay);
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
