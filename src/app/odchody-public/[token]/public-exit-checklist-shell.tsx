"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Loader2, XCircle } from "lucide-react"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = {
  token: string
  employeeName: string
}

export function PublicExitChecklistShell({ token, employeeName }: Props) {
  const [data, setData] = useState<ExitChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/odchody/public/${token}`, {
          cache: "no-store",
          credentials: "include",
        })

        const json = await res.json().catch(() => null)

        if (!res.ok) {
          throw new Error(
            json?.message ??
              json?.error ??
              "Nepodařilo se načíst výstupní list."
          )
        }

        if (!json?.data) {
          throw new Error("Chybí data výstupního listu.")
        }

        if (!cancelled) setData(json.data as ExitChecklistData)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Nepodařilo se načíst data."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Výstupní list</h1>
          <p className="text-sm text-muted-foreground">{employeeName}</p>
        </div>

        {saved && (
          <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
            <div>
              <p className="font-medium">Výstupní list byl úspěšně uložen.</p>
              <p className="mt-0.5 text-green-700">
                Vaše změny a podpisy byly zaznamenány. Tuto stránku můžete
                zavřít nebo se kdykoliv vrátit přes odkaz z e-mailu.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Načítám výstupní list…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <XCircle className="size-10 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {data && !loading && (
          <ExitChecklistForm
            mode="public"
            publicToken={token}
            initialData={data}
            onSaved={(newData) => {
              setData(newData)
              setSaved(true)
            }}
          />
        )}
      </div>
    </div>
  )
}
