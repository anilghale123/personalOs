import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The whole pattern engine joins five collections on local calendar dates
 * in a UTC+05:45 timezone, so the suite runs pinned to Kathmandu — a
 * date-normalisation bug that only appears off-UTC would otherwise pass
 * in CI and silently shift every habit pattern by a day in production.
 *
 * `signals.test.js` asserts the offset really is +05:45, so if this ever
 * stops taking effect the suite says so instead of passing vacuously.
 */
process.env.TZ = "Asia/Kathmandu";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
    env: {
      TZ: "Asia/Kathmandu",
      // lib/mongoose.js throws at import time without this. Nothing here
      // connects — the tests exercise the pure half of the signal layer —
      // but the module still has to load.
      MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/test",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
