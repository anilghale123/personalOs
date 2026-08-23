import { describe, expect, it } from "vitest";
import { fingerprint, historyKeyOf, stableStringify } from "./fingerprint";
import {
  buildHistoryMap,
  buildSuppressionSet,
  gateRun,
  planPersistence,
  ranDetectorIds,
} from "./persist";
import { MAX_MANUAL_RUNS_PER_DAY, RUN_TTL_HOURS } from "./constants";

const NOW = new Date("2026-08-21T12:00:00Z");

/** A finished pattern the way the engine emits one. */
function makePattern(overrides = {}) {
  return {
    detectorId: "habit_mood_next_day",
    params: { habitName: "Morning Run", moodKey: "mood" },
    statementKey: "habit_mood_next_day",
    statementVars: { habitName: "Morning Run" },
    title: "Morning Run → next-day mood",
    domains: ["habits", "mood"],
    family: "habits-mood",
    effect: { type: "group_difference", value: 0.8, unit: "mood", standardised: 0.8 },
    direction: "positive",
    n: 42,
    pValue: 0.001,
    qValue: 0.01,
    confidence: "low",
    evidence: { pairs: 42 },
    windowFrom: "2026-06-23",
    windowTo: "2026-08-21",
    unstable: false,
    ...overrides,
  };
}

/** A stored insight the way Mongoose hands it back after .lean(). */
function makeDoc(overrides = {}) {
  return {
    _id: "doc-1",
    userId: "user-1",
    detectorId: "habit_mood_next_day",
    params: { habitName: "Morning Run", moodKey: "mood" },
    fingerprint: fingerprint("habit_mood_next_day", { habitName: "Morning Run", moodKey: "mood" }),
    status: "active",
    timesConfirmed: 2,
    firstDetectedAt: new Date("2026-08-01T00:00:00Z"),
    lastConfirmedAt: new Date("2026-08-20T00:00:00Z"),
    strengthHistory: [
      { date: new Date("2026-08-01T00:00:00Z"), value: 0.7, n: 30, qValue: 0.02, confidence: "low" },
      { date: new Date("2026-08-20T00:00:00Z"), value: 0.9, n: 40, qValue: 0.01, confidence: "low" },
    ],
    ...overrides,
  };
}

describe("fingerprint", () => {
  it("is stable regardless of params key order", () => {
    const a = fingerprint("d1", { x: 1, y: "two", z: [3, 4] });
    const b = fingerprint("d1", { z: [3, 4], y: "two", x: 1 });
    expect(a).toBe(b);
  });

  it("differs when the detector id or any param differs", () => {
    const base = fingerprint("d1", { habit: "Run" });
    expect(fingerprint("d2", { habit: "Run" })).not.toBe(base);
    expect(fingerprint("d1", { habit: "Walk" })).not.toBe(base);
    expect(fingerprint("d1", {})).not.toBe(base);
  });

  it("serialises nested structures deterministically", () => {
    const value = { b: [{ d: 2, c: 1 }, null], a: "x" };
    expect(stableStringify(value)).toBe('{"a":"x","b":[{"c":1,"d":2},null]}');
  });

  it("treats undefined and missing params identically", () => {
    expect(fingerprint("d1")).toBe(fingerprint("d1", {}));
    expect(historyKeyOf("d1")).toBe(historyKeyOf("d1", {}));
  });
});

