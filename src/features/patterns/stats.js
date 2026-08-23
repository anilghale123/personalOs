/**
 * Pure statistics. No database, no imports, no side effects — every
 * function here takes numbers and returns numbers, so every one of them
 * is directly testable against a known answer.
 *
 * Two deliberate biases run through this file:
 *
 * 1. **Rank-based by default.** Personal finance is heavy-tailed; one
 *    rent payment will dominate a Pearson coefficient and manufacture a
 *    "discovery" that is really a single outlier. Spearman, Mann–Whitney
 *    and Cliff's delta all work on order rather than magnitude, so they
 *    survive that. Pearson and Welch stay available for *reporting*.
 *
 * 2. **Null over zero.** Anything that cannot be computed returns `null`,
 *    never `0`. A missing correlation and a correlation of zero are
 *    entirely different claims.
 */

// ── Descriptive ────────────────────────────────────────────────────────

/** Arithmetic mean, or null for an empty list. */
export function mean(xs) {
  if (!xs?.length) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Median, or null for an empty list. */
export function median(xs) {
  return quantile(xs, 0.5);
}

/** Sample standard deviation (n − 1), or null below two values. */
export function stdev(xs) {
  if (!xs || xs.length < 2) return null;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return Math.sqrt(ss / (xs.length - 1));
}

/** Sample variance (n − 1), or null below two values. */
export function variance(xs) {
  const s = stdev(xs);
  return s === null ? null : s * s;
}

/**
 * The q-th quantile by linear interpolation between order statistics
 * (the "type 7" definition, matching R and NumPy defaults).
 */
export function quantile(xs, q) {
  if (!xs?.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Ranks, 1-based, with ties sharing their average rank — the tie handling
 * Spearman and Mann–Whitney both assume.
 */
export function ranks(xs) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = shared;
    i = j + 1;
  }
  return out;
}

// ── Correlation ────────────────────────────────────────────────────────

/**
 * Pearson product-moment correlation. Null below two pairs or when either
 * series is constant. Reported, but rarely used to decide anything.
 */
export function pearson(xs, ys) {
  const n = Math.min(xs?.length ?? 0, ys?.length ?? 0);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rho — Pearson over ranks. The default correlation here. */
export function spearman(xs, ys) {
  const n = Math.min(xs?.length ?? 0, ys?.length ?? 0);
  if (n < 2) return null;
  return pearson(ranks(xs.slice(0, n)), ranks(ys.slice(0, n)));
}

/**
 * Two-tailed significance of a correlation coefficient via the usual
 * t transform. Valid for Spearman at the sample sizes this engine gates
 * on (n ≥ 21).
 * @returns {{t: number, df: number, p: number}|null}
 */
export function correlationTest(r, n) {
  if (r === null || !Number.isFinite(r) || n < 3) return null;
  const clamped = Math.min(Math.max(r, -0.999999999), 0.999999999);
  const df = n - 2;
  const t = clamped * Math.sqrt(df / (1 - clamped * clamped));
  return { t, df, p: studentTTwoTailed(t, df) };
}

/**
 * 95% confidence interval for a correlation, via the Fisher z transform.
 * Null below four pairs, where the transform has no standard error.
 * @returns {[number, number]|null}
 */
export function fisherCI(r, n, z = 1.959963985) {
  if (r === null || !Number.isFinite(r) || n < 4) return null;
  const clamped = Math.min(Math.max(r, -0.999999), 0.999999);
  const zr = Math.atanh(clamped);
  const se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(zr - z * se), Math.tanh(zr + z * se)];
}

// ── Group comparison ───────────────────────────────────────────────────

/**
 * Welch's t-test — unequal variances, no pooling. Kept for *reporting*
 * the difference in means; significance is decided by `mannWhitneyU`.
 * @returns {{t: number, df: number, p: number}|null}
 */
export function welchTTest(a, b) {
  if (!a?.length || !b?.length || a.length < 2 || b.length < 2) return null;
  const va = variance(a);
  const vb = variance(b);
  const sa = va / a.length;
  const sb = vb / b.length;
  if (sa + sb === 0) return null;
  const t = (mean(a) - mean(b)) / Math.sqrt(sa + sb);
  const df =
    (sa + sb) ** 2 /
    (sa ** 2 / (a.length - 1) + sb ** 2 / (b.length - 1));
  return { t, df, p: studentTTwoTailed(t, df) };
}

/**
 * Mann–Whitney U — a rank test for "are these two samples drawn from the
 * same distribution", with no normality assumption.
 *
 * `u` is U for sample `a`. The p-value uses the normal approximation with
 * a tie correction and a continuity correction, which is accurate enough
 * from roughly eight per group — the floor `MIN_GROUP_SIZE` enforces.
 * @returns {{u: number, z: number, p: number, n1: number, n2: number}|null}
 */
export function mannWhitneyU(a, b) {
  const n1 = a?.length ?? 0;
  const n2 = b?.length ?? 0;
  if (n1 < 1 || n2 < 1) return null;

  const combined = [...a, ...b];
  const r = ranks(combined);
  let rankSumA = 0;
  for (let i = 0; i < n1; i++) rankSumA += r[i];

  const u = rankSumA - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;

  // Tie correction: shrink the variance by the ties present in the pooled
  // ranking, otherwise tied data (mood scores are 1–5, so ties are the
  // norm) produces p-values that are too small.
  const counts = new Map();
  for (const v of combined) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieSum = 0;
  for (const c of counts.values()) if (c > 1) tieSum += c ** 3 - c;

  const n = n1 + n2;
  const sigmaSq =
    ((n1 * n2) / 12) * (n + 1 - tieSum / (n * (n - 1)));
  if (sigmaSq <= 0) return { u, z: 0, p: 1, n1, n2 };

  const sigma = Math.sqrt(sigmaSq);
  const z = (Math.abs(u - mu) - 0.5) / sigma;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.max(z, 0))));
  return { u, z: u < mu ? -z : z, p, n1, n2 };
}

