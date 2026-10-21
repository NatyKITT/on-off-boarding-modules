"use client"

import { useEffect, useState } from "react"
import { CheckCircle } from "lucide-react"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"
import { UnsavedChangesDialog } from "@/components/common/unsaved-changes-dialog"

type Props = {
  offboardingId: number
  open: boolean
}

export function ExitChecklistDialog({ offboardingId, open }: Props) {
  const [data, setData] = useState<ExitChecklistData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  const [saveTrigger, setSaveTrigger] = useState(0)
  const [savingAndLeaving, setSavingAndLeaving] = useState(false)

  const { isDialogOpen, guardAction, closeDialog, proceed } =
    useUnsavedChangesGuard(dirty)

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
      setSaved(false)
      return
    }

    setLoading(true)
    setError(null)
    setSaved(false)

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
    if (!next) {
      guardAction(() => emitClose())
    }
  }

  function handleSaved(newData: ExitChecklistData, requestClose?: boolean) {
    setData(newData)
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)

    if (savingAndLeaving || requestClose) {
      setSavingAndLeaving(false)
      proceed()
    }
  }

  function handleSaveAndLeave() {
    setSavingAndLeaving(true)
    setSaveTrigger((prev) => prev + 1)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="flex max-h-[95svh] w-full max-w-6xl flex-col overflow-hidden p-0"
          style={{ overscrollBehavior: "contain" }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="shrink-0 border-b bg-background px-5 py-4 sm:px-6">
            <DialogTitle className="text-lg font-semibold">
              Výstupní list
            </DialogTitle>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto p-5 sm:px-6"
            data-lenis-prevent=""
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {loading && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                <div className="size-4 animate-spin rounded-full border-b-2 border-current" />
                <span>Načítám data výstupního listu…</span>
              </div>
            )}

            {error && !loading && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-medium">Chyba při načítání</p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {saved && !dirty && (
              <div className="mb-4 flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium">
                    Výstupní list byl úspěšně uložen.
                  </p>
                  <p className="mt-0.5 text-green-700">
                    Všechny změny byly zaznamenány.
                  </p>
                </div>
              </div>
            )}

            {data && !loading && (
              <ExitChecklistForm
                offboardingId={offboardingId}
                initialData={data}
                onDirtyChange={(d) => {
                  setDirty(d)
                  if (d) setSaved(false)
                }}
                onSaved={handleSaved}
                externalSaveTrigger={saveTrigger}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={isDialogOpen}
        onStay={closeDialog}
        onDiscard={() => {
          setDirty(false)
          proceed()
        }}
        onSaveAndLeave={handleSaveAndLeave}
        saving={savingAndLeaving}
      />
    </>
  )
}
