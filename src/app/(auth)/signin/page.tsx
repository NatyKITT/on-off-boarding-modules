import type { Metadata } from "next"
import Link from "next/link"

import { env } from "@/env.mjs"

import { cn } from "@/lib/utils"

import { buttonVariants } from "@/components/ui/button"
import { OAuthButtons } from "@/components/auth/oauth-buttons"
import { Icons } from "@/components/shared/icons"

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "Přihlášení",
  description: "Přihlaste se pomocí účtu Google KITT nebo Praha 6",
}

export default async function SignInPage() {
  return (
    <div className="container flex h-screen w-screen flex-col items-center justify-center">
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "absolute left-4 top-4 md:left-8 md:top-8"
        )}
      >
        <>
          <Icons.chevronLeft className="mr-2 size-4" />
          Zpět
        </>
      </Link>

      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <Icons.logo className="mx-auto size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">Vítejte</h1>
          <p className="text-sm text-muted-foreground">
            Přihlaste se pomocí účtu Google KITT nebo Praha 6
          </p>
        </div>

        <OAuthButtons />
      </div>
    </div>
  )
}
