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
}));
