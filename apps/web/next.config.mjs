/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security headers for the web layer. helmet() covers the API only;
  // these ship HSTS, CSP frame-ancestors, and the nosniff/referrer/
  // permissions baseline to every page + asset response.
  //
  // CSP notes:
  // - 'unsafe-inline'/'unsafe-eval' scripts are still required by the
  //   Next.js hydration runtime (webpack runtime inline bootstrap).
  //   The real win is frame-ancestors (plus HSTS/nosniff below):
  //   nothing except this origin and the Hugging Face Space mirror
  //   (hf-space/index.html iframes /research) may frame the site.
  // - connect-src allows https/wss for the API rewrite, WalletConnect,
  //   and Hedera mirror nodes.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
              "font-src 'self' data:; connect-src 'self' https: wss: ws:; " +
              "frame-ancestors 'self' https://*.huggingface.co; base-uri 'self'; " +
              "form-action 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
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
  poweredByHeader: false,
};

export default nextConfig;