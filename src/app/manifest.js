/**
 * PWA manifest — served by Next.js at /manifest.webmanifest and
 * auto-linked from the document head.
 */
export default function manifest() {
  return {
    name: "selfView — your life, in view",
    short_name: "selfView",
    description:
      "Wealth tracking, habits, journaling and AI briefings in one calm, private app.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#101012",
    theme_color: "#101012",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
