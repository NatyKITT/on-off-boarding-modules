import Image from "next/image"
import { redirect } from "next/navigation"

import { siteConfig } from "@/config/site"

import { getSession } from "@/lib/session"

import { OAuthButtons } from "@/components/auth/oauth-buttons"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export default async function SignInPage() {
  const session = await getSession()
  if (session?.user) {
    redirect("/prehled")
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/60 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/assets/icons/onboarding.svg"
            alt={`${siteConfig.name} logo`}
            width={120}
            height={120}
            className="mb-4 h-16 w-auto sm:h-20"
            priority
          />

          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Přihlášení do systému
          </h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Přihlaste se pomocí účtu Google{" "}
            <span className="font-mono">@praha6.cz</span>
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-card/90 p-px shadow-md backdrop-blur">
          <div className="rounded-2xl bg-card p-4 sm:p-5">
            <OAuthButtons />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Nemáte přístup?{" "}
          <span className="font-medium">Kontaktujte správce.</span>
        </p>
      </div>
    </div>
  )
}
