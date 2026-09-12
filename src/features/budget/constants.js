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

/** Monthly leads — it is how almost everyone actually thinks about a budget. */
export const BUDGET_PERIODS = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
];

export const DEBT_KINDS = [
  { id: "owe", label: "I owe", hint: "Money you have to pay back" },
  { id: "lent", label: "Owed to me", hint: "Money someone owes you" },
];

export const DEBT_ENTRY_TYPES = [
  { id: "payment", label: "Payment made", hint: "Reduces the balance" },
  { id: "borrow", label: "Extra borrowed", hint: "Increases the balance" },
];

/** Spend ratio at which the budget UI switches from calm to caution. */
export const BUDGET_WARNING_RATIO = 0.8;

/** Emoji shortlist offered when creating a savings goal. */
export const GOAL_ICONS = ["🎯", "🏠", "🚗", "✈️", "🎓", "💍", "🛡️", "💻", "🏥", "🎁"];

/**
 * Expenses fetched per page.
 *
 * One definition, imported by all three places that need to agree: the client
 * store's paging, the server action that renders the first page, and the API
 * route's default when a caller omits `limit`. They were three separate
 * literals, so changing the page size meant changing it in three files and
 * noticing nothing if you missed one.
 *
 * 20 rather than 50: a page is meant to be what fits on a screen plus a
 * little, not a batch that happens to be round. Twenty covers roughly a
 * fortnight of everyday spending, so the common case needs no second request
 * at all — and each request stays small on a phone connection.
 */
export const EXPENSE_PAGE_SIZE = 20;

/**
 * Hard ceiling on `limit`, whatever a caller asks for.
 *
 * Unrelated to the page size: this is the abuse guard that stops
 * `?limit=100000` turning the list endpoint into a full-table export.
 */
export const EXPENSE_MAX_PAGE_SIZE = 200;
