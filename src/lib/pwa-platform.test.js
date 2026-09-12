import { describe, expect, it } from "vitest";
import {
  INSTALL_METHOD,
  INSTALL_STEPS,
  detectPlatform,
  installMethodFor,
  isRunningInstalled,
} from "./pwa-platform";

/** Real user-agent strings, not invented ones. */
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15",
  // iPadOS 13+ reports itself as a Mac; only touch points give it away.
  ipadOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  ipadLegacy:
    "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
};

describe("detectPlatform — iOS", () => {
  it("identifies iPhone Safari", () => {
    const p = detectPlatform(UA.iphoneSafari);
    expect(p.isIOS).toBe(true);
    expect(p.isSafari).toBe(true);
    expect(p.isMobile).toBe(true);
    expect(p.isAndroid).toBe(false);
    // Critically NOT a Mac — that would show a Dock instruction.
    expect(p.isMac).toBe(false);
  });

  it("identifies Chrome on iOS as Chromium-branded but still iOS", () => {
    const p = detectPlatform(UA.iphoneChrome);
    expect(p.isIOS).toBe(true);
    expect(p.isIOSChromium).toBe(true);
    expect(p.isIOSFirefox).toBe(false);
  });

  it("identifies Firefox on iOS", () => {
    const p = detectPlatform(UA.iphoneFirefox);
    expect(p.isIOS).toBe(true);
    expect(p.isIOSFirefox).toBe(true);
    expect(p.isFirefox).toBe(true);
    // Still installable — iOS Firefox has a Share sheet.
    expect(p.canEverInstall).toBe(true);
  });

  it("recognises iPadOS despite its Macintosh user agent", () => {
    // The bug this guards: without touch points an iPad is indistinguishable
    // from a desktop Mac, and every iPad user would be told to use a File
    // menu that does not exist on their device.
    const p = detectPlatform(UA.ipadOS, { maxTouchPoints: 5 });
    expect(p.isIOS).toBe(true);
    expect(p.isMac).toBe(false);
  });

  it("still treats a real Mac as a Mac when there is no touch screen", () => {
    const p = detectPlatform(UA.macSafari, { maxTouchPoints: 0 });
    expect(p.isIOS).toBe(false);
    expect(p.isMac).toBe(true);
    expect(p.isSafari).toBe(true);
  });

  it("recognises a legacy iPad by its own token", () => {
    const p = detectPlatform(UA.ipadLegacy);
    expect(p.isIOS).toBe(true);
    expect(p.isMac).toBe(false);
  });
});

describe("detectPlatform — Android", () => {
  it("identifies Chrome on Android", () => {
    const p = detectPlatform(UA.androidChrome);
    expect(p.isAndroid).toBe(true);
    expect(p.isChromium).toBe(true);
    expect(p.isIOS).toBe(false);
  });

  it("identifies Samsung Internet as Chromium", () => {
    const p = detectPlatform(UA.androidSamsung);
    expect(p.isAndroid).toBe(true);
    expect(p.isChromium).toBe(true);
  });

  it("identifies Firefox on Android and keeps it installable", () => {
    const p = detectPlatform(UA.androidFirefox);
    expect(p.isAndroid).toBe(true);
    expect(p.isFirefox).toBe(true);
    expect(p.isChromium).toBe(false);
    expect(p.canEverInstall).toBe(true);
  });
});

describe("detectPlatform — desktop", () => {
  it("does not mistake Chrome for Safari", () => {
    // Every Chromium UA contains the token "Safari".
    for (const ua of [UA.windowsChrome, UA.macChrome, UA.androidChrome]) {
      const p = detectPlatform(ua);
      expect(p.isChromium).toBe(true);
      expect(p.isSafari).toBe(false);
    }
  });

  it("does not mistake Edge for plain Chrome-only handling", () => {
    const p = detectPlatform(UA.windowsEdge);
    expect(p.isChromium).toBe(true);
    expect(p.isFirefox).toBe(false);
  });

  it("marks desktop Firefox as unable to install", () => {
    const p = detectPlatform(UA.windowsFirefox);
    expect(p.isFirefox).toBe(true);
    expect(p.isMobile).toBe(false);
    expect(p.canEverInstall).toBe(false);
  });

  it("survives an empty or junk user agent without throwing", () => {
    for (const ua of ["", undefined, null, "junk"]) {
      expect(() => detectPlatform(ua)).not.toThrow();
    }
  });
});

