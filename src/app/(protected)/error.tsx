"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { AlertTriangle } from "lucide-react"

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
          <AlertTriangle className="size-6 text-red-600 dark:text-red-400" />
        </div>

        <h1 className="mt-4 text-xl font-bold">Něco se pokazilo</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Tuto stránku se nepodařilo zobrazit. Zkuste to prosím znovu. Pokud
          problém přetrvává, kontaktujte IT oddělení.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Zkusit znovu
          </button>

          <a
            href="/prehled"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
          >
            Zpět na přehled
          </a>
        </div>
      </div>
    </div>
  )
}
