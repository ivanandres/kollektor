import type { NextConfig } from 'next';

// The API runs on its own origin; the web proxies /api so auth cookies stay first-party.
const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

const config: NextConfig = {
  transpilePackages: ['@kollektor/api-client', '@kollektor/schemas'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
