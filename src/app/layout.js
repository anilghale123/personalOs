import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

/** Sets the theme class before first paint so dark users never see a flash. */
const themeInit = `(function(){try{var t=localStorage.getItem("pos-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})();`;

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
  appleWebApp: {
    capable: true,
    title: "selfView",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
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
    { media: "(prefers-color-scheme: light)", color: "#F7F7F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F12" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
