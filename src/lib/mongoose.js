import mongoose from "mongoose";
import dns from "node:dns";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined in .env.local");
}

/**
 * `mongodb+srv://` connection strings require a DNS SRV lookup. Many ISP,
 * corporate or local resolvers refuse SRV queries, which surfaces as
 * `querySrv ECONNREFUSED`. Pointing Node at public resolvers (Google +
 * Cloudflare) first — keeping the system resolver as a fallback — makes
 * those lookups succeed.
 */
if (MONGODB_URI.startsWith("mongodb+srv://")) {
  try {
    const system = dns.getServers();
    dns.setServers([
      "8.8.8.8",
      "1.1.1.1",
      ...system.filter((s) => s !== "8.8.8.8" && s !== "1.1.1.1"),
    ]);
  } catch {
    // Fall back to the system resolver if overriding is not permitted.
  }
}

let cached = global.mongoose || { conn: null, promise: null };

/**
 * Singleton MongoDB connection — survives hot reloads in dev and
 * cold-start reuse on serverless.
 * @returns {Promise<typeof mongoose>}
 */
export default async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        dbName: "personal-os",
        serverSelectionTimeoutMS: 15000,
      })
      .catch((err) => {
        // Reset so the next request can retry instead of reusing a
        // permanently-rejected promise.
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  global.mongoose = cached;
  return cached.conn;
}
