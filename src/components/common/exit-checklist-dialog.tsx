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
          { cache: "no-store" }
        )
        if (!res.ok) {
          throw new Error("Nepodařilo se načíst výstupní list.")
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
        console.error(err)
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogTitle>Výstupní list</DialogTitle>

          {loading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-b-2 border-current" />
              Načítám data výstupního listu…
            </div>
          )}

          {error && !loading && (
            <p className="py-4 text-sm text-red-600">{error}</p>
          )}

          {data && !loading && (
            <ExitChecklistForm
              offboardingId={offboardingId}
              initialData={data}
              canEdit={!data.lockedAt}
              onDirtyChange={setDirty}
              onSaved={handleSaved}
              externalSaveTrigger={saveTrigger}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedAlert} onOpenChange={setShowUnsavedAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
            <AlertDialogDescription>
              Ve výstupním listu jsou neuložené změny. Opravdu chcete formulář
              zavřít?
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
