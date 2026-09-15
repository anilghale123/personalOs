import { create } from "zustand";
import { newIdempotencyKey } from "@/lib/client-keys";
import { toMinorUnits } from "@/lib/money";
import { readSnapshot, sameData, writeSnapshot } from "@/lib/snapshot";
import { EXPENSE_PAGE_SIZE } from "./constants";

const JSON_HEADERS = { "Content-Type": "application/json" };

// One page of expenses. Defined in ./constants so the store, the server
// action that renders the first page, and the API route default cannot drift.
const PAGE_SIZE = EXPENSE_PAGE_SIZE;

/**
 * How long a cached category breakdown stays usable.
 *
 * Two minutes, and the number is safe because correctness does not rest on
 * it: every expense mutation clears the cache outright via `refreshSummary`.
 * The TTL only bounds staleness from changes made *elsewhere* — another tab,
 * or a phone — which is exactly the case where being a minute behind costs
 * nothing.
 */
const BREAKDOWN_TTL_MS = 2 * 60 * 1000;

/**
 * Rows shown when a category row is expanded.
 *
 * The same size as one page of the main list, so "a page" means one thing
 * everywhere. It stays capped because this is an explanation of a total, not a
 * second expense list — an expanded row that pushes the date and payment
 * controls off-screen has stopped being an inline detail.
 */
const DETAIL_PAGE_SIZE = EXPENSE_PAGE_SIZE;

/** Query string for the first page of the list under a filter set. */
function expenseParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  params.set("limit", String(PAGE_SIZE));
  return params;
}

/**
 * Only the plain month (or all-time) list is saved on the device: it is
 * what opens every time, while a search or category filter is a one-off.
 */
function isPlainList(filters) {
  return !filters.q && !filters.categoryId && !filters.paymentMethod && !filters.tag;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.json();
}

/** Only the newest list request may write to the store. */
let latestExpenseRequest = 0;

/**
 * Budget store — categories + expenses for the currently loaded filter
 * set, with optimistic mutations (matching the vault/planner stores).
 * Delete is soft (marks `deletedAt`) so callers can offer an undo toast
 * instead of a confirm dialog.
 *
 * Screens paint from copies saved on this device (lib/snapshot) and every
 * load re-reads the server right after. A background result is applied only
 * if nothing was edited meanwhile, and every successful edit updates the
 * saved copy — so reopening the app never shows data from before your own
 * change.
 */
