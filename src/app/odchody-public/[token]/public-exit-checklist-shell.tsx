"use client"

import { useEffect, useState } from "react"
import { Loader2, XCircle } from "lucide-react"

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

  useEffect(() => {
    void (async () => {
      try {
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

        setData(json.data as ExitChecklistData)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Nepodařilo se načíst data."
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Výstupní list</h1>
          <p className="text-sm text-muted-foreground">{employeeName}</p>
        </div>

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
            offboardingId={data.offboardingId}
            mode="public"
            publicToken={token}
            initialData={data}
            onSaved={setData}
          />
        )}
      </div>
    </div>
  )
}
