const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com${isDevelopment ? " http://127.0.0.1:* ws://127.0.0.1:*" : ""}`,
  "frame-src https://verify.didit.me https://verification.didit.me https://challenges.cloudflare.com",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75, 78],
    remotePatterns: [
      ...(process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321"
        ? [
            { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/product-images/**" },
            { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/marketing-assets/**" },
          ]
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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
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