/**
 * Cliff's delta — the probability a value from `a` exceeds one from `b`,
 * minus the reverse. −1 to 1, no distributional assumptions, and unlike a
 * difference in means it cannot be inflated by one enormous value.
 */
export function cliffsDelta(a, b) {
  if (!a?.length || !b?.length) return null;
  let greater = 0;
  let less = 0;
  for (const x of a) {
    for (const y of b) {
      if (x > y) greater++;
      else if (x < y) less++;
    }
  }
  return (greater - less) / (a.length * b.length);
}

/**
 * Kruskal–Wallis — the rank-based generalisation of Mann–Whitney to more
 * than two groups. Used for "does spending differ across the seven days
 * of the week" without assuming anything about the distribution.
 *
 * Includes the standard tie correction; without it, days with lots of
 * repeated values look more different than they are.
 * @param {number[][]} groups
 * @returns {{h: number, df: number, p: number}|null}
 */
export function kruskalWallis(groups) {
  const present = (groups ?? []).filter((g) => g?.length);
  if (present.length < 2) return null;

  const pooled = present.flat();
  const n = pooled.length;
  if (n < 3) return null;

  const r = ranks(pooled);
  let offset = 0;
  let sum = 0;
  for (const group of present) {
    let rankSum = 0;
    for (let i = 0; i < group.length; i++) rankSum += r[offset + i];
    sum += (rankSum * rankSum) / group.length;
    offset += group.length;
  }

  let h = (12 / (n * (n + 1))) * sum - 3 * (n + 1);

  const counts = new Map();
  for (const v of pooled) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieSum = 0;
  for (const c of counts.values()) if (c > 1) tieSum += c ** 3 - c;
  const correction = 1 - tieSum / (n ** 3 - n);
  if (correction > 0) h /= correction;

  const df = present.length - 1;
  return { h, df, p: chiSquareUpperTail(h, df) };
}

// ── Permutation tests ──────────────────────────────────────────────────

/**
 * Default resamples. 4000 puts the smallest reportable p at 1/4001, which
 * leaves headroom below the q < 0.01 that High confidence needs even with
 * sixty hypotheses in a run.
 */
export const PERMUTATIONS = 4000;

/**
 * Deterministic PRNG (mulberry32), seeded from the data itself.
 *
 * Seeding from the values rather than the clock matters: the same window
 * must produce the same p-value every run, or an insight would drift in
 * and out of significance for no reason the user could ever see.
 */
