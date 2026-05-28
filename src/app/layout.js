import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-journal",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Personal OS — Your Operating System for Life",
  description:
    "A unified Super App for wealth tracking, habits, journaling and AI briefings.",
  manifest: "/manifest.webmanifest",
  applicationName: "Personal OS",
  appleWebApp: {
    capable: true,
    title: "Personal OS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#101012",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${lora.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
