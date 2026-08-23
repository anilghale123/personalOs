import { describe, expect, it } from "vitest";
import {
  MIN_WORDS_FOR_EXTRACTION,
  buildExtractionPrompt,
  parseExtraction,
  wordCount,
} from "./extract";

/**
 * These tests are mostly about hostile input. A wrong sentiment is worse
 * than a missing one — the engine would correlate against it just as
 * happily — so every one of these malformed cases must yield null rather
 * than a plausible-looking object.
 */

describe("parseExtraction", () => {
  it("parses a clean reply", () => {
    const result = parseExtraction(
      '{"sentiment": 0.6, "energy": "high", "themes": ["work", "family"], "stressors": ["deadline"]}'
    );
    expect(result).toEqual({
      sentiment: 0.6,
      energy: "high",
      themes: ["work", "family"],
      stressors: ["deadline"],
    });
  });

  it("survives markdown fences", () => {
    const result = parseExtraction(
      '```json\n{"sentiment": -0.4, "energy": "low", "themes": [], "stressors": []}\n```'
    );
    expect(result.sentiment).toBe(-0.4);
    expect(result.energy).toBe("low");
  });

  it("survives commentary either side of the JSON", () => {
    const result = parseExtraction(
      'Here is the JSON you asked for:\n{"sentiment": 0.2, "energy": "medium", "themes": ["rest"], "stressors": []}\nLet me know if you need anything else!'
    );
    expect(result.sentiment).toBe(0.2);
    expect(result.themes).toEqual(["rest"]);
  });

  it("handles braces inside string values without truncating", () => {
    const result = parseExtraction(
      '{"sentiment": 0.1, "energy": "low", "themes": ["a } brace"], "stressors": []}'
    );
    expect(result.themes).toEqual(["a } brace"]);
  });

  it("rejects a reply with no JSON at all", () => {
    expect(parseExtraction("I'm sorry, I can't help with that.")).toBeNull();
    expect(parseExtraction("")).toBeNull();
    expect(parseExtraction(null)).toBeNull();
  });

  it("rejects malformed JSON rather than guessing", () => {
    expect(parseExtraction('{"sentiment": 0.5, "energy": ')).toBeNull();
    expect(parseExtraction("{sentiment: 0.5}")).toBeNull();
  });

  it("rejects a missing or non-numeric sentiment", () => {
    expect(parseExtraction('{"energy": "high", "themes": []}')).toBeNull();
    expect(parseExtraction('{"sentiment": "positive", "energy": "high"}')).toBeNull();
    expect(parseExtraction('{"sentiment": null}')).toBeNull();
  });

  it("rejects a sentiment outside the stated range", () => {
    expect(parseExtraction('{"sentiment": 4.5}')).toBeNull();
    expect(parseExtraction('{"sentiment": -12}')).toBeNull();
  });

  it("accepts the extremes of the range", () => {
    expect(parseExtraction('{"sentiment": 1}').sentiment).toBe(1);
    expect(parseExtraction('{"sentiment": -1}').sentiment).toBe(-1);
    expect(parseExtraction('{"sentiment": 0}').sentiment).toBe(0);
  });

  it("drops an invented energy level instead of storing it", () => {
    const result = parseExtraction('{"sentiment": 0.3, "energy": "euphoric"}');
    expect(result.energy).toBeNull();
    expect(result.sentiment).toBe(0.3);
  });

  it("normalises, de-duplicates and caps the lists", () => {
    const result = parseExtraction(
      '{"sentiment": 0, "themes": ["Work", "work", "  REST  ", "a", "b", "c"], "stressors": ["X", "y", "z", "w"]}'
    );
    expect(result.themes).toEqual(["work", "rest", "a", "b"]);
    expect(result.stressors).toEqual(["x", "y", "z"]);
  });

  it("copes with lists that aren't lists", () => {
    const result = parseExtraction('{"sentiment": 0.1, "themes": "work", "stressors": null}');
    expect(result.themes).toEqual([]);
    expect(result.stressors).toEqual([]);
  });

  it("rejects a bare array or scalar", () => {
    expect(parseExtraction("[1, 2, 3]")).toBeNull();
    expect(parseExtraction("0.5")).toBeNull();
  });

  it("rounds sentiment to two places so stored values stay comparable", () => {
    expect(parseExtraction('{"sentiment": 0.123456}').sentiment).toBe(0.12);
  });
});

describe("wordCount", () => {
  it("counts whitespace-delimited words", () => {
    expect(wordCount("one two  three\nfour")).toBe(4);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});

describe("buildExtractionPrompt", () => {
  it("demands bare JSON and forbids inference beyond the text", () => {
    const prompt = buildExtractionPrompt("A day.");
    expect(prompt).toContain("ONLY valid JSON");
    expect(prompt).toContain("no markdown fences");
    expect(prompt).toContain("Do not infer beyond the text");
  });

  it("sets a floor below which extraction is not attempted", () => {
    expect(MIN_WORDS_FOR_EXTRACTION).toBeGreaterThan(0);
  });
});
