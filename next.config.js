/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" }, // optional GCS
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // optional Google hosted
    ],
    // If you use "next export" (static HTML), uncomment this:
    // unoptimized: true,
  },
};

module.exports = nextConfig;