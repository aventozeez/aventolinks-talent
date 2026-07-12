/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Namecheap deploy. The local WS relay (started via
  // instrumentation.ts) won't run on prod — that's intentional; the live
  // rounds are played on a single local network via `npm run dev:lan`.
  output: 'export',
  trailingSlash: true,
  // Next 16 blocks cross-origin dev requests by default. For LAN hosting
  // (audience/team/moderator devices reaching the admin PC by IP), any
  // private-network address must be allowlisted or the browser can't load
  // the app's own JS chunks over the LAN.
  allowedDevOrigins: [
    '192.168.*.*', '192.168.*', '10.*.*.*', '10.*', '172.16.*.*', '172.17.*.*',
    '172.18.*.*', '172.19.*.*', '172.20.*.*', '172.21.*.*', '172.22.*.*',
    '172.23.*.*', '172.24.*.*', '172.25.*.*', '172.26.*.*', '172.27.*.*',
    '172.28.*.*', '172.29.*.*', '172.30.*.*', '172.31.*.*',
  ],
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'randomuser.me' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
}

module.exports = nextConfig
