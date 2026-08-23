import { describe, expect, it } from "vitest";
import {
  benjaminiHochberg,
  chiSquareUpperTail,
  cliffsDelta,
  correlationTest,
  fisherCI,
  kruskalWallis,
  laggedPairs,
  lagSeries,
  mannWhitneyU,
  mean,
  median,
  normalCdf,
  pairwise,
  pearson,
  permutationPCorrelation,
  permutationPGroups,
  permutationPKruskal,
  quantile,
  ranks,
  spearman,
  stdev,
  studentTTwoTailed,
  welchTTest,
} from "./stats";

/**
 * Every expectation below is a hand-computed or textbook value. These
 * functions decide what the product tells the user is true, so none of
 * them is allowed to be verified against its own output.
 */

describe("descriptive statistics", () => {
  it("computes mean, median and sample standard deviation", () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // Sample (n-1) stdev of that eight-value set is sqrt(32/7).
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it("returns null rather than a number when there is nothing to compute", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(stdev([5])).toBeNull();
  });

  it("interpolates quantiles the way R and NumPy do", () => {
    const xs = [1, 2, 3, 4];
    expect(quantile(xs, 0)).toBe(1);
    expect(quantile(xs, 1)).toBe(4);
    expect(quantile(xs, 0.25)).toBeCloseTo(1.75, 10);
    expect(quantile(xs, 0.9)).toBeCloseTo(3.7, 10);
  });

  it("gives tied values their average rank", () => {
    expect(ranks([1, 2, 2, 3])).toEqual([1, 2.5, 2.5, 4]);
    expect(ranks([10, 10, 10])).toEqual([2, 2, 2]);
  });
});

describe("correlation", () => {
  it("returns 1 for a perfect linear relationship", () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 12);
  });

  it("matches a hand-computed coefficient", () => {
    // dx·dy = 8, Σdx² = Σdy² = 10 → r = 0.8
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8, 12);
  });

  it("returns null for a constant series instead of dividing by zero", () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(pearson([1], [2])).toBeNull();
  });

  it("uses ranks, so a monotonic curve is a perfect Spearman but not a perfect Pearson", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 4, 9, 16, 25];
    expect(spearman(xs, ys)).toBeCloseTo(1, 12);
    expect(pearson(xs, ys)).toBeLessThan(0.99);
  });

  it("measures order, not magnitude, so one extreme value cannot rewrite it", () => {
    // A perfectly decreasing series where the largest value is a single
    // enormous outlier — the rent payment. The *ordering* is untouched,
    // so Spearman correctly reports a perfect inverse relationship while
    // Pearson is pulled to roughly half of it by that one magnitude.
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [1000000, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    expect(spearman(xs, ys)).toBeCloseTo(-1, 12);
    expect(pearson(xs, ys)).toBeCloseTo(-0.52224, 4);
  });

  it("derives a two-tailed p-value from the coefficient", () => {
    // r = 0.8, n = 5 → t = 2.3094, df = 3, p ≈ 0.1041
    const result = correlationTest(0.8, 5);
    expect(result.t).toBeCloseTo(2.309401, 5);
    expect(result.df).toBe(3);
    expect(result.p).toBeCloseTo(0.10405, 4);
  });

  it("brackets a correlation with a Fisher z interval", () => {
    // r = 0.5, n = 30 → the textbook interval (0.170, 0.729).
    const [lo, hi] = fisherCI(0.5, 30);
    expect(lo).toBeCloseTo(0.1704, 4);
    expect(hi).toBeCloseTo(0.729, 3);
    expect(fisherCI(0.5, 3)).toBeNull();
  });
});

