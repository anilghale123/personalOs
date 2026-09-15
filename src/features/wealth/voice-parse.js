/**
 * Turn a spoken sentence into a draft money entry.
 *
 *   "spent 500 on momo"          → { amount: 500,   type: "expense", category: "Eating Out", note: "Momo" }
 *   "income salary 35000"        → { amount: 35000, type: "income",  category: "Salary",     note: "Salary" }
 *   "dui saya taxi"              → { amount: 200,   type: "expense", category: "Transport" }
 *   "मोमोमा ५०० रुपैयाँ खर्च"      → { amount: 500,   type: "expense", category: "Eating Out" }
 *   "500 ko momo khaye"          → mixed Nepali/English works the same way
 *
 * Handles English, romanised Nepali and Devanagari — including Devanagari
 * digits and postpositions glued onto numbers ("हजारको", "500ko").
 * Deterministic and pure; the API route falls back to an LLM only when no
 * amount is found.
 */

import { suggestExpenseCategory, suggestIncomeCategory } from "./categorize";

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Romanised Nepali, as Whisper and browsers spell it.
  ek: 1, dui: 2, tin: 3, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, pach: 5, paach: 5,
  chha: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, bis: 20, pachis: 25, tis: 30,
  paitis: 35, chalis: 40, pachas: 50, pachaas: 50, sathi: 60, sattari: 70, assi: 80, nabbe: 90,
  // Devanagari.
  "एक": 1, "दुई": 2, "दुइ": 2, "तीन": 3, "तिन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छ": 6,
  "सात": 7, "आठ": 8, "नौ": 9, "दश": 10, "दस": 10, "एघार": 11, "बाह्र": 12, "तेह्र": 13,
  "चौध": 14, "पन्ध्र": 15, "सोह्र": 16, "सत्र": 17, "अठार": 18, "उन्नाइस": 19, "बीस": 20,
  "पच्चीस": 25, "तीस": 30, "पैंतीस": 35, "चालीस": 40, "पैंतालीस": 45, "पचास": 50,
  "साठी": 60, "सत्तरी": 70, "असी": 80, "नब्बे": 90,
};

const MULTIPLIERS = {
  hundred: 100, saya: 100, sae: 100, sau: 100, "सय": 100, "सये": 100,
  thousand: 1_000, k: 1_000, hajar: 1_000, hazar: 1_000, hajaar: 1_000, hazaar: 1_000,
  "हजार": 1_000, "हज़ार": 1_000,
  lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, "लाख": 100_000,
  million: 1_000_000, crore: 10_000_000, karod: 10_000_000, "करोड": 10_000_000,
};

/** Multipliers that can stand alone as "one of them" ("hajar ko khana" = 1000). */
const STANDALONE_MULTIPLIERS = new Set([
  "hundred", "saya", "thousand", "hajar", "hazar", "lakh", "सय", "हजार", "हज़ार", "लाख",
]);

const CURRENCY = new Set([
  "rs", "npr", "rupees", "rupee", "rupiya", "rupaiya", "rupaiyan", "nrs",
  "रुपैयाँ", "रूपैयाँ", "रुपैया", "रुपियाँ", "रु", "नेरु",
]);

/** CURRENCY as a lookup table, so currency words with a postposition match too. */
const CURRENCY_TABLE = Object.fromEntries([...CURRENCY].map((c) => [c, true]));

/** Postpositions that get glued onto numbers in speech: "हजारको", "500ko". */
const SUFFIXES = ["को", "मा", "ले", "लाई", "ko", "ma"];

const INCOME_LATIN = /\b(income|salary|earned|earn|received|receive|credited|deposit|deposited|refund|refunded|bonus|talab|kamaye|kamayo|got paid|payo|paye)\b/;
const EXPENSE_LATIN = /\b(spent|spend|spending|paid|pay|bought|buy|expense|kharcha|kharch|tireko|tiryo|tire|kine|kineko|cost)\b/;
const INCOME_NE = /(तलब|आम्दानी|कमाएँ|कमाए|कमायो|पाएँ|बोनस|जम्मा भयो)/;
const EXPENSE_NE = /(खर्च|तिरेँ|तिरे|तिर्यो|किनेँ|किने|किनेको|दिएँ)/;

