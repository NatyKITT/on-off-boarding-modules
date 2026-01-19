import { withSentryConfig } from "@sentry/nextjs"

void import("./src/env.mjs")

/** @type {import("next").NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  pageExtensions: ["tsx", "ts", "js"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "uploadthing.com" },
    ],
  },

  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },

  compress: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ]
  },
}

const sentryWebpackPluginOptions = {
  org: "praha6",
  project: "on-off-boarding-module",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  automaticVercelMonitors: true,
}

const nextConfig = withSentryConfig(baseConfig, sentryWebpackPluginOptions)

export default nextConfig