describe("installMethodFor", () => {
  it("prefers the native prompt whenever one was captured", () => {
    // A real prompt beats every set of manual instructions.
    for (const ua of Object.values(UA)) {
      expect(installMethodFor(detectPlatform(ua), true)).toBe(
        INSTALL_METHOD.NATIVE
      );
    }
  });

  it("never returns NATIVE for iOS without a prompt", () => {
    // iOS never fires beforeinstallprompt, so a NATIVE result here would mean
    // rendering a button that silently does nothing on every iPhone.
    const iosUAs = [UA.iphoneSafari, UA.iphoneChrome, UA.iphoneFirefox];
    for (const ua of iosUAs) {
      const method = installMethodFor(detectPlatform(ua), false);
      expect(method).not.toBe(INSTALL_METHOD.NATIVE);
      expect(method.startsWith("ios-")).toBe(true);
    }
  });

  it("routes each iOS browser to its own instructions", () => {
    expect(installMethodFor(detectPlatform(UA.iphoneSafari), false)).toBe(
      INSTALL_METHOD.IOS_SAFARI
    );
    expect(installMethodFor(detectPlatform(UA.iphoneChrome), false)).toBe(
      INSTALL_METHOD.IOS_CHROMIUM
    );
    expect(installMethodFor(detectPlatform(UA.iphoneFirefox), false)).toBe(
      INSTALL_METHOD.IOS_FIREFOX
    );
  });

  it("routes iPadOS to the iOS Safari instructions, not macOS", () => {
    const p = detectPlatform(UA.ipadOS, { maxTouchPoints: 5 });
    expect(installMethodFor(p, false)).toBe(INSTALL_METHOD.IOS_SAFARI);
  });

  it("routes macOS Safari to Add to Dock", () => {
    const p = detectPlatform(UA.macSafari, { maxTouchPoints: 0 });
    expect(installMethodFor(p, false)).toBe(INSTALL_METHOD.MACOS_SAFARI);
  });

  it("routes Android without a prompt to the browser menu", () => {
    expect(installMethodFor(detectPlatform(UA.androidFirefox), false)).toBe(
      INSTALL_METHOD.ANDROID_MENU
    );
  });

  it("routes desktop Chromium to the address-bar icon", () => {
    expect(installMethodFor(detectPlatform(UA.windowsChrome), false)).toBe(
      INSTALL_METHOD.DESKTOP_CHROMIUM
    );
  });

  it("routes desktop Firefox to unsupported", () => {
    expect(installMethodFor(detectPlatform(UA.windowsFirefox), false)).toBe(
      INSTALL_METHOD.UNSUPPORTED
    );
  });
});

describe("INSTALL_STEPS", () => {
  it("has copy for every non-native method", () => {
    const methods = Object.values(INSTALL_METHOD).filter(
      (m) => m !== INSTALL_METHOD.NATIVE
    );
    for (const method of methods) {
      expect(INSTALL_STEPS[method], `missing steps for ${method}`).toBeTruthy();
      expect(INSTALL_STEPS[method].title).toBeTruthy();
    }
  });

  it("gives actionable steps for every method that can install", () => {
    const installable = Object.values(INSTALL_METHOD).filter(
      (m) => m !== INSTALL_METHOD.NATIVE && m !== INSTALL_METHOD.UNSUPPORTED
    );
    for (const method of installable) {
      expect(INSTALL_STEPS[method].steps.length).toBeGreaterThan(0);
    }
  });

  it("explains rather than instructs when install is impossible", () => {
    const unsupported = INSTALL_STEPS[INSTALL_METHOD.UNSUPPORTED];
    expect(unsupported.steps).toHaveLength(0);
    expect(unsupported.note).toMatch(/nothing is missing/i);
  });
});

describe("isRunningInstalled", () => {
  const fakeWindow = ({ mode = null, iosStandalone = undefined }) => ({
    matchMedia: (query) => ({ matches: mode ? query.includes(mode) : false }),
    navigator: { standalone: iosStandalone },
  });

  it("detects the standards-based display mode", () => {
    expect(isRunningInstalled(fakeWindow({ mode: "standalone" }))).toBe(true);
    expect(isRunningInstalled(fakeWindow({ mode: "fullscreen" }))).toBe(true);
    expect(isRunningInstalled(fakeWindow({ mode: "minimal-ui" }))).toBe(true);
  });

  it("detects iOS Safari's non-standard flag", () => {
    // Older iOS has no display-mode support, only navigator.standalone.
    expect(isRunningInstalled(fakeWindow({ iosStandalone: true }))).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    expect(isRunningInstalled(fakeWindow({}))).toBe(false);
    expect(isRunningInstalled(fakeWindow({ iosStandalone: false }))).toBe(false);
  });

  it("is false rather than throwing when there is no window", () => {
    expect(isRunningInstalled(undefined)).toBe(false);
  });

  it("survives a window without matchMedia", () => {
    expect(isRunningInstalled({ navigator: {} })).toBe(false);
  });
});
