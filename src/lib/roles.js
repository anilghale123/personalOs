/**
 * Roles and what each one may do.
 *
 * Kept as pure data and pure functions with no imports, so both the edge
 * middleware and server routes can use it — and so every rule is testable
 * without a database.
 *
 * The model is deliberately small. Three roles and a numeric rank answer
 * every question this app actually asks, and a permission matrix would be
 * more machinery than the product has decisions.
 */

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
};

/** Every role, weakest first — the order the admin UI lists them in. */
export const ROLE_ORDER = [ROLES.USER, ROLES.ADMIN, ROLES.SUPERADMIN];

/**
 * Rank, for "at least this role" checks.
 *
 * An unknown or missing role ranks 0, so a malformed value fails closed as an
 * ordinary user rather than being treated as an admin.
 */
const RANK = {
  [ROLES.USER]: 1,
  [ROLES.ADMIN]: 2,
  [ROLES.SUPERADMIN]: 3,
};

export function rankOf(role) {
  return RANK[role] ?? 0;
}

/** Human labels for the admin UI. */
export const ROLE_LABELS = {
  [ROLES.USER]: "User",
  [ROLES.ADMIN]: "Admin",
  [ROLES.SUPERADMIN]: "Super admin",
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.USER]: "Normal access to their own data. Cannot open the admin area.",
  [ROLES.ADMIN]: "Can view the dashboard and manage ordinary users.",
  [ROLES.SUPERADMIN]:
    "Everything an admin can do, plus granting and revoking admin.",
};

/** Can this role open the admin area at all? */
export function canAccessAdmin(role) {
  return rankOf(role) >= RANK[ROLES.ADMIN];
}

/** Only a superadmin may change roles. */
export function canManageRoles(role) {
  return rankOf(role) >= RANK[ROLES.SUPERADMIN];
}

/**
 * May `actor` act on `target`?
 *
 * The rule that matters: **you can only act on someone strictly below you.**
 * That single comparison closes three holes at once — an admin cannot demote
 * a superadmin, an admin cannot suspend a peer admin, and nobody can act on
 * themselves (equal rank is not strictly below), so a superadmin cannot
 * accidentally remove their own access and lock everyone out.
 *
 * @param {string} actorRole
 * @param {string} targetRole
 */
export function canActOn(actorRole, targetRole) {
  if (!canAccessAdmin(actorRole)) return false;
  return rankOf(actorRole) > rankOf(targetRole);
}

/**
 * Which roles may `actor` assign?
 *
 * Strictly below their own, for the same reason as `canActOn`: a superadmin
 * can create admins but not other superadmins, so promoting to the top stays
 * a deliberate act performed against the database rather than something one
 * compromised session can do.
 *
 * @param {string} actorRole
 * @returns {string[]}
 */
export function assignableRoles(actorRole) {
  if (!canManageRoles(actorRole)) return [];
  return ROLE_ORDER.filter((role) => rankOf(actorRole) > rankOf(role));
}

/** Is this a role we recognise? */
export function isValidRole(role) {
  return ROLE_ORDER.includes(role);
}
