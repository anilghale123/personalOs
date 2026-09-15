/**
 * Category suggestions from free text — a spoken note ("spent 500 on momo")
 * or a bank statement description ("MB/ESEWA/9801234567/Load").
 *
 * Suggestions only: every screen that uses these lets the user change the
 * category before anything is saved. Pure and client-safe.
 *
 * Rules are ordered most-specific first, because descriptions often match
 * several: "ESEWA NT Prepaid topup" is a phone recharge paid through a
 * wallet, and the recharge is the more useful answer.
 */

/** Suggested when a transfer is detected; mapped to the user's own category. */
export const TRANSFERS = "Transfers";

const EXPENSE_RULES = [
  { category: "Internet & Phone", re: /nt ?prepaid|\bntc\b|ncell|top-?up|recharge|internet|wifi|worldlink|vianet|data ?pack|\bdish ?home\b/i },
  { category: "Utilities", re: /\bnea\b|electric|bijuli|khanepani|water bill|\bgas\b|cylinder/i },
  { category: "Eating Out", re: /momo|restaurant|\bcafe\b|coffee|lunch|dinner|breakfast|khaja|pizza|burger|foodmandu|\bchiya\b|\btea\b|bhojan/i },
  { category: "Food & Groceries", re: /grocer|vegetable|tarkari|bhat-?bhateni|big ?mart|\bmart\b|\bmilk\b|fruit|supermarket|\brice\b/i },
  { category: "Transport", re: /taxi|\bbus\b|pathao|indrive|fuel|petrol|diesel|\buber\b|parking|\bride\b|tootle|yango/i },
  { category: "Rent/Housing", re: /\brent\b|\bbhada\b|landlord/i },
  { category: "Health", re: /pharma|medicine|hospital|clinic|doctor|dental|aushadhi|\blab\b/i },
  { category: "Education", re: /school|college|tuition|course|\bbooks?\b|exam fee|university/i },
  { category: "Subscriptions", re: /subscription|spotify|netflix|youtube premium|icloud|chatgpt|google one/i },
  { category: "Entertainment", re: /movie|cinema|qfx|\bgames?\b|concert/i },
  { category: "Shopping", re: /daraz|shopping|clothes|shoes|sastodeal/i },
  { category: "Travel", re: /flight|hotel|\btrek|travel|buddha air|yeti air|shree air/i },
  { category: "Gifts & Donations", re: /\bgift|donation|charity/i },
  { category: "Personal Care", re: /salon|haircut|cosmetic|parlou?r/i },
  { category: TRANSFERS, re: /esewa|khalti|ime ?pay|fonepay|connect ?ips|\bft\b|fund transfer|transfer/i },
];

const INCOME_RULES = [
  { category: "Salary", re: /salary|\btalab\b|payroll|\bsal\b/i },
  { category: "Interest", re: /interest|\bint\.? ?(cr|credit)|\bbyaj\b/i },
  { category: "Refund", re: /refund|reversal|cash ?back|reversed/i },
  { category: "Business", re: /\bsales?\b|business|invoice|client payment/i },
  { category: "Transfer", re: /esewa|khalti|ime ?pay|fonepay|connect ?ips|\bft\b|fund transfer|transfer|received/i },
];

/** @returns {string|null} a default-category name, or `Transfers`, or null */
export function suggestExpenseCategory(text) {
  if (!text) return null;
  for (const rule of EXPENSE_RULES) if (rule.re.test(text)) return rule.category;
  return null;
}

/** @returns {string} one of INCOME_CATEGORIES */
export function suggestIncomeCategory(text) {
  if (text) for (const rule of INCOME_RULES) if (rule.re.test(text)) return rule.category;
  return "Other";
}

/** Looser matches for when the user renamed or never had a default category. */
const ALIASES = {
  [TRANSFERS]: /transfer|wallet|esewa|khalti/i,
  "Internet & Phone": /phone|mobile|internet|recharge|bills?/i,
  "Eating Out": /eat|restaurant|dining|food/i,
  "Food & Groceries": /grocer|food/i,
  Utilities: /utilit|bills?/i,
  "Rent/Housing": /rent|hous|home/i,
};

/**
 * Map a suggested category name onto one of the user's categories.
 *
 * Exact name first, then an alias pattern, then "Miscellaneous"/"Other",
 * then the first active category — so a row is never left uncategorised
 * (Expense requires a category) while the user can still change it.
 *
 * @param {Array<{_id: string, name: string, isArchived?: boolean}>} categories
 * @param {string|null} suggestion
 * @returns {string} category id, or "" when the user has no categories
 */
export function matchCategory(categories, suggestion) {
  const active = (categories || []).filter((c) => !c.isArchived);
  if (!active.length) return "";

  if (suggestion) {
    const lower = suggestion.toLowerCase();
    const exact = active.find((c) => c.name.toLowerCase() === lower);
    if (exact) return String(exact._id);

    const alias = ALIASES[suggestion];
    const aliased = alias && active.find((c) => alias.test(c.name));
    if (aliased) return String(aliased._id);
  }

  const fallback = active.find((c) => /misc|other|general/i.test(c.name));
  return String((fallback ?? active[0])._id);
}
