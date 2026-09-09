import { describe, it, expect } from "vitest";
import {
  buildHabitNotes,
  buildMoneyNotes,
  orderNotes,
  summariseGoalWeek,
} from "./briefing";

const goal = (days, title = "IELTS") => ({ title, days });

describe("summariseGoalWeek", () => {
  it("counts only elapsed days, with past pending days not done", () => {
    const g = goal({ Mon: "done", Tue: "missed", Wed: "pending" });
    // Wednesday is today: 3 elapsed days, 1 done.
    expect(summariseGoalWeek(g, 3)).toEqual({
      title: "IELTS",
      done: 1,
      elapsed: 3,
      missed: 2,
      remaining: 4,
      gap: 2,
    });
  });

  it("ignores future days entirely", () => {
    const g = goal({ Mon: "done", Sat: "done", Sun: "done" });
    expect(summariseGoalWeek(g, 2).done).toBe(1);
  });

  it("clamps elapsed days into 1–7", () => {
    const g = goal({ Mon: "done" });
    expect(summariseGoalWeek(g, 0).elapsed).toBe(1);
    expect(summariseGoalWeek(g, 9).elapsed).toBe(7);
  });

  it("reports no gap while today is already ticked", () => {
    expect(summariseGoalWeek(goal({ Mon: "done", Tue: "done" }), 2).gap).toBe(0);
  });

  it("carries last week's trailing gap when nothing was ticked at all", () => {
    // Four elapsed days untouched, on top of five from the week before.
    expect(summariseGoalWeek(goal({}), 4, 5).gap).toBe(9);
  });

  it("ignores the prior gap once the goal has been ticked this week", () => {
    expect(summariseGoalWeek(goal({ Mon: "done" }), 3, 5).gap).toBe(2);
  });
});

describe("buildHabitNotes", () => {
  it("names a dropped goal and says how long the gap has run", () => {
    const notes = buildHabitNotes([{ ...goal({}), priorGap: 3 }], 4, "Anil");
    expect(notes).toHaveLength(1);
    expect(notes[0].tone).toBe("miss");
    expect(notes[0].text).toContain("Anil");
    expect(notes[0].text).toContain("IELTS");
    expect(notes[0].text).toContain("a week");
  });

  it("groups several dropped goals into one sentence, worst first", () => {
    const notes = buildHabitNotes(
      [
        { ...goal({}, "Breathing"), priorGap: 4 },
        { ...goal({}, "IELTS"), priorGap: 0 },
        { ...goal({}, "Reading"), priorGap: 1 },
      ],
      3,
      "Anil"
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].tone).toBe("miss");
    expect(notes[0].text).toContain("Breathing, Reading and IELTS");
    expect(notes[0].text).toContain("Breathing the longest");
    // One sentence for three goals — never one line each.
    expect(notes[0].text.split("Breathing").length - 1).toBe(2);
  });

  it("praises consistent goals together rather than one by one", () => {
    const days = { Mon: "done", Tue: "done", Wed: "done" };
    const notes = buildHabitNotes(
      [goal(days, "Exercise"), goal(days, "KYC"), goal(days, "Water")],
      3,
      "Anil"
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].tone).toBe("praise");
    expect(notes[0].text).toContain("Exercise, KYC and Water");
  });

  it("calls a full seven-day week flawless", () => {
    const days = Object.fromEntries(
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => [d, "done"])
    );
    const notes = buildHabitNotes([goal(days)], 7, "Anil");
    expect(notes[0].tone).toBe("praise");
    expect(notes[0].text).toContain("flawless");
  });

  it("counts a slipping group with its real numbers", () => {
    const notes = buildHabitNotes(
      [
        goal({ Mon: "done", Tue: "missed", Wed: "missed", Thu: "missed", Fri: "missed" }, "Yoga"),
        goal({ Mon: "missed", Tue: "done", Wed: "missed", Thu: "missed", Fri: "missed" }, "Study"),
      ],
      5,
      "Anil"
    );
    const slipping = notes.find((n) => n.tone === "nudge");
    expect(slipping.text).toContain("Yoga and Study");
    expect(slipping.text).toContain("2 of 10 days");
  });

  it("keeps a mixed planner to one sentence per bucket", () => {
    const notes = buildHabitNotes(
      [
        goal({ Mon: "done", Tue: "done", Wed: "done" }, "Exercise"),
        goal({ Mon: "done", Tue: "done", Wed: "done" }, "KYC"),
        goal({ Mon: "done", Tue: "missed", Wed: "missed" }, "Yoga"),
        goal({}, "Breathing"),
        goal({}, "IELTS"),
      ],
      3,
      "Anil"
    );
    // Five goals, three buckets, three sentences.
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.tone).sort()).toEqual(["miss", "nudge", "praise"]);
  });

  it("caps the names it lists and counts the rest", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    const notes = buildHabitNotes(
      titles.map((t) => goal({}, t)),
      2,
      "Anil"
    );
    expect(notes[0].text).toContain("and 2 more");
  });

  it("says nothing about an empty planner", () => {
    expect(buildHabitNotes([], 5, "Anil")).toEqual([]);
  });
});

describe("buildMoneyNotes", () => {
  it("encourages logging when nothing is tracked", () => {
    const notes = buildMoneyNotes({
      weekPaisa: 0,
      lastWeekPaisa: 0,
      top: null,
      categoryCount: 0,
      name: "Anil",
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].tone).toBe("info");
    expect(notes[0].text).toContain("No spending logged");
  });

  it("praises a real drop in spending", () => {
    const notes = buildMoneyNotes({
      weekPaisa: 400000,
      lastWeekPaisa: 600000,
      top: null,
      categoryCount: 2,
      name: "Anil",
    });
    expect(notes[0].tone).toBe("praise");
    expect(notes[0].text).toContain("33% less");
    expect(notes[0].text).toContain("NPR 4,000");
  });

  it("flags a big week-over-week rise", () => {
    const notes = buildMoneyNotes({
      weekPaisa: 800000,
      lastWeekPaisa: 500000,
      top: null,
      categoryCount: 2,
      name: "Anil",
    });
    expect(notes[0].tone).toBe("nudge");
    expect(notes[0].text).toContain("60% above");
  });

  it("names a dominant category and suggests for it", () => {
    const notes = buildMoneyNotes({
      weekPaisa: 500000,
      lastWeekPaisa: 0,
      top: { name: "Food & Dining", paisa: 300000, share: 0.6 },
      categoryCount: 3,
      name: "Anil",
    });
    const top = notes.find((n) => n.text.includes("Food & Dining"));
    expect(top.tone).toBe("nudge");
    expect(top.text).toContain("60%");
    expect(top.text).toContain("home");
  });

  it("never invents a figure — every number comes from the input", () => {
    const notes = buildMoneyNotes({
      weekPaisa: 123456,
      lastWeekPaisa: 234567,
      top: { name: "Transport", paisa: 50000, share: 0.41 },
      categoryCount: 4,
      name: "Anil",
    });
    const text = notes.map((n) => n.text).join(" ");
    expect(text).toContain("NPR 1,235");
    expect(text).toContain("47% less");
    expect(text).toContain("41%");
  });
});

describe("orderNotes", () => {
  it("puts hard truths first and praise last", () => {
    const ordered = orderNotes([
      { tone: "praise", text: "a" },
      { tone: "miss", text: "b" },
      { tone: "nudge", text: "c" },
    ]);
    expect(ordered.map((n) => n.tone)).toEqual(["miss", "nudge", "praise"]);
  });
});
