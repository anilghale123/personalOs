/**
 * Wealth constants safe for both client and server — no model imports, so
 * client components can use them without pulling mongoose into the bundle.
 */

/** Income categories. Fixed list: income is far less varied than spending. */
export const INCOME_CATEGORIES = ["Salary", "Transfer", "Business", "Interest", "Refund", "Other"];

/** Where an entry came from. Imports are `import:<parser id>`. */
export const ENTRY_SOURCES = ["manual", "voice"];

/** Page size for the income list. */
export const INCOME_PAGE_SIZE = 30;