describe("group comparison", () => {
  it("matches a hand-computed Welch t-test", () => {
    // Both variances 2.5, n = 5 each → t = -5, df = 8, p ≈ 0.001053
    const result = welchTTest([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect(result.t).toBeCloseTo(-5, 10);
    expect(result.df).toBeCloseTo(8, 10);
    expect(result.p).toBeCloseTo(0.001053, 5);
  });

  it("computes U from rank sums for fully separated samples", () => {
    const result = mannWhitneyU([1, 2, 3, 4], [5, 6, 7, 8]);
    expect(result.u).toBe(0);
    expect(result.p).toBeLessThan(0.05);
  });

  it("reports no difference for identical samples", () => {
    const a = [3, 3, 4, 4, 5, 5, 2, 2];
    const result = mannWhitneyU(a, [...a]);
    expect(result.u).toBe((a.length * a.length) / 2);
    expect(result.p).toBeGreaterThan(0.9);
  });

  it("corrects for ties, which mood scores are full of", () => {
    // Two heavily tied 1-5 samples: without a tie correction the variance
    // is overstated and the p-value comes out too large.
    const a = [4, 4, 4, 5, 5, 3, 4, 4];
    const b = [2, 2, 3, 2, 3, 2, 1, 2];
    const tied = mannWhitneyU(a, b);
    expect(tied.p).toBeLessThan(0.01);
    expect(Number.isFinite(tied.z)).toBe(true);
  });

  it("signs the z statistic by which sample ranks higher", () => {
    expect(mannWhitneyU([5, 6, 7, 8], [1, 2, 3, 4]).z).toBeGreaterThan(0);
    expect(mannWhitneyU([1, 2, 3, 4], [5, 6, 7, 8]).z).toBeLessThan(0);
  });

  it("computes Cliff's delta over every pair", () => {
    expect(cliffsDelta([1, 2, 3], [4, 5, 6])).toBe(-1);
    expect(cliffsDelta([4, 5, 6], [1, 2, 3])).toBe(1);
    expect(cliffsDelta([1, 2, 3], [1, 2, 3])).toBe(0);
    // 1 of 4 pairs greater, 3 less → (1 - 3) / 4
    expect(cliffsDelta([1, 3], [2, 5])).toBeCloseTo(-0.5, 12);
    // Two pairs each way cancel to no dominance at all.
    expect(cliffsDelta([1, 3], [2, 2])).toBe(0);
  });

  it("is not inflated by one huge value, unlike a difference in means", () => {
    const a = [1, 2, 3, 4, 1000000];
    const b = [2, 3, 4, 5, 6];
    expect(Math.abs(cliffsDelta(a, b))).toBeLessThan(0.5);
    expect(mean(a) - mean(b)).toBeGreaterThan(100000);
  });
});

describe("kruskal-wallis and the chi-square tail", () => {
  it("matches a hand-computed H for three separated groups", () => {
    // Pooled ranks are 1..9, group rank sums 6, 15, 24, so
    // H = 12/(9·10) × (36+225+576)/3 − 30 = 7.2, and with df = 2 the
    // chi-square upper tail is exactly exp(−7.2/2) ≈ 0.0273.
    const result = kruskalWallis([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    expect(result.h).toBeCloseTo(7.2, 10);
    expect(result.df).toBe(2);
    expect(result.p).toBeCloseTo(Math.exp(-3.6), 6);
  });

  it("reports no difference when every group looks the same", () => {
    const result = kruskalWallis([
      [1, 2, 3, 4],
      [1, 2, 3, 4],
      [1, 2, 3, 4],
    ]);
    expect(result.h).toBeCloseTo(0, 10);
    expect(result.p).toBe(1);
  });

  it("returns null when there are fewer than two groups", () => {
    expect(kruskalWallis([[1, 2, 3]])).toBeNull();
    expect(kruskalWallis([])).toBeNull();
  });

  it("matches known chi-square tail probabilities", () => {
    // df = 2 is the exponential tail: exp(−x/2).
    expect(chiSquareUpperTail(5.991, 2)).toBeCloseTo(0.05, 3);
    expect(chiSquareUpperTail(9.21, 2)).toBeCloseTo(0.01, 3);
    // df = 4's textbook 0.95 quantile is 9.4877.
    expect(chiSquareUpperTail(9.4877, 4)).toBeCloseTo(0.05, 3);
  });

  it("treats nonsensical input as no evidence", () => {
    expect(chiSquareUpperTail(0, 2)).toBe(1);
    expect(chiSquareUpperTail(-3, 2)).toBe(1);
    expect(chiSquareUpperTail(5, 0)).toBe(1);
    expect(chiSquareUpperTail(NaN, 2)).toBe(1);
  });
});

describe("permutation tests", () => {
  it("enumerates the exact answer for a tiny two-group case", () => {
    // [1,2] vs [3,4]: of the six ways to split [1,2,3,4] into pairs, two
    // are as extreme as the observed split, so the exact p is 1/3. The
    // Monte Carlo estimate must land close to it.
    expect(permutationPGroups([1, 2], [3, 4])).toBeCloseTo(1 / 3, 1);
  });

  it("never reports zero, however clean the separation", () => {
    const p = permutationPGroups([1, 2, 3, 4, 5, 6, 7, 8], [101, 102, 103, 104, 105, 106, 107, 108]);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.001);
  });

  it("reports exactly no evidence for identical groups", () => {
    const a = [3, 1, 4, 1, 5, 9, 2, 6];
    // Observed difference is zero, so every reshuffle is at least as extreme.
    expect(permutationPGroups(a, [...a])).toBe(1);
  });

  it("agrees with the parametric test where that test is valid", () => {
    // Non-tied continuous samples, n = 40 each, shifted so the normal
    // approximation behind mannWhitneyU is excellent (its p ≈ 0.049
    // here). The permutation p-value must land close to it — the two
    // are estimating the same thing when the approximation holds.
    const a = Array.from({ length: 40 }, (_, i) => 2 * (i + 1)); // 2..80
    const b = Array.from({ length: 40 }, (_, i) => 13 + 2 * i); // 13..91
    const parametric = mannWhitneyU(a, b).p;
    expect(parametric).toBeGreaterThan(0.02);
    expect(parametric).toBeLessThan(0.08);
    const exact = permutationPGroups(a, b);
    expect(exact / parametric).toBeGreaterThan(1 / 3);
    expect(exact / parametric).toBeLessThan(3);
  });

  it("is deterministic — same data, same p-value, every time", () => {
    // Seeded from the data rather than the clock, so an insight cannot
    // drift in and out of significance between identical runs.
    const a = [4, 4, 4, 5, 5, 3, 4, 4];
    const b = [2, 2, 3, 2, 3, 2, 1, 2];
    expect(permutationPGroups(a, b)).toBe(permutationPGroups(a, b));

    const xs = Array.from({ length: 25 }, (_, i) => i + 1);
    const ys = xs.map((x) => x + ((x * 7) % 5));
    expect(permutationPCorrelation(xs, ys)).toBe(permutationPCorrelation(xs, ys));

    const groups = [
      [1, 4, 2, 5, 3],
      [6, 9, 7, 8, 5],
      [2, 3, 4, 6, 5],
    ];
    expect(permutationPKruskal(groups)).toBe(permutationPKruskal(groups));
  });

  it("flags a perfect rank correlation at the resolution floor", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i + 1);
    const p = permutationPCorrelation(xs, xs.map((x) => 2 * x));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.001);
  });

  it("sees nothing in an unrelated pairing", () => {
    // A fixed pseudo-random y with no relationship to x.
    let state = 12345;
    const ys = Array.from({ length: 30 }, () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    });
    const xs = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(Math.abs(spearman(xs, ys))).toBeLessThan(0.35);
    expect(permutationPCorrelation(xs, ys)).toBeGreaterThan(0.05);
  });

  it("flags clearly separated weekday groups", () => {
    const p = permutationPKruskal([
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
      [21, 22, 23, 24, 25],
    ]);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.001);
  });

  it("returns 1 for input too small to permute meaningfully", () => {
    expect(permutationPGroups([1], [2, 3])).toBe(1);
    expect(permutationPGroups([], [2, 3])).toBe(1);
    expect(permutationPCorrelation([1, 2], [1, 2])).toBe(1);
    expect(permutationPKruskal([[1, 2, 3]])).toBe(1);
    expect(permutationPKruskal([])).toBe(1);
  });
});

