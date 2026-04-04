/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    localPatterns: [
      {
        pathname: '/api/notion-image/**',
      },
      {
        pathname: '/api/notion-image',
      },
    ],
  },
}

export default nextConfig