function seededRandom(values) {
  let seed = 2166136261;
  for (const v of values) {
    seed ^= Math.round(v * 1000) | 0;
    seed = Math.imul(seed, 16777619);
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, in place, using a supplied generator. */
function shuffle(xs, random) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/**
 * Exact two-tailed p-value for a difference between two groups, by
 * reshuffling which days belong to which group.
 *
 * The normal approximation behind `mannWhitneyU` assumes a smooth
 * distribution. Mood is a five-point scale, so a real sample is mostly
 * ties, and the approximation comes out slightly too eager — which at
 * these sample sizes is enough to push false findings past the
 * correction. Permuting makes no distributional assumption at all.
 */
export function permutationPGroups(a, b, iterations = PERMUTATIONS) {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return 1;

  const pooled = [...a, ...b];
  const pooledRanks = ranks(pooled);
  const observed = Math.abs(sumFirst(pooledRanks, n1) / n1 - sumFirst(pooledRanks.slice(n1), n2) / n2);

  const random = seededRandom(pooled);
  const scratch = [...pooledRanks];
  let atLeastAsExtreme = 0;

  for (let i = 0; i < iterations; i++) {
    shuffle(scratch, random);
    const diff = Math.abs(
      sumFirst(scratch, n1) / n1 - sumFirst(scratch.slice(n1), n2) / n2
    );
    if (diff >= observed - 1e-12) atLeastAsExtreme++;
  }

  // The +1 on both sides is the standard correction that keeps a p-value
  // from ever being reported as exactly zero.
  return (atLeastAsExtreme + 1) / (iterations + 1);
}

/**
 * Exact two-tailed p-value for a rank correlation, by reshuffling which
 * y belongs to which x.
 */
export function permutationPCorrelation(xs, ys, iterations = PERMUTATIONS) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 1;

  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const observed = Math.abs(pearson(rx, ry) ?? 0);

  const random = seededRandom([...xs, ...ys]);
  const scratch = [...ry];
  let atLeastAsExtreme = 0;

  for (let i = 0; i < iterations; i++) {
    shuffle(scratch, random);
    const value = Math.abs(pearson(rx, scratch) ?? 0);
    if (value >= observed - 1e-12) atLeastAsExtreme++;
  }

  return (atLeastAsExtreme + 1) / (iterations + 1);
}

/**
 * Exact p-value for a difference across more than two groups, by
 * reshuffling which day falls on which weekday.
 *
 * The chi-square approximation behind `kruskalWallis` is liberal for the
 * group sizes a single quarter of data provides, so the omnibus test
 * driving the day-of-week finding is permuted too.
 */
export function permutationPKruskal(groups, iterations = PERMUTATIONS) {
  const present = (groups ?? []).filter((g) => g?.length);
  if (present.length < 2) return 1;

  const sizes = present.map((g) => g.length);
  const pooled = present.flat();
  const pooledRanks = ranks(pooled);
  const observed = rankSpread(pooledRanks, sizes);

  const random = seededRandom(pooled);
  const scratch = [...pooledRanks];
  let atLeastAsExtreme = 0;

  for (let i = 0; i < iterations; i++) {
    shuffle(scratch, random);
    if (rankSpread(scratch, sizes) >= observed - 1e-12) atLeastAsExtreme++;
  }

  return (atLeastAsExtreme + 1) / (iterations + 1);
}

/** The Σ R²/n term of the Kruskal–Wallis H — monotone in H, so it ranks the same. */
function rankSpread(rankValues, sizes) {
  let offset = 0;
  let total = 0;
  for (const size of sizes) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += rankValues[offset + i];
    total += (sum * sum) / size;
    offset += size;
  }
  return total;
}

function sumFirst(xs, n) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += xs[i];
  return sum;
}

// ── Multiple comparisons ───────────────────────────────────────────────

/**
 * Benjamini–Hochberg step-up correction, returning q-values in the input
 * order.
 *
 * A run tests 40–60 hypotheses. At p < 0.05 on pure noise that is two or
 * three "discoveries" every time, each of which the narration layer would
 * describe fluently and persuasively. Nothing reaches the user without
 * passing through this function.
 */
