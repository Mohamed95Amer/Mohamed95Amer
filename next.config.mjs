/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: 'camera=(self "https://api.sumsub.com" "https://api.uae.sumsub.com"), microphone=(self "https://api.sumsub.com" "https://api.uae.sumsub.com")',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
