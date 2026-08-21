import { ImageResponse } from "next/og";

// Edge runtime: the Node build of @vercel/og fails to resolve its WASM
// assets on paths containing spaces (this repo lives in one).
export const runtime = "edge";
export const alt = "selfView — your money, habits, and journal, connected";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BARS = [10, 18, 7, 26, 14, 5, 21, 12, 24, 8, 30, 16, 34, 11];

/**
 * Social preview card: the lifeline mark over ink. Generated at request
 * time by Next.js — no binary assets to maintain.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#101012",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          {BARS.map((h, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: h * 1.4,
                borderRadius: 5,
                backgroundColor: "#D9A441",
                opacity: i === BARS.length - 3 ? 1 : 0.55,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              color: "#EDEDEF",
              letterSpacing: "-0.02em",
            }}
          >
            selfView
          </div>
          <div style={{ fontSize: 34, color: "#9D9DA8" }}>
            Your money, habits, and journal — connected.
          </div>
        </div>
      </div>
    ),
    size
  );
}
