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
 * @param {object} device
 * @param {boolean} device.configured   VAPID public key is present
 * @param {boolean} device.ios          iPhone/iPad
 * @param {boolean} device.standalone   launched from the Home Screen
 * @param {boolean} device.supported    service worker + push + notifications
 * @param {NotificationPermission} device.permission
 * @param {boolean} device.subscribed   a push subscription exists here
 * @returns {"unconfigured"|"ios-install"|"unsupported"|"denied"|"on"|"off"}
 */
export function reminderState({
  configured,
  ios,
  standalone,
  supported,
  permission,
  subscribed,
}) {
  if (!configured) return "unconfigured";
  // Checked before `supported`: iOS Safari in a tab reports push support and
  // then refuses to subscribe, so "install it first" is the useful answer.
  if (ios && !standalone) return "ios-install";
  if (!supported) return "unsupported";
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  return subscribed ? "on" : "off";
}
