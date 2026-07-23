import { SignOutButton } from "@/components/auth/signout-button"

export default function NoAccessPage() {
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
