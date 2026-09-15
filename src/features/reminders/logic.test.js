import { describe, it, expect } from "vitest";
import {
  buildReminder,
  daysBetween,
  firstName,
  nepalClock,
  slotFor,
} from "./logic";

describe("nepalClock", () => {
  it("shifts UTC to Nepal time for the 10 am cron", () => {
    // 04:15 UTC is 10:00 in Kathmandu.
    expect(nepalClock(new Date("2026-09-15T04:15:00Z"))).toEqual({
      dateKey: "2026-09-15",
      weekday: "Tue",
      weekStart: "2026-09-14",
      hour: 10,
    });
  });

  it("rolls the date over before UTC does", () => {
    // 20:00 UTC Sunday is 01:45 Monday in Nepal — a new week.
    expect(nepalClock(new Date("2026-09-20T20:00:00Z"))).toEqual({
      dateKey: "2026-09-21",
      weekday: "Mon",
      weekStart: "2026-09-21",
      hour: 1,
    });
  });

  it("anchors Sunday to the previous Monday", () => {
    expect(nepalClock(new Date("2026-09-20T14:15:00Z")).weekStart).toBe(
      "2026-09-14"
    );
  });
});

describe("slotFor / daysBetween / firstName", () => {
  it("splits the day so a late cron still lands in its slot", () => {
    expect(slotFor(10)).toBe("morning");
    // A 10 am cron that fires at 10:59 is still the morning reminder.
    expect(slotFor(14)).toBe("morning");
    expect(slotFor(15)).toBe("evening");
    expect(slotFor(20)).toBe("evening");
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-09-12", "2026-09-15")).toBe(3);
  });

  it("uses the first name and survives a blank one", () => {
    expect(firstName("Anil Ghale")).toBe("Anil");
    expect(firstName("")).toBe("Hey");
  });
});

describe("buildReminder", () => {
  const base = {
    name: "Anil Ghale",
    slot: "evening",
    expenseLoggedToday: false,
    goalsToday: 3,
    goalsPending: 2,
    daysAway: 0,
  };

  it("asks about both when both are open", () => {
    expect(buildReminder(base)).toEqual({
      title: "Evening check-in",
      body: "Anil, have you logged your expenses and achieved today's goals? 2 still open.",
      url: "/app/budget/expenses",
      tag: "daily-reminder",
    });
  });

  it("asks only about expenses when there are no planner goals", () => {
    const r = buildReminder({ ...base, slot: "morning", goalsToday: 0, goalsPending: 0 });
    expect(r.title).toBe("Good morning");
    expect(r.body).toBe("Anil, have you logged today's expenses?");
  });

  it("asks only about goals once expenses are logged, and links to the planner", () => {
    const r = buildReminder({ ...base, expenseLoggedToday: true });
    expect(r.body).toBe("Anil, have you achieved today's goals? 2 still open.");
    expect(r.url).toBe("/app/planner");
  });

  it("stays silent when everything is done", () => {
    expect(
      buildReminder({ ...base, expenseLoggedToday: true, goalsPending: 0 })
    ).toBeNull();
  });

  it("switches to a catch-up note after 3 days away", () => {
    const r = buildReminder({ ...base, daysAway: 4 });
    expect(r.title).toBe("It's been a while");
    expect(r.body).toContain("4 days since your last entry");
  });

  it("treats a user with no entries yet as not away", () => {
    expect(buildReminder({ ...base, daysAway: null }).title).toBe(
      "Evening check-in"
    );
  });
});
