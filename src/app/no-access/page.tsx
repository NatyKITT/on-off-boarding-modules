import Link from "next/link"

import { SignOutButton } from "@/components/auth/signout-button"

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-6">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Nemáte přístup do aplikace</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Tento účet má povolený pouze podpisový režim výstupního listu,
          případně nemá přiřazenou roli pro vstup do interní části aplikace.
        </p>

        <p className="mt-3 text-sm text-muted-foreground">
          Pokud jste přišli přes odkaz na výstupní list, otevřete znovu původní
          odkaz z e-mailu. Pokud potřebujete přístup do dalších částí systému,
          kontaktujte administrátora.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/signin"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Zpět na přihlášení
          </Link>

          <SignOutButton
            variant="outline"
            className="h-10 justify-center px-4 py-2"
          >
            Odhlásit účet
          </SignOutButton>
        </div>
      </div>
    </main>
  )
}
