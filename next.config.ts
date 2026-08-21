import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },

  async headers() {
    const isProd = process.env.NODE_ENV === "production";

    const connectSrc = isProd
      ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
      : "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321";

    const imgSrc = isProd
      ? "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com"
      : "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com http://127.0.0.1:54321";

    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

    // X-Frame-Options: DENY and the CSP's frame-ancestors 'none' both block
    // any <iframe> from rendering this app — including an IDE's embedded
    // preview pane, which next dev serves under this same headers() config.
    // Scoped to production only, matching connectSrc/imgSrc/scriptSrc above.
    const cspDirectives = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      imgSrc,
      "font-src 'self' data:",
      connectSrc,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    if (isProd) cspDirectives.push("frame-ancestors 'none'");

    return [
      {
        source: "/(.*)",
        headers: [
          ...(isProd ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: cspDirectives.join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
