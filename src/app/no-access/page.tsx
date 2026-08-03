import Link from "next/link"

import { canAccessInternalApp, roleLabel } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/session"

import { SignOutButton } from "@/components/auth/signout-button"

export default async function NoAccessPage() {
  const user = await getCurrentUser()
  const hasInternalAccess = canAccessInternalApp(user?.role)

  if (hasInternalAccess) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-6">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Nemáte oprávnění k této akci</h1>

          <p className="mt-3 text-sm text-muted-foreground">
            Vaše role: <strong>{roleLabel(user?.role)}</strong>. Tuto část
            aplikace pro vaši roli nemáte zpřístupněnou.
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            Pokud ji potřebujete, obraťte se na IT.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/prehled"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 sm:w-auto"
            >
              Zpět na přehled
            </Link>
            <SignOutButton
              variant="outline"
              className="h-10 w-full justify-center px-4 py-2 sm:w-auto"
            >
              Zpět na přihlášení
            </SignOutButton>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-6">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Nemáte přístup do aplikace</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Tento účet nemá přístup do žádné části aplikace. Přístup mají pouze
          lidé pozvaní k podpisu výstupního listu, k hodnocení zkušební doby
          nebo k vyplnění jiného formuláře.
        </p>

        <p className="mt-3 text-sm text-muted-foreground">
          Pokud jste přišli přes odkaz k podpisu, hodnocení nebo vyplnění
          formuláře, otevřete znovu původní odkaz z e-mailu. Pokud potřebujete
          přístup do dalších částí systému, kontaktujte Mgr. Michaelu Aronovou.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <SignOutButton
            variant="outline"
            className="h-10 justify-center px-4 py-2"
          >
            Zpět na přihlášení
          </SignOutButton>
        </div>
      </div>
    </main>
  )
}
