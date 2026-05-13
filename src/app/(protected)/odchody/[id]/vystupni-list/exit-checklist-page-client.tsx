"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
import { useSession } from "next-auth/react"

import type { ExitChecklistData } from "@/types/exit-checklist"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = {
  offboardingId: number
  employeeName: string
}

export function ExitChecklistPageClient({
  offboardingId,
  employeeName,
}: Props) {
  const { data: session } = useSession()
  const router = useRouter()

  const canAccessApp = ["ADMIN", "HR", "IT", "READONLY"].includes(
    session?.user?.role ?? ""
  )

  const [data, setData] = useState<ExitChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const pendingNavRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSaved(false)

    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(
          `/api/odchody/${offboardingId}/exit-checklist`,
          { cache: "no-store", credentials: "include" }
        )

        const json = await res.json().catch(() => null)

        if (!res.ok) {
          throw new Error(
            json?.message ??
              json?.error ??
              "Nepodařilo se načíst výstupní list."
          )
        }

        if (!json?.data) throw new Error("Chybí data výstupního listu.")
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
  }, [offboardingId])

  useEffect(() => {
    if (!dirty) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty])

  const handleSaved = useCallback((newData: ExitChecklistData) => {
    setData(newData)
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }, [])

  function handleBackClick(e: React.MouseEvent, href: string) {
    if (dirty) {
      e.preventDefault()
      pendingNavRef.current = href
      setShowUnsavedDialog(true)
    }
  }

  function confirmLeave() {
    setShowUnsavedDialog(false)
    setDirty(false)
    if (pendingNavRef.current) {
      router.push(pendingNavRef.current)
      pendingNavRef.current = null
    }
  }

  const backHref = `/odchody/${offboardingId}`

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3">
          {canAccessApp && (
            <Link
              href={backHref}
              onClick={(e) => handleBackClick(e, backHref)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="size-4" />
              Zpět na odchod
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Výstupní list – {employeeName}
          </span>
        </div>

        {saved && !dirty && (
          <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
            <div>
              <p className="font-medium">Výstupní list byl úspěšně uložen.</p>
              <p className="mt-0.5 text-green-700">
                Všechny změny byly zaznamenány.
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
            offboardingId={offboardingId}
            mode="internal"
            initialData={data}
            onDirtyChange={setDirty}
            onSaved={handleSaved}
          />
        )}
      </div>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
            <AlertDialogDescription>
              Ve výstupním listu jsou neuložené změny. Pokud odejdete, přijdete
              o ně.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zůstat</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmLeave}
            >
              Odejít bez uložení
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
