"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, XCircle } from "lucide-react"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = {
  offboardingId: number
  employeeName: string
}

export function ExitChecklistPageClient({
  offboardingId,
  employeeName,
}: Props) {
  const [data, setData] = useState<ExitChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          `/api/odchody/${offboardingId}/exit-checklist`,
          {
            cache: "no-store",
            credentials: "include",
          }
        )

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

        if (!cancelled) {
          setData(json.data as ExitChecklistData)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Nepodařilo se načíst data."
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [offboardingId])

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/odchody"
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-4" />
            Zpět na odchody
          </Link>

          <span className="text-sm text-muted-foreground">
            Výstupní list – {employeeName}
          </span>
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
            offboardingId={offboardingId}
            mode="internal"
            initialData={data}
            onSaved={setData}
          />
        )}
      </div>
    </div>
  )
}
