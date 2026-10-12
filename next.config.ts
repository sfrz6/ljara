import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "@sparticuz/chromium", "puppeteer-core", "pg"],
  outputFileTracingIncludes: {
    "/api/pdf/**": [
      "./node_modules/@fontsource/ibm-plex-sans-arabic/files/*-{400,500,600,700}-normal.woff2",
      "./node_modules/@fontsource/ibm-plex-sans/files/*-latin-{400,500,600,700}-normal.woff2",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default config;
