/** @type {import('next').NextConfig} */
const nextConfig = {
  // Netlify deploys SSR and route handlers with its Next.js adapter.
  // Keep standalone output for the existing AWS/Docker deployment only.
  ...(process.env.NETLIFY === 'true' ? {} : { output: 'standalone' }),
  poweredByHeader: false,
  serverExternalPackages: ['xrpl', 'xumm-sdk', 'ripple-binary-codec', '@prisma/client', '@prisma/adapter-pg', 'pg', 'bcrypt'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'xumm.app' }],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
