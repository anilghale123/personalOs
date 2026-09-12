/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * Client-side router cache.
     *
     * Next 14 defaults `dynamic` to 0, so **every** navigation refetches the
     * route from the server — including going back to a page you were on
     * seconds ago. With every page here marked `force-dynamic`, that meant
     * Home → Money → Home paid a full server render three times, and on a
     * serverless deploy talking to Atlas that is where the multi-second
     * switching came from.
     *
     * 30 seconds is chosen against how this data actually changes: it is the
     * user's own record, edited by them, in this tab. A mutation invalidates
     * the affected paths through `revalidateTag` (see lib/cache.js), so the
     * stale window only ever applies to data nobody has touched. Long enough
     * that flicking between sections is instant; short enough that a change
     * made on a phone shows up on the laptop almost immediately.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
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