describe("buildHistoryMap", () => {
  it("keys entries by detector + params and derives span from first detection", () => {
    const doc = makeDoc({ timesConfirmed: 3 });
    const history = buildHistoryMap([doc], NOW);

    const entry = history[historyKeyOf(doc.detectorId, doc.params)];
    expect(entry.timesConfirmed).toBe(3);
    // 2026-08-01 → 2026-08-21 is 20 days.
    expect(entry.spanDays).toBe(20);
    expect(entry.effects).toEqual([0.7, 0.9]);
    expect(entry.lastEffect).toBe(0.9);
  });

  it("skips junk history values instead of inventing effects", () => {
    const doc = makeDoc({
      strengthHistory: [
        { date: NOW, value: null, n: 10 },
        { date: NOW, value: 0.5, n: 12 },
      ],
    });
    const entry = buildHistoryMap([doc], NOW)[historyKeyOf(doc.detectorId, doc.params)];
    expect(entry.effects).toEqual([0.5]);
  });

  it("returns an empty map for a user with no insights", () => {
    expect(buildHistoryMap([])).toEqual({});
    expect(buildHistoryMap(undefined)).toEqual({});
  });
});

describe("planPersistence", () => {
  it("inserts a never-seen pattern as active with timesConfirmed 1", () => {
    const plan = planPersistence({
      userId: "user-1",
      patterns: [makePattern()],
      existing: [],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });

    expect(plan.inserts).toHaveLength(1);
    const insert = plan.inserts[0];
    expect(insert.status).toBe("active");
    expect(insert.timesConfirmed).toBe(1);
    expect(insert.firstDetectedAt).toBe(NOW);
    expect(insert.lastConfirmedAt).toBe(NOW);
    expect(insert.strengthHistory).toHaveLength(1);
    expect(insert.fingerprint).toBe(fingerprint("habit_mood_next_day", { habitName: "Morning Run", moodKey: "mood" }));
    expect(plan.updates).toHaveLength(0);
    expect(plan.staleIds).toHaveLength(0);
  });

  it("reconfirms a known fingerprint by update, not duplicate insert", () => {
    const stored = makeDoc();
    const plan = planPersistence({
      userId: "user-1",
      patterns: [makePattern()],
      existing: [stored],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });

    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0];
    expect(update.id).toBe("doc-1");
    expect(update.set.lastConfirmedAt).toBe(NOW);
    expect(update.set.status).toBe("active");
    expect(update.set.qValue).toBe(0.01);
    expect(update.historyEntry.value).toBe(0.8);
    expect(plan.staleIds).toHaveLength(0);
  });

  it("revives a stale pattern to active when it reconfirms", () => {
    const stored = makeDoc({ status: "stale" });
    const plan = planPersistence({
      userId: "user-1",
      patterns: [makePattern()],
      existing: [stored],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });
    expect(plan.updates[0].set.status).toBe("active");
  });

  it("keeps a dismissed pattern dismissed even while its stats refresh", () => {
    const stored = makeDoc({ status: "dismissed" });
    const plan = planPersistence({
      userId: "user-1",
      patterns: [makePattern()],
      existing: [stored],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].set.status).toBeUndefined();
    expect(plan.updates[0].set.lastConfirmedAt).toBe(NOW);
  });

  it("marks active patterns stale when their detector ran and found nothing", () => {
    const stored = makeDoc();
    const plan = planPersistence({
      userId: "user-1",
      patterns: [],
      existing: [stored],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });

    expect(plan.staleIds).toEqual(["doc-1"]);
  });

  it("leaves insights alone when their detector never ran (coverage-gated)", () => {
    const stored = makeDoc();
    const plan = planPersistence({
      userId: "user-1",
      patterns: [],
      existing: [stored],
      ranDetectorIds: new Set(["mood_want_spend"]), // a different detector ran
      now: NOW,
    });

    expect(plan.staleIds).toHaveLength(0);
  });

  it("never stales dismissed or archived insights", () => {
    const plan = planPersistence({
      userId: "user-1",
      patterns: [],
      existing: [makeDoc({ _id: "a", status: "dismissed" }), makeDoc({ _id: "b", status: "archived" })],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });
    expect(plan.staleIds).toHaveLength(0);
  });

  it("dedupes a pattern the engine somehow emits twice in one run", () => {
    const plan = planPersistence({
      userId: "user-1",
      patterns: [makePattern(), makePattern({ n: 99 })],
      existing: [],
      ranDetectorIds: new Set(["habit_mood_next_day"]),
      now: NOW,
    });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].n).toBe(42);
  });
});

