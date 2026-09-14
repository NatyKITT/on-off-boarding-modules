import "@/styles/globals.css"
import "@/styles/mdx.css"

import * as React from "react"
import type { Metadata, Viewport } from "next"
import { fontHeading, fontSans } from "@/fonts"

import { env } from "@/env.mjs"
import { siteConfig } from "@/config/site"

import { cn } from "@/lib/utils"

import { AuthStatusFeedback } from "@/components/auth/auth-status-feedback"
import { ClientLayout } from "@/components/layout/client-layout"
import { ChunkLoadRecovery } from "@/components/system/chunk-load-recovery"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: siteConfig.name, template: `%s - ${siteConfig.name}` },
  description: siteConfig.description,
  authors: [{ name: siteConfig.author }],
  creator: siteConfig.author,
  keywords: siteConfig.keywords,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  icons: {
    icon: [
      { url: "/assets/favicons/favicon.ico", sizes: "any" },
      {
        url: "/assets/favicons/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/assets/favicons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/assets/favicons/favicon-48x48.png",
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: "/assets/favicons/favicon-96x96.png",
        sizes: "96x96",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/assets/favicons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        url: "/assets/favicons/apple-touch-icon-152x152.png",
        sizes: "152x152",
        type: "image/png",
      },
      {
        url: "/assets/favicons/apple-touch-icon-167x167.png",
        sizes: "167x167",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body
        className={cn(
          "overflow-x-hidden overflow-y-scroll bg-background font-sans text-foreground",
          fontSans.variable,
          fontHeading.variable
        )}
      >
        <ChunkLoadRecovery />

        <React.Suspense fallback={null}>
          <AuthStatusFeedback />
        </React.Suspense>

        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
