import { create } from "zustand";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Budget store — categories + expenses for the currently loaded filter
 * set, with optimistic mutations (matching the vault/planner stores).
 * Delete is soft (marks `deletedAt`) so callers can offer an undo toast
 * instead of a confirm dialog.
 */
export const useBudgetStore = create((set, get) => ({
  categories: [],
  expenses: [],
  totalPaisa: 0,
  filters: { sort: "date_desc" },
  loading: false,

  setCategories: (categories) => set({ categories }),
  setExpenses: (expenses, totalPaisa) => set({ expenses, totalPaisa }),
  setFilters: (filters) => set({ filters }),

  async loadExpenses(filters) {
    set({ loading: true, filters: { ...get().filters, ...filters } });
    const params = new URLSearchParams();
    Object.entries(get().filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    try {
      const res = await fetch(`/api/budget/expenses?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      set({ expenses: data.expenses, totalPaisa: data.totalPaisa });
    } finally {
      set({ loading: false });
    }
  },

  async addExpense(payload) {
    const tempId = `temp-${Date.now()}`;
    const optimistic = { ...payload, _id: tempId, isOptimistic: true };
    const before = get().expenses;
    set({
      expenses: [optimistic, ...before],
      totalPaisa: get().totalPaisa + (payload.amountPaisa || 0),
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
      get().refreshSummary();
      return saved;
    } catch (err) {
      set({ expenses: before, totalPaisa: get().totalPaisa - (payload.amountPaisa || 0) });
      throw err;
    }
  },

  async updateExpense(id, patch) {
    const before = get().expenses;
    set({
      expenses: before.map((e) => (e._id === id ? { ...e, ...patch } : e)),
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
      get().refreshSummary();
      return saved;
    } catch (err) {
      set({ expenses: before });
      throw err;
    }
  },

  /** Soft-deletes and removes from the visible list; returns the removed row for undo. */
  async deleteExpense(id) {
    const before = get().expenses;
    const removed = before.find((e) => e._id === id);
    set({
      expenses: before.filter((e) => e._id !== id),
      totalPaisa: get().totalPaisa - (removed?.amountPaisa || 0),
    });
    try {
      const res = await fetch(`/api/budget/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      get().refreshSummary();
      return removed;
    } catch (err) {
      set({ expenses: before, totalPaisa: get().totalPaisa + (removed?.amountPaisa || 0) });
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
    if (!get().summary) return;
    get().loadSummary();
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
      body: JSON.stringify(payload),
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
      body: JSON.stringify(payload),
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
