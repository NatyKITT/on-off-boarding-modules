"use client"

import { fontSans } from "@/fonts"
import { Analytics } from "@vercel/analytics/react"
import { SessionProvider } from "next-auth/react"

import { SmoothScrollProvider } from "@/providers/smooth-scroll-provider"
import { ThemeProvider } from "@/providers/theme-provider"
import { cn } from "@/lib/utils"

import { Toaster } from "@/components/ui/toaster"
import { TailwindIndicator } from "@/components/tailwind-indicator"

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div
        className={cn(
          "w-full bg-background font-sans antialiased",
          fontSans.variable
        )}
      >
        <SmoothScrollProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            {children}
            <Toaster />
            <Analytics />
            <TailwindIndicator />
          </ThemeProvider>
        </SmoothScrollProvider>
      </div>
    </SessionProvider>
  )
}
