/**
 * Category suggestions from free text — a spoken note ("spent 500 on momo",
 * "मोमोमा ५०० खर्च") or a bank statement description ("MB/ESEWA/98.../Load").
 *
 * Suggestions only: every screen that uses these lets the user change the
 * category. Pure and client-safe.
 *
 * Each rule has a Latin pattern (English and romanised Nepali, with word
 * boundaries) and a Devanagari pattern. The Devanagari ones have no `\b`:
 * JavaScript word boundaries don't apply to Devanagari, and postpositions
 * glue on ("मोमोमा"), so substring matching is what's wanted there.
 *
 * Rules are ordered most-specific first, because descriptions often match
 * several: "ESEWA NT Prepaid topup" is a phone recharge paid via a wallet.
 */

/** Suggested when a transfer is detected; mapped to the user's own category. */
export const TRANSFERS = "Transfers";

const EXPENSE_RULES = [
  {
    category: "Internet & Phone",
    re: /nt ?prepaid|\bntc\b|ncell|top-?up|recharge|internet|wifi|worldlink|vianet|data ?pack|\bdish ?home\b/i,
    ne: /रिचार्ज|टपअप|इन्टरनेट|मोबाइल|फोन/,
  },
  {
    category: "Utilities",
    re: /\bnea\b|electric|bijuli|khanepani|water bill|\bgas\b|cylinder/i,
    ne: /बिजुली|खानेपानी|पानी|ग्यास|सिलिन्डर/,
  },
  {
    category: "Eating Out",
    re: /momo|restaurant|\bcafe\b|coffee|lunch|dinner|breakfast|khaja|\bkhana\b|pizza|burger|foodmandu|\bchiya\b|\btea\b|bhojan|chowmein|chowmin/i,
    ne: /मोमो|खाजा|खाना|चिया|कफी|रेस्टुरेन्ट|चाउमिन|भोजन/,
  },
  {
    category: "Food & Groceries",
    re: /grocer|vegetable|tarkari|bhat-?bhateni|big ?mart|\bmart\b|\bmilk\b|\bdudh\b|fruit|supermarket|\brice\b|\bchamal\b|kirana/i,
    ne: /तरकारी|किराना|दूध|फलफूल|चामल|मार्ट/,
  },
  {
    category: "Transport",
    re: /taxi|\bbus\b|pathao|indrive|fuel|petrol|diesel|\buber\b|parking|\bride\b|tootle|yango|micro|tempo/i,
    ne: /ट्याक्सी|बस|पेट्रोल|डिजेल|पठाओ|माइक्रो|टेम्पो|पार्किङ/,
  },
  {
    category: "Rent/Housing",
    re: /\brent\b|\bbhada\b|landlord|ghar ?bhada/i,
    ne: /घर ?भाडा|कोठा ?भाडा/,
  },
  {
    category: "Health",
    re: /pharma|medicine|hospital|clinic|doctor|dental|aushadhi|\blab\b/i,
    ne: /औषधि|अस्पताल|डाक्टर|क्लिनिक|फार्मेसी/,
  },
  {
    category: "Education",
    re: /school|college|tuition|course|\bbooks?\b|exam fee|university|\bfee\b/i,
    ne: /स्कूल|कलेज|ट्युसन|किताब|शुल्क|फी/,
  },
  { category: "Subscriptions", re: /subscription|spotify|netflix|youtube premium|icloud|chatgpt|google one/i },
  { category: "Entertainment", re: /movie|cinema|qfx|\bgames?\b|concert/i, ne: /सिनेमा|फिल्म/ },
  { category: "Shopping", re: /daraz|shopping|clothes|shoes|sastodeal|\bluga\b|\bjutta\b/i, ne: /लुगा|जुत्ता|किनमेल/ },
  { category: "Travel", re: /flight|hotel|\btrek|travel|buddha air|yeti air|shree air/i, ne: /होटल|यात्रा|उडान/ },
  { category: "Gifts & Donations", re: /\bgift|donation|charity/i, ne: /उपहार|दान/ },
  { category: "Personal Care", re: /salon|haircut|cosmetic|parlou?r/i, ne: /सैलुन|कपाल/ },
  {
    category: TRANSFERS,
    re: /esewa|khalti|ime ?pay|fonepay|connect ?ips|\bft\b|fund transfer|transfer/i,
    ne: /इसेवा|खल्ती|ट्रान्सफर/,
  },
];

const INCOME_RULES = [
  { category: "Salary", re: /salary|\btalab\b|payroll|\bsal\b/i, ne: /तलब/ },
  { category: "Interest", re: /interest|\bint\.? ?(cr|credit)|\bbyaj\b/i, ne: /ब्याज/ },
  { category: "Refund", re: /refund|reversal|cash ?back|reversed/i, ne: /फिर्ता/ },
  { category: "Business", re: /\bsales?\b|business|invoice|client payment/i, ne: /व्यापार|बिक्री/ },
  {
    category: "Transfer",
    re: /esewa|khalti|ime ?pay|fonepay|connect ?ips|\bft\b|fund transfer|transfer|received/i,
    ne: /इसेवा|खल्ती|ट्रान्सफर/,
  },
];

function firstMatch(rules, text) {
  const normalized = String(text).normalize("NFC");
  for (const rule of rules) {
    if (rule.re.test(normalized) || rule.ne?.test(normalized)) return rule.category;
  }
  return null;
}

/** @returns {string|null} a default-category name, or `Transfers`, or null */
export function suggestExpenseCategory(text) {
  if (!text) return null;
  return firstMatch(EXPENSE_RULES, text);
}

/** @returns {string} one of INCOME_CATEGORIES */
export function suggestIncomeCategory(text) {
  return (text && firstMatch(INCOME_RULES, text)) || "Other";
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
