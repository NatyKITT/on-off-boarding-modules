import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"

import { OAuthButtons } from "@/components/auth/oauth-buttons"
import { Icons } from "@/components/shared/icons"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export default async function SignInPage() {
  const session = await getSession()
  if (session?.user) {
    redirect("/prehled")
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Icons.logo className="mb-3 size-10" />
          <h1 className="text-3xl font-semibold tracking-tight">Vítejte</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Přihlaste se pomocí účtu Google{" "}
            <span className="font-mono">@kitt6.cz</span> nebo{" "}
            <span className="font-mono">@praha6.cz</span>
          </p>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-2xl bg-gradient-to-r from-[#00A86B] via-[#19B278] to-[#2E7D32] opacity-35 blur-md" />
          <div className="rounded-2xl bg-gradient-to-r from-[#00A86B] via-[#19B278] to-[#2E7D32] p-px">
            <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <OAuthButtons />
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Nemáte přístup? Kontaktujte správce.
        </p>
      </div>
    </div>
  )
}
