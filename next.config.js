/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    // If you use "next export" (static HTML), uncomment this:
    // unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // COOP can stay
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Disable COEP so Firebase RTDB long-polling isn’t blocked
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;