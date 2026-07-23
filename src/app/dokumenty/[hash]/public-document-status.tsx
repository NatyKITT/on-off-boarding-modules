import { AlertCircle, CheckCircle } from "lucide-react"

type Props = {
  fullPage?: boolean
}

export function PublicDocumentThankYou({ fullPage = true }: Props = {}) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center"
          : "flex flex-col items-center px-4 py-10 text-center"
      }
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20">
        <CheckCircle className="size-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h1 className="mt-4 text-2xl font-bold">Děkujeme za vyplnění</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Váš formulář byl úspěšně vyplněn a zaslán na Personální oddělení. Odkaz
        již není platný. Pokud potřebujete něco změnit, obraťte se na Personální
        oddělení ÚMČ Praha 6.
      </p>
    </div>
  )
}

export function PublicDocumentInvalid({ fullPage = true }: Props = {}) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center"
          : "flex flex-col items-center px-4 py-10 text-center"
      }
    >
      <AlertCircle className="mb-4 size-12 text-red-500" />
      <h1 className="text-2xl font-bold">Odkaz není platný</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Dokument buď neexistuje, nebo jeho platnost již vypršela. Pokud
        potřebujete pomoc, obraťte se na Personální oddělení ÚMČ Praha 6.
      </p>
    </div>
  )
}
