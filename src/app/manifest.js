/**
 * PWA manifest — served by Next.js at /manifest.webmanifest and
 * auto-linked from the document head.
 */
export default function manifest() {
  return {
    /**
     * A stable identity for the installed app. Without `id`, some browsers
     * derive it from `start_url`, so ever changing that would orphan every
     * existing installation into a second, duplicate app.
     */
    id: "/?source=pwa",

    name: "selfView — your life, in view",
    short_name: "selfView",
    description:
      "Wealth tracking, habits, journaling and AI briefings in one calm, private app.",

    /**
     * Opens the product, not the marketing page.
     *
     * Someone who installs before signing up lands on /app, which the
     * middleware redirects to /login — so the installed app asks them to sign
     * in or sign up on first launch, and goes straight to their dashboard
     * every time after. That redirect is the intended first-run flow.
     */
    start_url: "/app",
    scope: "/",

    display: "standalone",
    /**
     * Android and desktop honour this chain when `standalone` is unavailable;
     * `browser` last means the app always opens somehow rather than failing.
     */
    display_override: ["standalone", "minimal-ui", "browser"],

    /**
     * `any` rather than `portrait`.
     *
     * Locking orientation is wrong for an installed app on a tablet, where
     * landscape is the normal way to hold it — and the layout is responsive,
     * so there is nothing to protect against.
     */
    orientation: "any",

    /**
     * Light values, because the app is a light system and these paint the
     * splash screen and title bar. A dark background here flashed dark before
     * a light app on every cold start.
     */
    background_color: "#f5ead8",
    theme_color: "#f5ead8",

    categories: ["finance", "productivity", "lifestyle"],
    lang: "en",
    dir: "ltr",

    /**
     * 192 and 512 are the sizes Chromium requires for installability; the
     * separate `maskable` entry is what stops Android cropping a circle out of
     * the middle of the icon. `purpose` must not list both on one entry, or
     * the icon gets padded as maskable *and* used unpadded.
     */
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],

    /**
     * Long-press shortcuts on the installed icon. These are the three things
     * people open the app to do, so they skip a navigation each time.
     */
    shortcuts: [
      {
        name: "Add an expense",
        short_name: "Expense",
        url: "/app/budget/expenses",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Write today's entry",
        short_name: "Journal",
        url: "/app/journal",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],

    /** Opening a link reuses the running app rather than spawning a window. */
    launch_handler: { client_mode: "navigate-existing" },

    /** No related native app, so never divert users to a store listing. */
    prefer_related_applications: false,
  };
}
