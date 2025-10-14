import "@/styles/globals.css"
import "@/styles/mdx.css"

import * as React from "react"
import type { Metadata, Viewport } from "next"
import { fontHeading, fontSans } from "@/fonts"

import { env } from "@/env.mjs"
import { siteConfig } from "@/config/site"

import { cn } from "@/lib/utils"

import { ClientLayout } from "@/components/layout/client-layout"

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
  icons: { icon: "/favicon.ico" },
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
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
