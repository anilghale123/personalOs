/** @type {import('next').NextConfig} */
const nextConfig = {
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
