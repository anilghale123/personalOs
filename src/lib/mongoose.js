import mongoose from "mongoose";
import dns from "node:dns";

const MONGODB_URI = process.env.MONGODB_URI;

/**
 * The missing-URI check lives inside `connectDB()`, not out here.
 *
 * At module scope it threw on *import*, and almost every route imports this
 * transitively — including the landing page, via `auth`. So a missing
 * `MONGODB_URI` did not degrade the app, it returned 500 for every URL on the
 * site, including `/api/health`, which is precisely the endpoint you would be
 * looking at to find out what was wrong.
 *
 * Failing inside the function means the failure lands on the requests that
 * actually need a database, with a message naming the cause, while the
 * landing page and health check keep working and can tell you so.
 */

/**
 * `mongodb+srv://` connection strings require a DNS SRV lookup. Many ISP,
 * corporate or local resolvers refuse SRV queries, which surfaces as
 * `querySrv ECONNREFUSED`. Pointing Node at public resolvers (Google +
 * Cloudflare) first — keeping the system resolver as a fallback — makes
 * those lookups succeed.
 */
// Optional-chained on purpose: with the import-time guard removed, an unset
// URI reaches here as undefined, and `undefined.startsWith` would throw at
// module scope — recreating the site-wide outage this change exists to fix.
if (MONGODB_URI?.startsWith("mongodb+srv://")) {
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
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set — the database cannot be reached. " +
        "Set it in the deployment environment (see .env.example)."
    );
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        dbName: "personal-os",
        serverSelectionTimeoutMS: 15000,

        /**
         * No automatic index building in production.
         *
         * Mongoose otherwise issues a `createIndex` for every index on every
         * model the first time each is used — around thirty round trips.
         * That is fine on a long-lived server, where it happens once. On
         * serverless it happens on **every cold start**, and each one is a
         * full round trip to Atlas before any of the user's own queries run.
         *
         * `npm run db:indexes` owns the indexes instead: it creates what the
         * models declare and drops what they no longer do, which automatic
         * building never did anyway. Run it after deploying a model change —
         * it is in the deploy checklist for exactly this reason.
         *
         * Left on in development so a new index appears without remembering
         * to run anything.
         */
        autoIndex: process.env.NODE_ENV !== "production",

        /**
         * Keep the pool small. A serverless instance serves one request at a
         * time, so a large pool just means more sockets for Atlas to hold
         * open against its connection limit.
         */
        maxPoolSize: 10,
        minPoolSize: 0,
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
