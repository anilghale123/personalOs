import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useBudgetStore } from "./store";

/**
 * The breakdown caches, exercised through the real store.
 *
 * The failure these guard against is the quiet kind: a cache key that omits
 * the category would serve one category's expenses under another's heading,
 * and every number on screen would look plausible. Nothing would error.
 */

const ORIGINAL_FETCH = global.fetch;

/** Records every URL requested, and answers with a canned payload. */
function mockFetch(payloadFor) {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => payloadFor(String(url)),
    };
  });
  return calls;
}

beforeEach(() => {
  // A store is a module singleton; reset the cache between tests or one
  // test's warm cache silently satisfies the next one's request.
  useBudgetStore.setState({ breakdownCache: {}, breakdownDetailCache: {} });
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("loadBreakdown", () => {
  it("fetches once, then serves the same filters from cache", async () => {
    const calls = mockFetch(() => ({ rows: [{ categoryId: "a", totalPaisa: 100, count: 1 }] }));
    const { loadBreakdown } = useBudgetStore.getState();

    const first = await loadBreakdown({ dateFrom: "2026-01-01" });
    const second = await loadBreakdown({ dateFrom: "2026-01-01" });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(calls).toHaveLength(1);
    expect(second.rows).toEqual(first.rows);
  });

  it("treats different filters as different entries", async () => {
    const calls = mockFetch(() => ({ rows: [] }));
    const { loadBreakdown } = useBudgetStore.getState();

    await loadBreakdown({ dateFrom: "2026-01-01" });
    await loadBreakdown({ dateFrom: "2026-02-01" });
    await loadBreakdown({ dateFrom: "2026-01-01", paymentMethod: "cash" });

    expect(calls).toHaveLength(3);
  });

  it("ignores the category filter, so opening a row cannot collapse the summary", async () => {
    // The breakdown is the thing you pick a category *from*; filtering it by
    // the chosen category would leave a one-row summary.
    const calls = mockFetch(() => ({ rows: [] }));
    const { loadBreakdown } = useBudgetStore.getState();

    await loadBreakdown({ dateFrom: "2026-01-01", categoryId: "abc" });

    expect(calls[0]).not.toContain("categoryId");
  });
});

describe("loadCategoryExpenses", () => {
  const detailPayload = (url) => ({
    // Echo the category back so a mixed-up cache is detectable.
    expenses: [{ _id: "e1", note: url.match(/categoryId=(\w+)/)?.[1], amountPaisa: 500 }],
    count: 1,
    totalPaisa: 500,
  });

  it("keys the cache by category, never mixing two together", async () => {
    const calls = mockFetch(detailPayload);
    const { loadCategoryExpenses } = useBudgetStore.getState();

    const a = await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01" });
    const b = await loadCategoryExpenses("bbb", { dateFrom: "2026-01-01" });

    expect(calls).toHaveLength(2);
    // The decisive assertion: B must not be served A's rows.
    expect(a.expenses[0].note).toBe("aaa");
    expect(b.expenses[0].note).toBe("bbb");
  });

  it("serves a repeat open of the same category from cache", async () => {
    const calls = mockFetch(detailPayload);
    const { loadCategoryExpenses } = useBudgetStore.getState();

    const first = await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01" });
    const second = await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01" });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("refetches when the surrounding filters change", async () => {
    const calls = mockFetch(detailPayload);
    const { loadCategoryExpenses } = useBudgetStore.getState();

    await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01" });
    await loadCategoryExpenses("aaa", { dateFrom: "2026-02-01" });
    await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01", paymentMethod: "card" });

    expect(calls).toHaveLength(3);
  });

  it("carries the category and the other filters into the request", async () => {
    const calls = mockFetch(detailPayload);
    const { loadCategoryExpenses } = useBudgetStore.getState();

    await loadCategoryExpenses("aaa", {
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      paymentMethod: "cash",
      q: "coffee",
    });

    const url = calls[0];
    expect(url).toContain("categoryId=aaa");
    expect(url).toContain("dateFrom=2026-01-01");
    expect(url).toContain("dateTo=2026-01-31");
    expect(url).toContain("paymentMethod=cash");
    expect(url).toContain("q=coffee");
    // Largest first — the rows that explain most of the total lead.
    expect(url).toContain("sort=amount_desc");
    // And bounded, so an expanded row cannot become a second expense list.
    expect(url).toMatch(/limit=\d+/);
  });

  it("reports the full count even when the rows are truncated", async () => {
    mockFetch(() => ({
      expenses: [{ _id: "e1", amountPaisa: 100 }],
      count: 40,
      totalPaisa: 4000,
    }));
    const { loadCategoryExpenses } = useBudgetStore.getState();

    const result = await loadCategoryExpenses("aaa", {});

    // The UI needs both to say "showing the 1 largest of 40" rather than
    // letting the visible rows quietly fail to add up to the heading.
    expect(result.expenses).toHaveLength(1);
    expect(result.count).toBe(40);
  });
});

describe("cache invalidation", () => {
  it("clears both caches when an expense changes", async () => {
    const calls = mockFetch(() => ({ rows: [], expenses: [], count: 0, totalPaisa: 0 }));
    const { loadBreakdown, loadCategoryExpenses } = useBudgetStore.getState();

    await loadBreakdown({ dateFrom: "2026-01-01" });
    await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01" });
    expect(calls).toHaveLength(2);

    /**
     * `refreshSummary` runs after every expense mutation. Correctness of the
     * two-minute TTL rests entirely on this: an edited expense can move
     * between categories, so both the totals and the per-category detail are
     * dropped rather than patched.
     */
    useBudgetStore.getState().refreshSummary();

    expect(useBudgetStore.getState().breakdownCache).toEqual({});
    expect(useBudgetStore.getState().breakdownDetailCache).toEqual({});

    await loadBreakdown({ dateFrom: "2026-01-01" });
    await loadCategoryExpenses("aaa", { dateFrom: "2026-01-01" });
    expect(calls).toHaveLength(4);
  });
});
