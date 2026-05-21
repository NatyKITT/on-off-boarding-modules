import Image from "next/image"
import { redirect } from "next/navigation"

import { siteConfig } from "@/config/site"

import { getSession } from "@/lib/session"

import { OAuthButtons } from "@/components/auth/oauth-buttons"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type SignInPageProps = {
  searchParams: {
    callbackUrl?: string | string[]
  }
}

function getSearchParamValue(value?: string | string[]) {
  if (Array.isArray(value)) return value[0]
  return value
}

function getSafeCallbackUrl(value?: string | string[]) {
  const raw = getSearchParamValue(value)

  if (!raw) return null

  try {
    const decoded = decodeURIComponent(raw)

    if (decoded.startsWith("/") && !decoded.startsWith("//")) {
      return decoded
    }

    return null
  } catch {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return raw
    }

    return null
  }
}

function getDefaultRedirectByRole(role?: string | null) {
  if (role === "ADMIN") return "/admin"
  if (role === "HR" || role === "IT" || role === "READONLY") return "/prehled"

  return "/no-access"
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getSession()

  const safeCallbackUrl = getSafeCallbackUrl(searchParams.callbackUrl)

  if (session?.user) {
    redirect(safeCallbackUrl ?? getDefaultRedirectByRole(session.user.role))
  }

  const callbackUrl = safeCallbackUrl ?? "/"

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
            Přihlaste se pomocí oprávněného Google účtu.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-card/90 p-px shadow-md backdrop-blur">
          <div className="rounded-2xl bg-card p-4 sm:p-5">
            <OAuthButtons callbackUrl={callbackUrl} />
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
