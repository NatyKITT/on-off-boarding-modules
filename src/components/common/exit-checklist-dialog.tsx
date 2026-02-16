"use client"

import { useEffect, useState } from "react"

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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = {
  offboardingId: number
  open: boolean
}

export function ExitChecklistDialog({ offboardingId, open }: Props) {
  const [data, setData] = useState<ExitChecklistData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false)
  const [saveTrigger, setSaveTrigger] = useState(0)
  const [closeAfterSave, setCloseAfterSave] = useState(false)

  function emitClose() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("exit-checklist:close"))
    }
  }

  useEffect(() => {
    if (!open) {
      setData(null)
      setDirty(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/odchody/${offboardingId}/exit-checklist`,
          {
            cache: "no-store",
            credentials: "include",
          }
        )
        if (!res.ok) {
          const json = await res.json().catch(() => null)
          const message =
            json?.message ??
            json?.error ??
            `Nepodařilo se načíst výstupní list (${res.status}).`
          throw new Error(message)
        }
        const json = (await res.json()) as {
          status?: string
          data?: ExitChecklistData
        }
        if (!json.data) {
          throw new Error("Chybí data výstupního listu.")
        }
        setData(json.data)
      } catch (err) {
        console.error("[ExitChecklistDialog] fetch error:", err)
        setError(
          err instanceof Error ? err.message : "Nepodařilo se načíst data."
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [open, offboardingId])

  function handleDialogOpenChange(next: boolean) {
    if (!next && dirty) {
      setShowUnsavedAlert(true)
    } else if (!next) {
      emitClose()
    }
  }

  function handleSaved(newData: ExitChecklistData) {
    setData(newData)
    setDirty(false)
    if (closeAfterSave) {
      setCloseAfterSave(false)
      emitClose()
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="flex max-h-[95svh] w-full max-w-5xl flex-col gap-0 p-0"
          style={{ overscrollBehavior: "contain" }}
        >
          <div className="shrink-0 border-b p-4 sm:px-6">
            <DialogTitle className="text-base font-semibold">
              Výstupní list
            </DialogTitle>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:px-6"
            data-lenis-prevent=""
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {loading && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <div className="size-4 animate-spin rounded-full border-b-2 border-current" />
                Načítám data výstupního listu…
              </div>
            )}

            {error && !loading && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="font-medium">Chyba při načítání</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {data && !loading && (
              <ExitChecklistForm
                offboardingId={offboardingId}
                initialData={data}
                onDirtyChange={setDirty}
                onSaved={handleSaved}
                externalSaveTrigger={saveTrigger}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedAlert} onOpenChange={setShowUnsavedAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
            <AlertDialogDescription>
              Ve výstupním listu jsou neuložené změny. Co s nimi?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zůstat ve formuláři</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowUnsavedAlert(false)
                setDirty(false)
                emitClose()
              }}
            >
              Odejít bez uložení
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={() => {
                setShowUnsavedAlert(false)
                setCloseAfterSave(true)
                setSaveTrigger((prev) => prev + 1)
              }}
            >
              Uložit změny a zavřít
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
