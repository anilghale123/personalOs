import { create } from "zustand";

/**
 * Vault store — portfolio holdings and SIPs with optimistic mutations.
 */
export const useVaultStore = create((set, get) => ({
  portfolio: [],
  sips: [],
  isImporting: false,
  importResult: null,

  setPortfolio: (portfolio) => set({ portfolio }),
  setSips: (sips) => set({ sips }),

  // Optimistic SIP add
  addSIP: (sip) => {
    const tempId = `temp-${Date.now()}`;
    const optimistic = { ...sip, _id: tempId, isOptimistic: true };
    set({ sips: [...get().sips, optimistic] });

    return fetch("/api/vault/sip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sip),
    })
      .then((r) => r.json())
      .then((saved) => {
        set({
          sips: get().sips.map((s) => (s._id === tempId ? saved : s)),
        });
        return saved;
      })
      .catch(() => {
        set({ sips: get().sips.filter((s) => s._id !== tempId) });
      });
  },

  importCSV: async (formData) => {
    set({ isImporting: true });
    const { importBrokerCSV } = await import("./actions");
    const result = await importBrokerCSV(formData);
    set({ isImporting: false, importResult: result });
    return result;
  },
}));
