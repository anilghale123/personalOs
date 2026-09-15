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
