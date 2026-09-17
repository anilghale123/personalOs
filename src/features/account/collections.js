import Budget from "@/models/Budget";
import Category from "@/models/Category";
import DailyJournal from "@/models/DailyJournal";
import Debt from "@/models/Debt";
import Expense from "@/models/Expense";
import Feedback from "@/models/Feedback";
import FinancialGoal from "@/models/FinancialGoal";
import Goal from "@/models/Goal";
import HabitLog from "@/models/HabitLog";
import Income from "@/models/Income";
import Insight from "@/models/Insight";
import Notification from "@/models/Notification";
import PasswordResetCode from "@/models/PasswordResetCode";
import PatternRun from "@/models/PatternRun";
import PlannerGoal from "@/models/PlannerGoal";
import PlannerWeekState from "@/models/PlannerWeekState";
import PushSubscription from "@/models/PushSubscription";
import QuickNote from "@/models/QuickNote";
import SIP from "@/models/SIP";
import Transaction from "@/models/Transaction";
import WeeklyGoal from "@/models/WeeklyGoal";

/**
 * Every collection that holds something belonging to a user.
 *
 * This list is the single source of truth for both halves of account data
 * rights — what an export has to include, and what a deletion has to remove.
 * Keeping them on one list is the point: an export that quietly omits a
 * collection is a half-truth, and a deletion that omits one leaves someone's
 * journal on a server they believe they have left.
 *
 * `src/features/account/collections.test.js` walks `src/models` and fails if
 * a model carrying a `userId` is missing from here *and* from
 * `ANONYMISED_ON_DELETE` below, so adding a feature cannot silently leave
 * data behind — and cannot silently be exempted from deletion either.
 *
 * `name` is what appears as a key in the exported file, chosen to read like
 * the product rather than like the schema.
 */
export const USER_COLLECTIONS = [
  { name: "expenses", model: () => Expense },
  { name: "income", model: () => Income },
  { name: "categories", model: () => Category },
  { name: "budgets", model: () => Budget },
  { name: "debts", model: () => Debt },
  { name: "savingsGoals", model: () => FinancialGoal },
  { name: "journalEntries", model: () => DailyJournal },
  { name: "quickNotes", model: () => QuickNote },
  { name: "habitLogs", model: () => HabitLog },
  { name: "goals", model: () => Goal },
  { name: "weeklyGoals", model: () => WeeklyGoal },
  { name: "plannerGoals", model: () => PlannerGoal },
  { name: "plannerWeeks", model: () => PlannerWeekState },
  { name: "portfolioTransactions", model: () => Transaction },
  { name: "sips", model: () => SIP },
  { name: "discoveries", model: () => Insight },
  { name: "patternRuns", model: () => PatternRun },
  { name: "reminderDevices", model: () => PushSubscription },
  { name: "notifications", model: () => Notification },
  { name: "passwordResetCodes", model: () => PasswordResetCode },
];

/**
 * Collections that a deletion strips of identity rather than removing.
 *
 * Feedback is the only one, and it is a genuine exception to "delete means
 * delete", so it is declared here rather than quietly left off the list
 * above. A feedback message is usually a bug report that is still open, and
 * deleting the description of a problem does not help the next person to hit
 * it — but nothing about it needs to stay attached to a person. The account
 * id and the contact address are cleared; the message stays, belonging to
 * nobody. The privacy page says this in as many words, because an exception
 * nobody is told about is not an exception, it is a surprise.
 *
 * `fields` are set to null; every other field is left alone.
 */
export const ANONYMISED_ON_DELETE = [
  {
    name: "feedback",
    model: () => Feedback,
    fields: { userId: null, contactEmail: null },
  },
];

/**
 * Collections deliberately left out of the export file, and why.
 *
 * `passwordResetCodes` is on the list above because deleting an account has
 * to remove it — a live reset code outliving the account it belongs to is a
 * loose end — but it is not in the export, since a one-time code is not
 * anybody's record of their life and printing it into a downloadable file is
 * the opposite of helpful.
 */
export const EXPORT_EXCLUDED = new Set(["passwordResetCodes"]);