describe("multiple-comparison correction", () => {
  it("matches the textbook step-up result", () => {
    // p·m/k is 0.05 at every rank, so all five q-values are 0.05.
    const q = benjaminiHochberg([0.01, 0.02, 0.03, 0.04, 0.05]);
    q.forEach((value) => expect(value).toBeCloseTo(0.05, 12));
  });

  it("preserves input order", () => {
    const q = benjaminiHochberg([0.5, 0.001, 0.2]);
    expect(q[1]).toBeLessThan(q[2]);
    expect(q[2]).toBeLessThan(q[0]);
    expect(q[1]).toBeCloseTo(0.003, 12);
  });

  it("stays monotone and never exceeds 1", () => {
    const q = benjaminiHochberg([0.9, 0.95, 0.99, 0.999]);
    q.forEach((value) => expect(value).toBeLessThanOrEqual(1));
  });

  it("turns a run of borderline noise into nothing significant", () => {
    // 40 hypotheses, five of which land just under 0.05 by chance. This
    // is the shape of an uncorrected run, and none of it should survive.
    const pvalues = [
      0.041, 0.043, 0.045, 0.047, 0.049,
      ...Array.from({ length: 35 }, (_, i) => 0.1 + i * 0.02),
    ];
    const q = benjaminiHochberg(pvalues);
    expect(Math.min(...q)).toBeGreaterThan(0.1);
  });

  it("lets a genuinely strong finding through", () => {
    const pvalues = [0.00001, ...Array.from({ length: 49 }, () => 0.6)];
    expect(benjaminiHochberg(pvalues)[0]).toBeLessThan(0.001);
  });

  it("returns an empty array for no hypotheses", () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });
});

