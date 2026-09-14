/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 78],
    remotePatterns: [
      ...(process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321"
        ? [{ protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/product-images/**" }]
        : []),
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
            value: 'camera=(self "https://verify.didit.me"), microphone=(self "https://verify.didit.me")',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
