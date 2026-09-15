import { describe, expect, it } from "vitest";
import { parseVoiceTranscript } from "./voice-parse";

describe("parseVoiceTranscript — English", () => {
  it("parses a plain expense", () => {
    expect(parseVoiceTranscript("spent 500 on momo")).toEqual({
      amount: 500,
      type: "expense",
      category: "Eating Out",
      note: "Momo",
    });
  });

  it("parses income with a category", () => {
    expect(parseVoiceTranscript("income salary 35000")).toEqual({
      amount: 35000,
      type: "income",
      category: "Salary",
      note: "Salary",
    });
  });

  it.each([
    ["five thousand for rent", 5000],
    ["two thousand five hundred on groceries", 2500],
    ["one hundred and twenty for tea", 120],
    ["paid a hundred for parking", 100],
    ["spent 1,500 on pizza", 1500],
    ["spent 5k on shoes", 5000],
    ["2.5 lakh for bike", 250000],
    ["Rs. 450 taxi", 450],
  ])("%s → %d", (text, amount) => {
    expect(parseVoiceTranscript(text).amount).toBe(amount);
  });

  it("prefers the amount next to a currency word", () => {
    expect(parseVoiceTranscript("2 plates momo rs 300").amount).toBe(300);
  });

  it("lets the leading verb decide when both kinds of word appear", () => {
    expect(parseVoiceTranscript("paid rent 20000 from salary").type).toBe("expense");
    expect(parseVoiceTranscript("received 3000 refund").type).toBe("income");
  });
});

describe("parseVoiceTranscript — Nepali / Nepenglish (best effort)", () => {
  it.each([
    ["dui saya taxi", 200],
    ["paanch hajar kharcha rent", 5000],
    ["ek lakh talab", 100000],
  ])("%s → %d", (text, amount) => {
    expect(parseVoiceTranscript(text).amount).toBe(amount);
  });

  it("recognises talab as salary income", () => {
    const r = parseVoiceTranscript("talab 40000 aayo");
    expect(r.type).toBe("income");
    expect(r.category).toBe("Salary");
  });
});

describe("parseVoiceTranscript — Devanagari", () => {
  it("parses Devanagari digits, currency and the expense verb", () => {
    expect(parseVoiceTranscript("मोमोमा ५०० रुपैयाँ खर्च गरेँ")).toMatchObject({
      amount: 500,
      type: "expense",
      category: "Eating Out",
    });
  });

  it.each([
    ["दुई सय ट्याक्सी", 200],
    ["पाँच हजार घर भाडा", 5000],
    ["एक लाख पचास हजार", 150000],
    ["हजारको खाना", 1000],
    ["पच्चीस सय बिजुली बिल", 2500],
  ])("%s → %d", (text, amount) => {
    expect(parseVoiceTranscript(text).amount).toBe(amount);
  });

  it("keeps vowel signs intact so words still match", () => {
    expect(parseVoiceTranscript("दुई सय ट्याक्सी").category).toBe("Transport");
    expect(parseVoiceTranscript("पाँच हजार घर भाडा").category).toBe("Rent/Housing");
  });

  it("recognises Nepali income", () => {
    expect(parseVoiceTranscript("तलब ३५००० आयो")).toMatchObject({
      amount: 35000,
      type: "income",
      category: "Salary",
    });
  });
});

describe("parseVoiceTranscript — mixed Nepali and English", () => {
  it.each([
    ["500 ko momo khaye", 500, "expense", "Eating Out"],
    ["momo ma rs 300 kharcha", 300, "expense", "Eating Out"],
    ["salary ३५००० आयो", 35000, "income", "Salary"],
    ["taxi ko लागि दुई सय", 200, "expense", "Transport"],
    ["ncell recharge 500ko", 500, "expense", "Internet & Phone"],
  ])("%s", (text, amount, type, category) => {
    expect(parseVoiceTranscript(text)).toMatchObject({ amount, type, category });
  });

  it("does not treat the Nepali word 'k' (what) as a thousand", () => {
    expect(parseVoiceTranscript("k garne").amount).toBeNull();
  });
});

describe("parseVoiceTranscript — degrades gracefully", () => {
  it("returns a null amount rather than guessing", () => {
    const r = parseVoiceTranscript("bought some vegetables");
    expect(r.amount).toBeNull();
    expect(r.type).toBe("expense");
    expect(r.category).toBe("Food & Groceries");
  });

  it("handles empty input", () => {
    expect(parseVoiceTranscript("")).toEqual({
      amount: null,
      type: "expense",
      category: null,
      note: null,
    });
  });
});