describe("distributions", () => {
  it("matches known normal CDF values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959963985)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-1.281551566)).toBeCloseTo(0.1, 5);
  });

  it("matches known Student-t tail probabilities", () => {
    expect(studentTTwoTailed(2.228138852, 10)).toBeCloseTo(0.05, 6);
    expect(studentTTwoTailed(0, 10)).toBeCloseTo(1, 10);
    expect(studentTTwoTailed(3.182446305, 3)).toBeCloseTo(0.05, 6);
  });
});

describe("series shaping", () => {
  const rows = [
    { date: "2026-08-10", moodScore: 4, spendWantPaisa: 1000 },
    { date: "2026-08-11", moodScore: null, spendWantPaisa: 2000 },
    { date: "2026-08-12", moodScore: 2, spendWantPaisa: 3000 },
    { date: "2026-08-13", moodScore: 5, spendWantPaisa: 4000 },
  ];

  it("drops incomplete pairs rather than imputing them", () => {
    const { xs, ys, dates, dropped } = pairwise(rows, "moodScore", "spendWantPaisa");
    expect(xs).toEqual([4, 2, 5]);
    expect(ys).toEqual([1000, 3000, 4000]);
    expect(dates).toEqual(["2026-08-10", "2026-08-12", "2026-08-13"]);
    expect(dropped).toBe(1);
    // The null must never have become a zero.
    expect(xs).not.toContain(0);
  });

  it("pairs each day with the one exactly k days later", () => {
    const pairs = lagSeries(rows, 1);
    expect(pairs).toHaveLength(3);
    expect(pairs[0].from.date).toBe("2026-08-10");
    expect(pairs[0].to.date).toBe("2026-08-11");
  });

  it("does not pair across a hole in the series", () => {
    const gapped = [rows[0], { date: "2026-08-20", moodScore: 3 }];
    expect(lagSeries(gapped, 1)).toHaveLength(0);
  });

  it("builds lagged pairs and reports how many were possible", () => {
    const { xs, ys, dates, possible } = laggedPairs(
      rows,
      "moodScore",
      "spendWantPaisa",
      1
    );
    // Day 11 has no mood, so d=11→12 drops; 3 consecutive pairs exist.
    expect(possible).toBe(3);
    expect(xs).toEqual([4, 2]);
    expect(ys).toEqual([2000, 4000]);
    expect(dates).toEqual(["2026-08-10", "2026-08-12"]);
  });

  it("crosses month and year boundaries correctly", () => {
    const boundary = [
      { date: "2026-12-31", moodScore: 3 },
      { date: "2027-01-01", moodScore: 5 },
    ];
    const pairs = lagSeries(boundary, 1);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].to.date).toBe("2027-01-01");
  });
});