export const useBudgetStore = create((set, get) => ({
  categories: [],
  expenses: [],
  totalPaisa: 0,
  /** How many expenses match the filter in total, not how many are loaded. */
  matchCount: 0,
  hasMore: false,
  filters: { sort: "date_desc" },
  loading: false,
  loadingMore: false,
  // The oldest expense date on record ('YYYY-MM-DD'), refreshed by every
  // expenses fetch — drives whether the monthly record pager appears.
  earliestDate: null,
  /** The signed-in user — namespaces what is saved on this device. */
  ownerId: null,
  /** True once the list holds real rows (saved or fetched), not a blank start. */
  expensesReady: false,

  setOwner: (ownerId) => set({ ownerId }),

  setCategories: (categories) => set({ categories }),
  /**
   * Seed the list from server-rendered data. `count` is the size of the whole
   * filtered set, not of `expenses` — passing the page length would make the
   * running total and the "load more" control disagree with the server.
   */
  setExpenses: (expenses, totalPaisa, meta = {}) =>
    set({
      expenses,
      totalPaisa,
      matchCount: meta.count ?? expenses.length,
      hasMore: Boolean(meta.hasMore),
    }),
  setFilters: (filters) => set({ filters }),
  setEarliestDate: (earliestDate) => set({ earliestDate }),

  /**
   * Save the list as it now stands, after an add, edit or delete — so the
   * next open shows your change instantly instead of the list before it.
   */
  saveExpenseSnapshot() {
    const { filters, expenses, totalPaisa, matchCount, hasMore, ownerId } = get();
    if (!isPlainList(filters)) return;
    const rows = expenses.filter((e) => !e.isOptimistic);
    writeSnapshot(ownerId, `expenses:${expenseParams(filters).toString()}`, {
      // One page's worth, matching what a fresh load returns.
      expenses: rows.slice(0, PAGE_SIZE),
      totalPaisa,
      count: matchCount,
      hasMore: hasMore || rows.length > PAGE_SIZE,
    });
  },

  /**
   * Load the first page for a filter set.
   *
   * `totalPaisa` and `count` describe the **whole** filtered set, not the
   * page — the server aggregates them — so the running total stays correct
   * while only one page of rows crosses the wire.
   *
   * The saved copy for these filters (if any) is shown first; the server's
   * result replaces it unless a newer load or an edit got there first.
   */
  async loadExpenses(filters) {
    set({ loading: true, filters: { ...get().filters, ...filters } });
    const current = get().filters;
    const params = expenseParams(current);
    const snapshotKey = `expenses:${params.toString()}`;
    const saveable = isPlainList(current);
    const requestId = ++latestExpenseRequest;

    if (saveable) {
      const saved = readSnapshot(get().ownerId, snapshotKey);
      if (saved) {
        set({
          expenses: saved.expenses,
          totalPaisa: saved.totalPaisa,
          matchCount: saved.count,
          hasMore: saved.hasMore,
          expensesReady: true,
        });
      }
    }
    const shown = get().expenses;

    try {
      const res = await fetch(`/api/budget/expenses?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load expenses");
      const data = await res.json();
      // A newer filter change, or an add/edit/delete made while this was in
      // flight, owns the list now.
      if (requestId !== latestExpenseRequest || get().expenses !== shown) return;

      const page = {
        expenses: data.expenses,
        totalPaisa: data.totalPaisa,
        count: data.count ?? data.expenses.length,
        hasMore: Boolean(data.hasMore),
      };
      if (saveable) writeSnapshot(get().ownerId, snapshotKey, page);

      const unchanged =
        get().totalPaisa === page.totalPaisa && sameData(get().expenses, page.expenses);
      set({
        ...(unchanged ? {} : { expenses: page.expenses, totalPaisa: page.totalPaisa }),
        matchCount: page.count,
        hasMore: page.hasMore,
        ...(data.earliestDate !== undefined
          ? { earliestDate: data.earliestDate }
          : {}),
      });
    } finally {
      if (requestId === latestExpenseRequest) {
        set({ loading: false, expensesReady: true });
      }
    }
  },

  /** Append the next page, keeping the current filter set. */
  async loadMoreExpenses() {
    const { loadingMore, hasMore, expenses, filters } = get();
    if (loadingMore || !hasMore) return;
    set({ loadingMore: true });

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set("limit", String(PAGE_SIZE));
    params.set("skip", String(expenses.length));

    try {
      const res = await fetch(`/api/budget/expenses?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load more expenses");
      const data = await res.json();
      // Dedupe by id: an expense added between page loads would otherwise
      // shift the offset window and repeat a row.
      const seen = new Set(get().expenses.map((e) => e._id));
      const fresh = (data.expenses ?? []).filter((e) => !seen.has(e._id));
      set({
        expenses: [...get().expenses, ...fresh],
        totalPaisa: data.totalPaisa,
        matchCount: data.count ?? get().matchCount,
        hasMore: Boolean(data.hasMore),
      });
    } finally {
      set({ loadingMore: false });
    }
  },

  async addExpense(payload) {
    const tempId = `temp-${Date.now()}`;
    /**
     * The payload carries `amount` in rupees, which is what the API expects.
     * The optimistic row and running total need paisa, so convert here rather
     * than reading a `payload.amountPaisa` that was never set — that read was
     * silently `undefined`, so the total sat still until the refetch landed.
     */
    const amountPaisa = toMinorUnits(payload.amount);
    const optimistic = {
      ...payload,
      amountPaisa,
      _id: tempId,
      isOptimistic: true,
    };
    const before = get().expenses;
    const beforeTotal = get().totalPaisa;
    const beforeCount = get().matchCount;
    set({
      expenses: [optimistic, ...before],
      totalPaisa: beforeTotal + amountPaisa,
      matchCount: beforeCount + 1,
    });
    try {
      const res = await fetch("/api/budget/expenses", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add expense");
      const saved = await res.json();
      set({
        expenses: get().expenses.map((e) => (e._id === tempId ? saved : e)),
      });
      get().saveExpenseSnapshot();
      get().refreshSummary();
      return saved;
    } catch (err) {
      // Restore the captured values rather than subtracting from the current
      // ones — a concurrent add would otherwise leave the total wrong.
      set({
        expenses: before,
        totalPaisa: beforeTotal,
        matchCount: beforeCount,
      });
      throw err;
    }
  },

  async updateExpense(id, patch) {
    const before = get().expenses;
    const beforeTotal = get().totalPaisa;
    // An edit can change the amount, so the running total has to move with it.
    const previous = before.find((e) => e._id === id);
    const nextPaisa =
      patch.amount !== undefined ? toMinorUnits(patch.amount) : previous?.amountPaisa;
    const delta = (nextPaisa ?? 0) - (previous?.amountPaisa ?? 0);
    set({
      expenses: before.map((e) =>
        e._id === id ? { ...e, ...patch, amountPaisa: nextPaisa } : e
      ),
      totalPaisa: beforeTotal + delta,
    });
    try {
      const res = await fetch(`/api/budget/expenses/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update expense");
      const saved = await res.json();
      set({ expenses: get().expenses.map((e) => (e._id === id ? saved : e)) });
      get().saveExpenseSnapshot();
      get().refreshSummary();
      return saved;
    } catch (err) {
      set({ expenses: before, totalPaisa: beforeTotal });
      throw err;
    }
  },

  /** Soft-deletes and removes from the visible list; returns the removed row for undo. */
  async deleteExpense(id) {
    const before = get().expenses;
    const beforeTotal = get().totalPaisa;
    const beforeCount = get().matchCount;
    const removed = before.find((e) => e._id === id);
    set({
      expenses: before.filter((e) => e._id !== id),
      totalPaisa: beforeTotal - (removed?.amountPaisa || 0),
      matchCount: Math.max(0, beforeCount - 1),
    });
    try {
      const res = await fetch(`/api/budget/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove that expense");
      get().saveExpenseSnapshot();
      get().refreshSummary();
      return removed;
    } catch (err) {
      // Restore captured values, not arithmetic on the current ones.
      set({ expenses: before, totalPaisa: beforeTotal, matchCount: beforeCount });
      throw err;
    }
  },

  /** Restores a soft-deleted expense (undo toast action). */
  async undoDeleteExpense(removed) {
    if (!removed) return;
    set({
      expenses: [removed, ...get().expenses],
      totalPaisa: get().totalPaisa + (removed.amountPaisa || 0),
    });
    try {
      const res = await fetch(`/api/budget/expenses/${removed._id}/undo`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      get().saveExpenseSnapshot();
      get().refreshSummary();
    } catch {
      set({
        expenses: get().expenses.filter((e) => e._id !== removed._id),
        totalPaisa: get().totalPaisa - (removed.amountPaisa || 0),
      });
    }
  },

  async addCategory(payload) {
    const res = await fetch("/api/budget/categories", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to add category");
    const created = await res.json();
    set({ categories: [...get().categories, created] });
    return created;
  },

  async updateCategory(id, patch) {
    const before = get().categories;
    set({
      categories: before.map((c) => (c._id === id ? { ...c, ...patch } : c)),
    });
    try {
      const res = await fetch(`/api/budget/categories/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update category");
      const saved = await res.json();
      set({ categories: get().categories.map((c) => (c._id === id ? saved : c)) });
      return saved;
    } catch (err) {
      set({ categories: before });
      throw err;
    }
  },

  /** Delete a category — must choose reassign or archive; throws a 409-shaped error otherwise. */
  async deleteCategory(id, { reassignTo, archive } = {}) {
    const params = new URLSearchParams();
    if (reassignTo) params.set("reassignTo", reassignTo);
    if (archive) params.set("archive", "true");
    const res = await fetch(`/api/budget/categories/${id}?${params.toString()}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Failed to delete category");
      err.status = res.status;
      err.expenseCount = data.expenseCount;
      throw err;
    }
    if (data.archived) {
      set({
        categories: get().categories.map((c) =>
          c._id === id ? { ...c, isArchived: true } : c
        ),
      });
    } else {
      set({ categories: get().categories.filter((c) => c._id !== id) });
    }
    return data;
  },

  // ── The rest of the Money section ────────────────────────────────────
  /** True once categories, budget, debts and goals hold real data. */
  moneyReady: false,

  /** Fill the section from the copy saved on this device last time. */
  seedMoney: (saved) =>
    set({
      categories: saved.categories ?? [],
      summary: saved.summary ?? null,
      debts: saved.debts ?? [],
      financialGoals: saved.financialGoals ?? [],
      moneyReady: true,
    }),

  /**
   * Re-read categories, the budget summary, debts and savings goals.
   *
   * Each is applied only if it changed and was not edited here while the
   * request was out — a debt added mid-refresh must not vanish under an
   * older list. One failing request leaves the others to land.
   */
  async refreshMoney() {
    const fields = ["categories", "summary", "debts", "financialGoals"];
    const before = Object.fromEntries(fields.map((f) => [f, get()[f]]));
    const period = get().budgetPeriod;

    const results = await Promise.allSettled([
      getJson("/api/budget/categories"),
      getJson(`/api/budget/budgets?period=${period}`),
      getJson("/api/budget/debts"),
      getJson("/api/budget/goals"),
    ]);

    const next = {};
    results.forEach((result, i) => {
      const field = fields[i];
      if (result.status !== "fulfilled") return;
      if (get()[field] !== before[field]) return;
      if (field === "summary" && get().budgetPeriod !== period) return;
      if (!sameData(before[field], result.value)) next[field] = result.value;
    });
    set({ ...next, moneyReady: true });
  },

  // ── Budgets ──────────────────────────────────────────────────────────
  budgetPeriod: "monthly",
  summary: null,
  loadingSummary: false,

  setSummary: (summary) => set({ summary }),

  async loadSummary(period) {
    const next = period || get().budgetPeriod;
    set({ loadingSummary: true, budgetPeriod: next });
    try {
      const res = await fetch(`/api/budget/budgets?period=${next}`);
      if (!res.ok) throw new Error();
      set({ summary: await res.json() });
    } finally {
      set({ loadingSummary: false });
    }
  },

  /**
   * Re-reads the budget summary after an expense changes, so the
   * over-budget warning can never lag behind the list it sits above.
   * A no-op until the summary has been loaded at least once.
   */
  refreshSummary() {
    // Any expense change invalidates every cached breakdown *and* every
    // cached per-category detail. Dropped wholesale rather than patched: a
    // single expense can move between categories, so working out which
    // entries are still valid costs more than recomputing the one being read.
    set({ breakdownCache: {}, breakdownDetailCache: {} });
    if (!get().summary) return;
    get().loadSummary();
  },

  /* ── Category breakdown (the Filter tab) ──────────────────────────── */

  /**
   * Cached breakdowns, keyed by filter.
   *
   * The Filter tab is unmounted whenever another tab is showing, so its
   * effect re-ran on every single visit — a 250ms debounce and then a network
   * round trip to recompute numbers that had not changed. Holding the result
   * here means reopening the tab with the same filters paints instantly.
   */
  breakdownCache: {},

  /**
   * Is there a usable cached breakdown for these filters?
   *
   * Lets the panel decide whether to debounce. A cache hit should paint
   * immediately; only a real request needs the keystroke coalescing.
   */
  hasFreshBreakdown(filters) {
    const params = new URLSearchParams();
    for (const key of ["paymentMethod", "dateFrom", "dateTo", "q"]) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const cached = get().breakdownCache[params.toString()];
    return Boolean(cached && Date.now() - cached.at < BREAKDOWN_TTL_MS);
  },

  /**
   * Fetch a breakdown, or return the cached one.
   *
   * @param {object} filters the non-category filters the panel applies
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<{rows: object[], fromCache: boolean}>}
   */
  async loadBreakdown(filters, { signal } = {}) {
    const params = new URLSearchParams();
    for (const key of ["paymentMethod", "dateFrom", "dateTo", "q"]) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const key = params.toString();

    const cached = get().breakdownCache[key];
    if (cached && Date.now() - cached.at < BREAKDOWN_TTL_MS) {
      return { rows: cached.rows, fromCache: true };
    }

    const res = await fetch(`/api/budget/expenses/breakdown?${key}`, { signal });
    if (!res.ok) throw new Error("Could not load the breakdown");
    const data = await res.json();
    const rows = data.rows ?? [];

    set({
      breakdownCache: { ...get().breakdownCache, [key]: { rows, at: Date.now() } },
    });

    return { rows, fromCache: false };
  },

  /**
   * The expenses behind one category row, for the expandable breakdown.
   *
   * Reuses `/api/budget/expenses` rather than adding an endpoint: it already
   * validates, rate limits, paginates and returns exactly these fields, and a
   * second route computing the same thing is a second place for the two to
   * drift apart.
   *
   * The *other* filters are carried through but the category comes from the
   * row being opened — matching how the breakdown itself is built, so the
   * numbers inside a row always add up to the total shown on it.
   */
  breakdownDetailCache: {},

  async loadCategoryExpenses(categoryId, filters, { signal } = {}) {
    const params = new URLSearchParams();
    params.set("categoryId", categoryId);
    for (const key of ["paymentMethod", "dateFrom", "dateTo", "q"]) {
      if (filters[key]) params.set(key, filters[key]);
    }
    params.set("sort", "amount_desc");
    // Enough to explain a category without becoming a second expense list;
    // the row reports the full count either way.
    params.set("limit", String(DETAIL_PAGE_SIZE));

    const key = params.toString();
    const cached = get().breakdownDetailCache[key];
    if (cached && Date.now() - cached.at < BREAKDOWN_TTL_MS) {
      return { ...cached.value, fromCache: true };
    }

    const res = await fetch(`/api/budget/expenses?${key}`, { signal });
    if (!res.ok) throw new Error("Could not load those expenses");
    const data = await res.json();

    const value = {
      expenses: data.expenses ?? [],
      count: data.count ?? (data.expenses?.length ?? 0),
      totalPaisa: data.totalPaisa ?? 0,
    };

    set({
      breakdownDetailCache: {
        ...get().breakdownDetailCache,
        [key]: { value, at: Date.now() },
      },
    });

    return { ...value, fromCache: false };
  },

  /** Set or clear one budget line — an amount of 0 removes it. */
  async setBudget({ scope, categoryId, amount, carryForward }) {
    const res = await fetch("/api/budget/budgets", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        period: get().budgetPeriod,
        scope,
        categoryId,
        amount,
        carryForward,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save budget");
    const summary = await res.json();
    set({ summary });
    return summary;
  },

  // ── Debts ────────────────────────────────────────────────────────────
  debts: [],

  setDebts: (debts) => set({ debts }),

  async loadDebts() {
    const res = await fetch("/api/budget/debts");
    if (!res.ok) return;
    set({ debts: await res.json() });
  },

  async addDebt(payload) {
    const res = await fetch("/api/budget/debts", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to add debt");
    const created = await res.json();
    set({ debts: [created, ...get().debts] });
    return created;
  },

  async updateDebt(id, patch) {
    const res = await fetch(`/api/budget/debts/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to update debt");
    const saved = await res.json();
    set({ debts: get().debts.map((d) => (d._id === id ? saved : d)) });
    return saved;
  },

  async deleteDebt(id) {
    const before = get().debts;
    set({ debts: before.filter((d) => d._id !== id) });
    try {
      const res = await fetch(`/api/budget/debts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch (err) {
      set({ debts: before });
      throw err;
    }
  },

  /** Log a repayment ("payment") or extra borrowing ("borrow"). */
  async addDebtEntry(id, payload) {
    const res = await fetch(`/api/budget/debts/${id}/entries`, {
      method: "POST",
      headers: JSON_HEADERS,
      // The key makes a retry or double-tap a no-op server-side instead of
      // a second repayment against the balance.
      body: JSON.stringify({ ...payload, idempotencyKey: newIdempotencyKey() }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save entry");
    const saved = await res.json();
    set({ debts: get().debts.map((d) => (d._id === id ? saved : d)) });
    return saved;
  },

  async deleteDebtEntry(id, entryId) {
    const res = await fetch(`/api/budget/debts/${id}/entries/${entryId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to remove entry");
    const saved = await res.json();
    set({ debts: get().debts.map((d) => (d._id === id ? saved : d)) });
    return saved;
  },

  // ── Savings goals ────────────────────────────────────────────────────
  financialGoals: [],

  setFinancialGoals: (financialGoals) => set({ financialGoals }),

  async loadFinancialGoals() {
    const res = await fetch("/api/budget/goals");
    if (!res.ok) return;
    set({ financialGoals: await res.json() });
  },

  async addFinancialGoal(payload) {
    const res = await fetch("/api/budget/goals", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to add goal");
    const created = await res.json();
    set({ financialGoals: [created, ...get().financialGoals] });
    return created;
  },

  async updateFinancialGoal(id, patch) {
    const res = await fetch(`/api/budget/goals/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to update goal");
    const saved = await res.json();
    set({
      financialGoals: get().financialGoals.map((g) => (g._id === id ? saved : g)),
    });
    return saved;
  },

  async deleteFinancialGoal(id) {
    const before = get().financialGoals;
    set({ financialGoals: before.filter((g) => g._id !== id) });
    try {
      const res = await fetch(`/api/budget/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch (err) {
      set({ financialGoals: before });
      throw err;
    }
  },

  async addContribution(id, payload) {
    const res = await fetch(`/api/budget/goals/${id}/contributions`, {
      method: "POST",
      headers: JSON_HEADERS,
      // See addDebtEntry — guards against depositing the same amount twice.
      body: JSON.stringify({ ...payload, idempotencyKey: newIdempotencyKey() }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save contribution");
    const saved = await res.json();
    set({
      financialGoals: get().financialGoals.map((g) => (g._id === id ? saved : g)),
    });
    return saved;
  },

  async deleteContribution(id, entryId) {
    const res = await fetch(`/api/budget/goals/${id}/contributions/${entryId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to remove contribution");
    const saved = await res.json();
    set({
      financialGoals: get().financialGoals.map((g) => (g._id === id ? saved : g)),
    });
    return saved;
  },
}));
