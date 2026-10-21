"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Save,
  X,
  XCircle,
} from "lucide-react"
import { useSession } from "next-auth/react"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"
import { formatDayCountCs, getDaysRemaining } from "@/lib/dates"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-completion"

import { Button, buttonVariants } from "@/components/ui/button"
import { SavingButtonLabel } from "@/components/common/saving-button-label"
import { UnsavedChangesDialog } from "@/components/common/unsaved-changes-dialog"
import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = {
  offboardingId: number
  employmentEndDate?: string | null
}

function DeadlineBanner({ daysToEnd }: { daysToEnd: number }) {
  const tone = daysToEnd <= 7 || daysToEnd < 0 ? "danger" : "warning"
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800"

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${className}`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">
          {daysToEnd >= 0
            ? `Blíží se konec pracovního poměru – za ${formatDayCountCs(daysToEnd === 0 ? 1 : daysToEnd)}.`
            : `Pracovní poměr skončil před ${formatDayCountCs(Math.abs(daysToEnd))}.`}
        </p>
        <p className="mt-0.5 text-xs">
          Výstupní list zatím není kompletně podepsaný. Zajistěte prosím podpis
          všech povinných polí.
        </p>
      </div>
    </div>
  )
}

export function ExitChecklistPageClient({
  offboardingId,
  employmentEndDate,
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
  const [saveTrigger, setSaveTrigger] = useState(0)
  const [formSaving, setFormSaving] = useState(false)
  const saveAndLeaveRef = useRef(false)

  const { isDialogOpen, guardAction, closeDialog, proceed } =
    useUnsavedChangesGuard(dirty)

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

  const handleSaved = useCallback(
    (newData: ExitChecklistData) => {
      setData(newData)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 4000)

      if (saveAndLeaveRef.current) {
        saveAndLeaveRef.current = false
        proceed()
      }
    },
    [proceed]
  )

  function handleBackClick(e: React.MouseEvent, href: string) {
    e.preventDefault()
    guardAction(() => router.push(href))
  }

  function discardAndLeave() {
    setDirty(false)
    proceed()
  }

  function saveAndLeave() {
    saveAndLeaveRef.current = true
    setSaveTrigger((t) => t + 1)
  }

  const backHref = "/odchody"

  const daysToEnd = getDaysRemaining(employmentEndDate)
  const isComplete = data
    ? getExitChecklistCompletionState(data).isComplete
    : true
  const showDeadlineBanner =
    !isComplete && typeof daysToEnd === "number" && daysToEnd <= 30

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canAccessApp ? (
            <Link
              href={backHref}
              onClick={(e) => handleBackClick(e, backHref)}
              className={buttonVariants({
                size: "sm",
                className: "gap-1 bg-[#029B83] text-white hover:bg-[#02735F]",
              })}
            >
              <ArrowLeft className="size-4" />
              Zpět na odchod
            </Link>
          ) : (
            <span />
          )}

          {canAccessApp && (
            <div className="flex items-center gap-2">
              {dirty && (
                <span className="text-xs font-medium text-amber-700">
                  Máte neuložené změny
                </span>
              )}
              <Button
                type="button"
                size="sm"
                className="gap-1 bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={() => setSaveTrigger((t) => t + 1)}
                disabled={!dirty || formSaving}
              >
                <SavingButtonLabel
                  saving={formSaving}
                  savingText="Ukládám…"
                  idleText={
                    <>
                      <Save className="size-4" />
                      Uložit
                    </>
                  }
                />
              </Button>
              <button
                type="button"
                aria-label="Zavřít výstupní list"
                title="Zavřít a vrátit se na seznam odchodů"
                onClick={(e) => handleBackClick(e, backHref)}
                className="rounded-md border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>

        {showDeadlineBanner && !loading && (
          <DeadlineBanner daysToEnd={daysToEnd as number} />
        )}

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
          <>
            <ExitChecklistForm
              offboardingId={offboardingId}
              mode="internal"
              initialData={data}
              onDirtyChange={setDirty}
              onSavingChange={setFormSaving}
              onSaved={handleSaved}
              externalSaveTrigger={saveTrigger}
            />

            {canAccessApp && (
              <div className="flex items-center justify-end gap-2">
                {dirty && (
                  <span className="text-xs font-medium text-amber-700">
                    Máte neuložené změny
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="gap-1 bg-[#00847C] text-white hover:bg-[#0B6D73]"
                  onClick={() => setSaveTrigger((t) => t + 1)}
                  disabled={!dirty || formSaving}
                >
                  <SavingButtonLabel
                    saving={formSaving}
                    savingText="Ukládám…"
                    idleText={
                      <>
                        <Save className="size-4" />
                        Uložit
                      </>
                    }
                  />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <UnsavedChangesDialog
        open={isDialogOpen}
        onStay={closeDialog}
        onDiscard={discardAndLeave}
        onSaveAndLeave={saveAndLeave}
        saving={formSaving}
      />
    </div>
  )
}
