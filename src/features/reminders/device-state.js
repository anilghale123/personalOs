/**
 * What the daily-reminders switch should read for this device.
 *
 * Kept as one pure function, apart from the hook, because the bug it exists
 * to prevent is structural rather than arithmetic: an earlier version decided
 * the state *while* re-registering the device with the server, and treated a
 * failed request as "off". One flaky request therefore looked exactly like
 * the user having turned reminders off. Every input here is something the
 * browser knows locally and for certain, so no answer this returns can depend
 * on the network.
 *
 * ## "interrupted" is not "off"
 *
 * `wanted` records that the person turned reminders on here and has not
 * turned them off since. A browser can still take the subscription away on
 * its own — replacing it with a new one, clearing it with site data, or
 * resetting the permission — and before `wanted` existed that was reported
 * as plain "off", which is indistinguishable from the user's own choice. The
 * rule is that reminders are only ever off because someone turned them off,
 * so a missing subscription the user still wants is reported for what it is.
 *
 * @param {object} device
 * @param {boolean} device.configured   VAPID public key is present
 * @param {boolean} device.ios          iPhone/iPad
 * @param {boolean} device.standalone   launched from the Home Screen
 * @param {boolean} device.supported    service worker + push + notifications
 * @param {NotificationPermission} device.permission
 * @param {boolean} device.subscribed   a push subscription exists here
 * @param {boolean} [device.wanted]     turned on here and not turned off since
 * @returns {"unconfigured"|"ios-install"|"unsupported"|"denied"|"on"|"off"|"interrupted"}
 */
export function reminderState({
  configured,
  ios,
  standalone,
  supported,
  permission,
  subscribed,
  wanted = false,
}) {
  if (!configured) return "unconfigured";
  // Checked before `supported`: iOS Safari in a tab reports push support and
  // then refuses to subscribe, so "install it first" is the useful answer.
  if (ios && !standalone) return "ios-install";
  if (!supported) return "unsupported";
  // Blocked in the browser's own settings. The app cannot undo that and
  // should not pretend it can, whatever the user wanted.
  if (permission === "denied") return "denied";
  if (permission === "granted" && subscribed) return "on";
  return wanted ? "interrupted" : "off";
}
