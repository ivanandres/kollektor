import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The API runs on its own origin; the web proxies /api so auth cookies stay first-party.
const apiUrl = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

const config: NextConfig = {
  // Self-contained server for the VPS image (apps/web/Dockerfile); Vercel ignores it.
  output: 'standalone',
  // E2E builds use their own folder so they can run next to `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@kollektor/api-client', '@kollektor/app-logic', '@kollektor/schemas'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