/** Words that carry no meaning for the note once amount and type are known. */
const FILLER = new Set([
  "i", "i've", "ive", "have", "has", "just", "today", "spent", "spend", "paid", "pay", "for", "on",
  "at", "of", "the", "a", "an", "and", "bought", "buy", "expense", "income", "got", "received",
  "earned", "kharcha", "kharch", "ma", "ko", "le", "lagi", "cost", "costs", "was", "is", "it",
  "add", "my", "maile", "aaja", "khaye", "khayo", "gare", "garen",
  "मा", "को", "ले", "लागि", "मैले", "आज", "गरेँ", "गरे", "भयो", "खर्च", "तिरेँ", "तिरे", "किनेँ",
]);

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Normalise script and punctuation, and split digits from glued words. */
function tokenize(text) {
  return String(text)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/(\d)(?=[\p{L}\p{M}])/gu, "$1 ")
    .replace(/([\p{L}\p{M}])(?=\d)/gu, "$1 ")
    // \p{M} keeps Devanagari vowel signs — without it "दुई" becomes "दई".
    .replace(/[^\p{L}\p{M}\p{N}.'\s-]/gu, " ")
    .replace(/।/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean);
}

/** Look a word up in a table, also trying it without a glued postposition. */
function lookup(table, word) {
  if (word in table) return { key: word, value: table[word] };
  for (const suffix of SUFFIXES) {
    if (word.length > suffix.length && word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (stem in table) return { key: stem, value: table[stem] };
    }
  }
  return null;
}

/**
 * Read one run of number tokens starting at `i` — digits, words, or a mix
 * ("2 thousand 500", "दुई सय", "ek lakh pachas hajar").
 * @returns {{value: number, start: number, end: number}|null}
 */
function readNumber(tokens, i) {
  let total = 0;
  let current = 0;
  let used = false;
  let j = i;

  for (; j < tokens.length; j++) {
    const t = tokens[j];
    const unit = lookup(UNITS, t);
    const mult = lookup(MULTIPLIERS, t);

    if (/^\d+(\.\d+)?$/.test(t)) {
      if (current) break; // "500 200" is two numbers, not one
      current = parseFloat(t);
      used = true;
    } else if (unit) {
      current += unit.value;
      used = true;
    } else if ((t === "a" || t === "an") && !used && lookup(MULTIPLIERS, tokens[j + 1] ?? "")) {
      current = 1;
      used = true;
    } else if (mult && (used || STANDALONE_MULTIPLIERS.has(mult.key))) {
      if (!used) {
        current = 1;
        used = true;
      }
      if (mult.value === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * mult.value;
        current = 0;
      }
    } else if (
      t === "and" &&
      used &&
      j + 1 < tokens.length &&
      (lookup(UNITS, tokens[j + 1]) || /^\d/.test(tokens[j + 1]))
    ) {
      continue;
    } else {
      break;
    }
  }

  return used ? { value: total + current, start: i, end: j } : null;
}

/** Every number run in the sentence, left to right. */
function findNumbers(tokens) {
  const runs = [];
  for (let i = 0; i < tokens.length; ) {
    const run = readNumber(tokens, i);
    if (run && run.end > i) {
      runs.push(run);
      i = run.end;
    } else {
      i++;
    }
  }
  return runs;
}

function firstIndex(text, ...regexes) {
  const hits = regexes.map((re) => text.search(re)).filter((n) => n >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

function detectType(text) {
  const income = firstIndex(text, INCOME_LATIN, INCOME_NE);
  const expense = firstIndex(text, EXPENSE_LATIN, EXPENSE_NE);
  if (income === -1) return "expense";
  if (expense === -1) return "income";
  // Both present ("paid rent from salary") — the leading word decides.
  return income < expense ? "income" : "expense";
}

/** True when the text contains Devanagari. */
export function hasDevanagari(text) {
  return /[ऀ-ॿ]/.test(String(text ?? ""));
}

/**
 * @param {string} transcript
 * @returns {{amount: number|null, type: 'expense'|'income', category: string|null, note: string|null}}
 */
export function parseVoiceTranscript(transcript) {
  const raw = String(transcript ?? "").trim().normalize("NFC");
  const lower = raw.toLowerCase();
  const tokens = tokenize(raw);
  const runs = findNumbers(tokens).filter((r) => r.value > 0);

  // Prefer the number next to a currency word ("rs 500", "५०० रुपैयाँ");
  // otherwise the first one, which is how people phrase amounts.
  const nearCurrency = (idx) => idx >= 0 && idx < tokens.length && Boolean(lookup(CURRENCY_TABLE, tokens[idx]));
  const chosen = runs.find((r) => nearCurrency(r.start - 1) || nearCurrency(r.end)) ?? runs[0] ?? null;

  const type = detectType(lower);

  const noteTokens = tokens.filter((t, idx) => {
    if (chosen && idx >= chosen.start && idx < chosen.end) return false;
    return !CURRENCY.has(t) && !FILLER.has(t);
  });
  const noteText = noteTokens.join(" ").trim();
  const note = noteText ? noteText.charAt(0).toUpperCase() + noteText.slice(1) : null;

  const amount = chosen ? Math.round(chosen.value * 100) / 100 : null;

  return {
    amount,
    type,
    category: type === "income" ? suggestIncomeCategory(lower) : suggestExpenseCategory(lower),
    note: note ? note.slice(0, 200) : null,
  };
}
