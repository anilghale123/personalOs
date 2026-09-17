import { describe, it, expect } from "vitest";
import {
  buildGoalTimeReminder,
  buildReminder,
  formatTime,
  goalTimeDue,
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
      minute: 0,
    });
  });

  it("rolls the date over before UTC does", () => {
    // 20:00 UTC Sunday is 01:45 Monday in Nepal — a new week.
    expect(nepalClock(new Date("2026-09-20T20:00:00Z"))).toEqual({
      dateKey: "2026-09-21",
      weekday: "Mon",
      weekStart: "2026-09-21",
      hour: 1,
      minute: 45,
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

describe("goalTimeDue", () => {
  // 00:30 UTC Tuesday is 06:15 in Kathmandu.
  const clock = nepalClock(new Date("2026-09-15T00:30:00Z"));
  const goal = { time: "06:00", days: { Tue: "pending" } };

  it("is due once the time passes with today unchecked", () => {
    expect(goalTimeDue(goal, clock)).toBe(true);
  });

  it("never fires for a goal without a time", () => {
    expect(goalTimeDue({ days: {} }, clock)).toBe(false);
  });

  it("stays quiet before the time and after the window", () => {
    expect(goalTimeDue({ ...goal, time: "06:30" }, clock)).toBe(false);
    expect(goalTimeDue({ ...goal, time: "05:00" }, clock)).toBe(false);
  });

  it("stays quiet once today is checked either way, or already nudged", () => {
    expect(goalTimeDue({ ...goal, days: { Tue: "done" } }, clock)).toBe(false);
    expect(goalTimeDue({ ...goal, days: { Tue: "missed" } }, clock)).toBe(false);
    expect(goalTimeDue({ ...goal, timeRemindedOn: "2026-09-15" }, clock)).toBe(false);
  });

  it("treats a missing day status as unchecked", () => {
    expect(goalTimeDue({ time: "06:00" }, clock)).toBe(true);
  });
});

describe("buildGoalTimeReminder", () => {
  it("formats 24-hour times for people", () => {
    expect(formatTime("06:00")).toBe("6:00 AM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("18:30")).toBe("6:30 PM");
  });

  it("names the goal and its time", () => {
    const r = buildGoalTimeReminder({
      name: "Anil Ghale",
      goals: [{ title: "Wake up", time: "06:00" }],
    });
    expect(r.body).toBe(
      'Anil, you need to check your goal "Wake up" — it was due at 6:00 AM. Done it? Tick it off.'
    );
    expect(r.url).toBe("/app/planner");
  });

  it("folds several goals into one notification", () => {
    const r = buildGoalTimeReminder({
      name: "Anil",
      goals: [
        { title: "Wake up", time: "06:00" },
        { title: "Run", time: "06:00" },
      ],
    });
    expect(r.title).toBe("2 goals are waiting");
    expect(r.body).toContain('"Wake up", "Run"');
  });

  it("returns null with nothing due", () => {
    expect(buildGoalTimeReminder({ name: "Anil", goals: [] })).toBeNull();
  });
});
