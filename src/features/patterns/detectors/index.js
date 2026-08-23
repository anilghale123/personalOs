/**
 * The detector registry.
 *
 * Every detector exports the same shape:
 *
 *   {
 *     id, title, domains, family,
 *     requires: string[],   // coverage domains — see the note below
 *     minSample: number,
 *     run(signals, ctx)     // → PatternResult[] | { results, hypothesesTested?, skipped? }
 *   }
 *
 * `requires` names coverage *domains* ('mood', 'money', 'habits',
 * 'journal', 'notes'), not signal fields. The blueprint sketched it as
 * field names, but counting non-null fields would gate on the wrong thing:
 * `spendWantPaisa` is 0 rather than null on a day with nothing logged, so
 * a field-based gate would report full money coverage for a user who has
 * never opened the expenses screen. Domains line up with `computeCoverage`
 * and therefore with what the readiness screen tells the user.
 *
 * `run` may return a bare array when every hypothesis it tested is
 * returned. Parameterised detectors return the object form so the engine
 * knows how many tests were really run — trimming a list of habits to the
 * strongest three and then correcting across only those three would
 * quietly undo the correction.
 */

import moneyMood from "./money-mood";
import moneyHabits from "./money-habits";
import habitsMood from "./habits-mood";
import journalCross from "./journal-cross";
import rhythm from "./rhythm";
import budgetBehaviour from "./budget-behaviour";
import sentiment from "./sentiment";

/**
 * Every detector the engine runs.
 *
 * The sentiment family only ever runs for users who opted into journal
 * extraction — without it no day carries a sentiment, so the coverage
 * gate skips the whole family before it does any work.
 */
export const DETECTORS = [
  ...moneyMood,
  ...moneyHabits,
  ...habitsMood,
  ...journalCross,
  ...rhythm,
  ...budgetBehaviour,
  ...sentiment,
];

/** Detectors by id, for targeted runs and for rehydrating stored insights. */
export const DETECTORS_BY_ID = Object.fromEntries(
  DETECTORS.map((d) => [d.id, d])
);

/** The families a run can produce, in feed order. */
export const FAMILIES = [...new Set(DETECTORS.map((d) => d.family))];
