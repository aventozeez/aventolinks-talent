/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Namecheap deploy. The local WS relay (started via
  // instrumentation.ts) won't run on prod — that's intentional; the live
  // rounds are played on a single local network via `npm run dev:lan`.
  output: 'export',
  trailingSlash: true,
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
