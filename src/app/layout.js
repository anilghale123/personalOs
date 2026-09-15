import { Caprasimo, Figtree } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { reportEnv } from "@/lib/env";

/**
 * Report configuration problems once, at module load.
 *
 * `reportEnv` logs and returns; it must never throw. This layout wraps every
 * route in the app, so anything thrown here 500s the entire site — landing
 * page, login, health check and all. An earlier version did exactly that and
 * took production down over a `NEXTAUTH_URL` that only affected Google
 * sign-in. Configuration complaints belong in the log and in `/api/health`,
 * not in front of every visitor.
 */
reportEnv();

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

// Organic's display face. Caprasimo ships a single weight — headings get
// their emphasis from size, never from bolding.
const caprasimo = Caprasimo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400"],
});

/**
 * Sets the theme class before first paint so dark users never see a flash.
 *
 * **Light is the default.** It used to follow `prefers-color-scheme`, which
 * meant anyone whose OS is in dark mode — most phones on an evening schedule —
 * got a dark app they never asked for. selfView is designed as a light system
 * ("Organic"), so light is what it opens as; dark is available from the toggle
 * and, once chosen, is remembered.
 */
const themeInit = `(function(){try{var t=localStorage.getItem("pos-theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})();`;

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  title: {
    default: "selfView — your money, habits, and journal, connected",
    template: "%s — selfView",
  },
  description:
    "selfView is a private record of your money, habits, and days — with a weekly AI briefing that connects them. Offline-first journaling, NEPSE portfolio tracking, and calm habit tools in one place.",
  manifest: "/manifest.webmanifest",
  applicationName: "selfView",
  /**
   * iOS reads these, not the manifest, for home-screen behaviour.
   *
   * `capable` emits `apple-mobile-web-app-capable`, which is what makes the
   * app open without Safari's chrome. `default` status bar rather than
   * `black-translucent`: translucent lets content slide under the clock, and
   * with a light app that renders the time nearly invisible.
   */
  appleWebApp: {
    capable: true,
    title: "selfView",
    statusBarStyle: "default",
  },
  other: {
    // The standards-track equivalent of apple-mobile-web-app-capable. Chromium
    // warns in DevTools when only the Apple-prefixed one is present.
    "mobile-web-app-capable": "yes",
  },
  /**
   * Rendered by scripts/generate-icons.mjs. The SVG stays sharp in modern
   * browser tabs; the .ico covers everything else, including the browsers
   * that request /favicon.ico on their own.
   */
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS ignores the manifest for the home-screen icon and uses this.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    siteName: "selfView",
    title: "selfView — your money, habits, and journal, connected",
    description:
      "A private record of your money, habits, and days — with a weekly AI briefing that connects them.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "selfView — your money, habits, and journal, connected",
    description:
      "A private record of your money, habits, and days — with a weekly AI briefing that connects them.",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5ead8" },
    { media: "(prefers-color-scheme: dark)", color: "#16150f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${figtree.variable} ${caprasimo.variable} font-sans`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
