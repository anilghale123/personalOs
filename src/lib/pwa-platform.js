/**
 * Which install path does this visitor actually have?
 *
 * There is no single "install" API. Chromium fires `beforeinstallprompt` and
 * gives you a real prompt; **iOS never does** — Safari's only route is
 * Share → Add to Home Screen, performed by hand. A button that calls a
 * non-existent prompt does nothing on an iPhone, so the platform has to be
 * known before the UI can be honest about what to show.
 *
 * Pure functions taking an explicit user-agent string, so every branch is
 * testable without a browser. Nothing here touches `window` directly.
 */

/** Every install route we have distinct instructions for. */
export const INSTALL_METHOD = {
  /** Chromium fired `beforeinstallprompt` — a real one-tap install. */
  NATIVE: "native",
  /** iOS/iPadOS Safari: Share → Add to Home Screen. */
  IOS_SAFARI: "ios-safari",
  /** iOS Chrome/Edge: same sheet, different icon placement. */
  IOS_CHROMIUM: "ios-chromium",
  /** iOS Firefox: menu, then Share. */
  IOS_FIREFOX: "ios-firefox",
  /** Android browsers without the prompt (mainly Firefox). */
  ANDROID_MENU: "android-menu",
  /** macOS Safari 17+: File → Add to Dock. */
  MACOS_SAFARI: "macos-safari",
  /** Desktop Chromium before the prompt is offered — address-bar icon. */
  DESKTOP_CHROMIUM: "desktop-chromium",
  /** Firefox desktop and anything else that cannot install at all. */
  UNSUPPORTED: "unsupported",
};

/**
 * @typedef {object} PlatformInfo
 * @property {boolean} isIOS       iPhone, iPod, or iPad (including iPadOS)
 * @property {boolean} isAndroid
 * @property {boolean} isMac       macOS proper, not an iPad reporting as one
 * @property {boolean} isSafari    real Safari, not a Chromium pretending
 * @property {boolean} isChromium  Chrome, Edge, Samsung, Opera, Brave
 * @property {boolean} isFirefox
 * @property {boolean} isMobile
 * @property {boolean} canEverInstall
 */

/**
 * Classify a user agent.
 *
 * @param {string} ua `navigator.userAgent`
 * @param {object} [hints]
 * @param {number} [hints.maxTouchPoints] `navigator.maxTouchPoints`
 * @returns {PlatformInfo}
 */
export function detectPlatform(ua = "", { maxTouchPoints = 0 } = {}) {
  const s = String(ua);

  const iPhoneOrIPod = /iPhone|iPod/i.test(s);
  const legacyIPad = /iPad/i.test(s);

  /**
   * iPadOS 13+ Safari reports itself as `Macintosh; Intel Mac OS X` — the same
   * string as a desktop Mac. Touch points are the only reliable separator, and
   * getting this wrong means every iPad user is shown "File → Add to Dock",
   * a menu their device does not have.
   */
  const iPadMasqueradingAsMac =
    /Macintosh/i.test(s) && maxTouchPoints > 1;

  const isIOS = iPhoneOrIPod || legacyIPad || iPadMasqueradingAsMac;
  const isAndroid = /Android/i.test(s);
  const isMac = /Macintosh|Mac OS X/i.test(s) && !isIOS;

  // On iOS every browser is WebKit underneath, so the brand token is what
  // distinguishes them: CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge.
  const isIOSChromium = isIOS && /CriOS|EdgiOS|OPiOS/i.test(s);
  const isIOSFirefox = isIOS && /FxiOS/i.test(s);

  const isFirefox = /Firefox|FxiOS/i.test(s);

  // Safari's token appears in nearly every UA, so it is identified by the
  // absence of the others rather than its presence.
  const isChromium =
    /Chrome|Chromium|CriOS|Edg|EdgiOS|SamsungBrowser|OPR|OPiOS/i.test(s) &&
    !isFirefox;

  const isSafari =
    /Safari/i.test(s) && !isChromium && !isFirefox;

  const isMobile = isIOS || isAndroid || /Mobile/i.test(s);

  return {
    isIOS,
    isAndroid,
    isMac,
    isSafari: isSafari || (isIOS && !isIOSChromium && !isIOSFirefox),
    isChromium,
    isFirefox,
    isIOSChromium,
    isIOSFirefox,
    isMobile,
    // Firefox desktop has no install path at all; everything else has one.
    canEverInstall: !(isFirefox && !isMobile && !isIOS),
  };
}

/**
 * Pick the install route to explain.
 *
 * `hasNativePrompt` wins whenever it is true — a captured
 * `beforeinstallprompt` is the best experience available and makes every
 * manual instruction redundant.
 *
 * @param {PlatformInfo} platform
 * @param {boolean} hasNativePrompt whether `beforeinstallprompt` fired
 * @returns {keyof typeof INSTALL_METHOD[keyof typeof INSTALL_METHOD]}
 */
