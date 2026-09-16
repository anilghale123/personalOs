/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * Client-side router cache — how long a visited route may be re-shown
     * from memory instead of being refetched.
     *
     * Next 14 defaults `dynamic` to 0, so **every** navigation refetched the
     * route from the server, including going back to a page you were on
     * seconds ago. With every page marked `force-dynamic`, Home → Money →
     * Home paid a full server render three times, and on a serverless deploy
     * talking to Atlas that is where the multi-second switching came from.
     *
     * The screens people actually switch between are prerendered now (see
     * `app/app/layout.jsx`), so what `static` governs here is a payload that
     * contains **no user data at all** — it names the components to render
     * and nothing else, because every screen loads its own data in the
     * browser. Holding that for an hour cannot show anyone anything stale.
     * New code still reaches an open tab: a request carrying the previous
     * deployment's id is answered with a full reload, not a cached tree.
     *
     * `dynamic` still covers the handful of routes that do read the request
     * — the Pro-gated import screen, and the goal and discovery detail
     * pages. Thirty seconds is chosen against how that data changes: it is
     * the user's own record, edited by them, in this tab.
     */
    staleTimes: {
      dynamic: 30,
      static: 3600,
    },
    /**
     * Loaded by Node at runtime instead of bundled: unpdf ships its own
     * pdf.js build that webpack mangles; nodemailer and web-push are Node-only.
     */
    serverComponentsExternalPackages: ["unpdf", "nodemailer", "web-push"],
  },

  async redirects() {
    // The product moved under /app when / became the public landing page.
    // These keep every pre-move link landing somewhere sensible.
    const moved = ["goals", "portfolio", "budget", "planner", "review", "journal"];
    return moved.flatMap((section) => [
      {
        source: `/${section}`,
        destination: `/app/${section}`,
        permanent: false,
      },
      {
        source: `/${section}/:path*`,
        destination: `/app/${section}/:path*`,
        permanent: false,
      },
    ]);
  },
};

export default nextConfig;
