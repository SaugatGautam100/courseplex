/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // It's good practice to keep this enabled
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**', // Allows any path on this hostname
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**', // Allows any path on this hostname
      },
    ],
  },
};

module.exports = nextConfig;