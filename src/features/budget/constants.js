/** Seeded on first load so the module is usable immediately. */
export const DEFAULT_CATEGORIES = [
  { name: "Food & Groceries", icon: "🛒", color: "#16a34a", type: "need" },
  { name: "Eating Out", icon: "🍽️", color: "#f97316", type: "want" },
  { name: "Transport", icon: "🚌", color: "#2563eb", type: "need" },
  { name: "Rent/Housing", icon: "🏠", color: "#7c3aed", type: "need" },
  { name: "Utilities", icon: "💡", color: "#0891b2", type: "need" },
  { name: "Internet & Phone", icon: "📶", color: "#0ea5e9", type: "need" },
  { name: "Health", icon: "🩺", color: "#dc2626", type: "need" },
  { name: "Education", icon: "📚", color: "#4338ca", type: "need" },
  { name: "Shopping", icon: "🛍️", color: "#db2777", type: "want" },
  { name: "Entertainment", icon: "🎬", color: "#9333ea", type: "want" },
  { name: "Subscriptions", icon: "🔁", color: "#0d9488", type: "want" },
  { name: "Gifts & Donations", icon: "🎁", color: "#e11d48", type: "want" },
  { name: "Travel", icon: "✈️", color: "#0284c7", type: "want" },
  { name: "Personal Care", icon: "🧴", color: "#c026d3", type: "want" },
  { name: "Miscellaneous", icon: "📦", color: "#64748b", type: "want" },
];

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "wallet", label: "Wallet" },
  { id: "other", label: "Other" },
];

export const CATEGORY_TYPES = [
  { id: "need", label: "Need", tone: "secondary" },
  { id: "want", label: "Want", tone: "warning" },
  { id: "savings", label: "Savings/Investment", tone: "success" },
];

export const SORT_OPTIONS = [
  { id: "date_desc", label: "Newest first" },
  { id: "date_asc", label: "Oldest first" },
  { id: "amount_desc", label: "Highest amount" },
  { id: "amount_asc", label: "Lowest amount" },
];

export const RECURRENCE_FREQUENCIES = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];