export function installMethodFor(platform, hasNativePrompt) {
  if (hasNativePrompt) return INSTALL_METHOD.NATIVE;

  if (platform.isIOS) {
    if (platform.isIOSFirefox) return INSTALL_METHOD.IOS_FIREFOX;
    if (platform.isIOSChromium) return INSTALL_METHOD.IOS_CHROMIUM;
    return INSTALL_METHOD.IOS_SAFARI;
  }

  if (platform.isAndroid) {
    // Chromium on Android normally fires the prompt; reaching here means it
    // has not yet (criteria still pending), so the menu is the fallback.
    return INSTALL_METHOD.ANDROID_MENU;
  }

  if (platform.isMac && platform.isSafari) return INSTALL_METHOD.MACOS_SAFARI;
  if (platform.isChromium) return INSTALL_METHOD.DESKTOP_CHROMIUM;

  return INSTALL_METHOD.UNSUPPORTED;
}

/**
 * Step-by-step copy per method.
 *
 * Written as the words that actually appear on the device — "Share", "Add to
 * Home Screen", "Add to Dock" — because a paraphrase makes the reader hunt
 * for a menu item that does not exist under that name.
 */
export const INSTALL_STEPS = {
  [INSTALL_METHOD.IOS_SAFARI]: {
    title: "Add selfView to your Home Screen",
    // iOS genuinely offers no programmatic install, so saying so up front
    // stops the reader waiting for something to happen.
    note: "iPhone and iPad install apps through Safari's Share menu.",
    steps: [
      { text: "Tap the Share button at the bottom of Safari.", icon: "share" },
      { text: "Scroll down and tap “Add to Home Screen”.", icon: "plus" },
      { text: "Tap “Add” — selfView appears with your other apps.", icon: "check" },
    ],
  },
  [INSTALL_METHOD.IOS_CHROMIUM]: {
    title: "Add selfView to your Home Screen",
    note: "Works from Chrome on iOS too — the Share menu is in the address bar.",
    steps: [
      { text: "Tap the Share icon in the address bar.", icon: "share" },
      { text: "Choose “Add to Home Screen”.", icon: "plus" },
      { text: "Tap “Add” to finish.", icon: "check" },
    ],
  },
  [INSTALL_METHOD.IOS_FIREFOX]: {
    title: "Add selfView to your Home Screen",
    note: "Firefox on iOS installs through the Share sheet.",
    steps: [
      { text: "Tap the menu button (three lines).", icon: "menu" },
      { text: "Tap “Share”, then “Add to Home Screen”.", icon: "share" },
      { text: "Tap “Add” to finish.", icon: "check" },
    ],
  },
  [INSTALL_METHOD.ANDROID_MENU]: {
    title: "Install selfView",
    note: "Your browser can add selfView to your home screen from its menu.",
    steps: [
      { text: "Open the browser menu (three dots).", icon: "menu" },
      { text: "Tap “Install app” or “Add to Home screen”.", icon: "plus" },
      { text: "Confirm to finish.", icon: "check" },
    ],
  },
  [INSTALL_METHOD.MACOS_SAFARI]: {
    title: "Add selfView to your Dock",
    note: "macOS Safari 17 and later can install web apps.",
    steps: [
      { text: "Open the File menu in Safari.", icon: "menu" },
      { text: "Choose “Add to Dock”.", icon: "plus" },
      { text: "Click “Add” — selfView opens in its own window.", icon: "check" },
    ],
  },
  [INSTALL_METHOD.DESKTOP_CHROMIUM]: {
    title: "Install selfView",
    note: "Look for the install icon at the right of the address bar.",
    steps: [
      { text: "Click the install icon in the address bar.", icon: "plus" },
      { text: "Or open the browser menu and choose “Install selfView”.", icon: "menu" },
      { text: "Confirm to open selfView in its own window.", icon: "check" },
    ],
  },
  [INSTALL_METHOD.UNSUPPORTED]: {
    title: "Use selfView in your browser",
    note: "This browser cannot install web apps, but nothing is missing — selfView works fully in the tab. To install it later, open this page in Chrome, Edge, or Safari.",
    steps: [],
  },
};

/**
 * Is the page already running as an installed app?
 *
 * Two mechanisms because iOS predates the standard: `display-mode: standalone`
 * is the spec, and `navigator.standalone` is Safari's original.
 *
 * @param {Window} [win]
 */
export function isRunningInstalled(win) {
  const w = win ?? (typeof window !== "undefined" ? window : undefined);
  if (!w) return false;

  const displayModes = ["standalone", "fullscreen", "minimal-ui"];
  const matchesMode = displayModes.some(
    (mode) => w.matchMedia?.(`(display-mode: ${mode})`)?.matches
  );

  return Boolean(matchesMode || w.navigator?.standalone === true);
}