export function benjaminiHochberg(pvalues) {
  const m = pvalues?.length ?? 0;
  if (!m) return [];
  const ordered = pvalues
    .map((p, i) => [Number.isFinite(p) ? p : 1, i])
    .sort((x, y) => x[0] - y[0]);

  const q = new Array(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, index] = ordered[k];
    running = Math.min(running, (p * m) / (k + 1));
    q[index] = Math.min(1, running);
  }
  return q;
}

// ── Series shaping ─────────────────────────────────────────────────────

/**
 * Extract complete (x, y) pairs from signal rows, dropping any row where
 * either value is null or undefined.
 *
 * Dropping is the point: imputing a missing mood as 0, or a day with no
 * expenses logged as zero spend, is how a fake correlation gets built.
 * @returns {{xs: number[], ys: number[], dates: string[], dropped: number}}
 */
export function pairwise(rows, xKey, yKey) {
  const xs = [];
  const ys = [];
  const dates = [];
  let dropped = 0;
  for (const row of rows ?? []) {
    const x = row?.[xKey];
    const y = row?.[yKey];
    if (x === null || x === undefined || y === null || y === undefined) {
      dropped++;
      continue;
    }
    xs.push(Number(x));
    ys.push(Number(y));
    dates.push(row.date);
  }
  return { xs, ys, dates, dropped };
}

/**
 * Pair each row with the row exactly `k` calendar days later.
 *
 * The signal series is gap-explicit — every day in the window is present —
 * so this is an index shift, but the calendar distance is verified anyway
 * so a caller passing a filtered series gets correct pairs or none.
 * @returns {{from: object, to: object}[]}
 */
export function lagSeries(rows, k) {
  const out = [];
  if (!rows?.length || !Number.isInteger(k)) return out;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  for (const row of rows) {
    const target = shiftKey(row.date, k);
    const match = byDate.get(target);
    if (match) out.push({ from: row, to: match });
  }
  return out;
}

/**
 * Complete lagged pairs of two fields: `xKey` on day *d* against `yKey` on
 * day *d + k*.
 * @returns {{xs: number[], ys: number[], dates: string[], possible: number}}
 */
export function laggedPairs(rows, xKey, yKey, k = 1) {
  const pairs = lagSeries(rows, k);
  const xs = [];
  const ys = [];
  const dates = [];
  for (const { from, to } of pairs) {
    const x = from?.[xKey];
    const y = to?.[yKey];
    if (x === null || x === undefined || y === null || y === undefined) continue;
    xs.push(Number(x));
    ys.push(Number(y));
    dates.push(from.date);
  }
  return { xs, ys, dates, possible: pairs.length };
}

/** Local 'YYYY-MM-DD' shift — kept inline so this module imports nothing. */
function shiftKey(key, n) {
  const [y, m, d] = String(key).split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

// ── Distributions ──────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

/** Two-tailed p-value for a t statistic with `df` degrees of freedom. */
export function studentTTwoTailed(t, df) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  return Math.min(1, regularizedIncompleteBeta(x, df / 2, 0.5));
}

/** Upper-tail probability of a chi-square statistic with `df` degrees. */
export function chiSquareUpperTail(x, df) {
  if (!Number.isFinite(x) || x <= 0) return 1;
  if (!Number.isFinite(df) || df <= 0) return 1;
  return 1 - regularizedLowerGamma(df / 2, x / 2);
}

/** Regularised lower incomplete gamma P(a, x). */
function regularizedLowerGamma(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // Series expansion converges fast on this side.
    let term = 1 / a;
    let sum = term;
    for (let i = 1; i < 500; i++) {
      term *= x / (a + i);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction for the complement on the other side.
  const TINY = 1e-300;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Log-gamma via the Lanczos approximation (g = 7, n = 9). */
function logGamma(z) {
  const C = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zz = z - 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < C.length; i++) x += C[i] / (zz + i + 1);
  const t = zz + C.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
  );
}

/** Regularised incomplete beta I_x(a, b), by continued fraction. */
function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  // Converge from whichever side the fraction converges quickly on, using
  // the symmetry I_x(a, b) = 1 − I_{1−x}(b, a).
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Lentz's algorithm for the beta continued fraction. */
function betaContinuedFraction(x, a, b) {
  const TINY = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-16) break;
  }
  return h;
}
