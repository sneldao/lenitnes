/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiInternalUrl =
      process.env.API_INTERNAL_URL ||
      (process.env.NODE_ENV === 'production' ? 'http://api:8742' : 'http://localhost:4000');

    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