describe("ranDetectorIds", () => {
  it("drops coverage- and activity-skipped detectors, keeps the rest", () => {
    const outcome = {
      skipped: [
        { detectorId: "dow_want_spend", reason: "coverage" },
        { detectorId: "money_pressure_mood", reason: "insufficient_activity" },
        { detectorId: "habit_mood_next_day", params: { habitName: "X" }, reason: "no_signal" },
      ],
    };
    const ids = ranDetectorIds(outcome, ["dow_want_spend", "money_pressure_mood", "habit_mood_next_day"]);
    expect(ids.has("dow_want_spend")).toBe(false);
    expect(ids.has("money_pressure_mood")).toBe(false);
    // A per-parameter skip with another reason is not a detector-level skip.
    expect(ids.has("habit_mood_next_day")).toBe(true);
  });

  it("treats everything as having run when nothing was skipped", () => {
    const ids = ranDetectorIds({ skipped: [] }, ["a", "b"]);
    expect(ids).toEqual(new Set(["a", "b"]));
  });
});

describe("gateRun", () => {
  it("allows a first-ever run", () => {
    expect(gateRun({ lastRunAt: null, now: NOW })).toEqual({ allowed: true, reason: "ok" });
  });

  it("serves stored results inside the TTL window", () => {
    const lastRunAt = new Date(NOW.getTime() - (RUN_TTL_HOURS - 1) * 3_600_000);
    const gate = gateRun({ lastRunAt, now: NOW });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("fresh");
    expect(gate.nextEligibleAt).toEqual(new Date(lastRunAt.getTime() + RUN_TTL_HOURS * 3_600_000));
  });

  it("runs again once the TTL has expired", () => {
    const lastRunAt = new Date(NOW.getTime() - (RUN_TTL_HOURS + 1) * 3_600_000);
    expect(gateRun({ lastRunAt, now: NOW })).toEqual({ allowed: true, reason: "ok" });
  });

  it("lets a manual run through inside the TTL", () => {
    const lastRunAt = new Date(NOW.getTime() - 3_600_000);
    expect(gateRun({ lastRunAt, force: true, manualRunsToday: 0, now: NOW })).toEqual({
      allowed: true,
      reason: "ok",
    });
  });

  it("caps manual runs for the day", () => {
    const gate = gateRun({
      lastRunAt: new Date(NOW.getTime() - 3_600_000),
      force: true,
      manualRunsToday: MAX_MANUAL_RUNS_PER_DAY,
      now: NOW,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("rate_limited");
  });
});

describe("buildSuppressionSet", () => {
  const doc = (overrides) => ({ fingerprint: "fp", ...overrides });

  it("suppresses a pattern the user said they already knew", () => {
    const set = buildSuppressionSet([doc({ feedback: { rating: "knew_it" } })]);
    expect(set.has("fp")).toBe(true);
  });

  it("suppresses a pattern hidden twice", () => {
    expect(buildSuppressionSet([doc({ dismissCount: 2 })]).has("fp")).toBe(true);
    expect(buildSuppressionSet([doc({ dismissCount: 5 })]).has("fp")).toBe(true);
  });

  it("does not suppress after a single dismissal", () => {
    expect(buildSuppressionSet([doc({ dismissCount: 1 })]).has("fp")).toBe(false);
  });

  it("leaves useful and not-useful ratings surfacing", () => {
    expect(buildSuppressionSet([doc({ feedback: { rating: "useful" } })]).has("fp")).toBe(false);
    expect(buildSuppressionSet([doc({ feedback: { rating: "not_useful" } })]).has("fp")).toBe(false);
  });

  it("copes with insights carrying no feedback at all", () => {
    expect(buildSuppressionSet([doc({})]).size).toBe(0);
    expect(buildSuppressionSet([]).size).toBe(0);
    expect(buildSuppressionSet(undefined).size).toBe(0);
  });
});
