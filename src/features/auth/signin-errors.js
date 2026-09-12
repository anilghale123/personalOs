/**
 * Sign-in failure reasons, shared between the NextAuth config and the
 * login form.
 *
 * Its own module on purpose: the login form is a client component, and
 * importing these from `lib/auth.js` would drag mongoose, bcrypt and the
 * whole provider config into the browser bundle.
 *
 * NextAuth collapses every credentials rejection into `CredentialsSignin`,
 * so without a typed reason the form cannot distinguish "wrong password"
 * from "this account has no password because it signs in with Google" —
 * and the latter was being shown "Invalid email or password", which is
 * technically true and completely unhelpful.
 *
 * None of these reveal whether an email is registered to someone who does
 * not already possess the correct password or control the Google account.
 */
export const SIGNIN_ERRORS = {
  BAD_CREDENTIALS: "BadCredentials",
  USE_GOOGLE: "UseGoogle",
  LOCKED: "AccountLocked",
  SUSPENDED: "AccountSuspended",
};
