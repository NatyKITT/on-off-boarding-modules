"use client"

import { useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertCircle, Calendar, RotateCcw, Trash2, User } from "lucide-react"

import { useIsReadonly } from "@/hooks/use-current-role"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface DeletedRecord {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  positionName: string
  department: string
  unitName?: string
  plannedStart?: string | null
  plannedEnd?: string | null
  actualStart?: string | null
  actualEnd?: string | null
  personalNumber?: string | null
  deletedAt: string
  deletedBy: string
  effectiveDate?: string | null
}

interface DeletedRecordsDialogProps {
  kind: "onboarding" | "offboarding" | "employee-change"
  title: string
  triggerLabel?: string
  successEvent?: string
  restoreButtonClassName?: string
  onRestore?: () => void
}

type PendingRestore = {
  record: DeletedRecord
  loading: boolean
  checked: boolean
  willPause: boolean
  linkedLabel: string | null
  infoNote: string | null
}

export function DeletedRecordsDialog({
  kind,
  title,
  triggerLabel = "Smazané záznamy",
  successEvent,
  onRestore,
}: DeletedRecordsDialogProps) {
  const isReadonly = useIsReadonly()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleted, setDeleted] = useState<DeletedRecord[]>([])
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  const endpoint =
    kind === "onboarding"
      ? "nastupy"
      : kind === "offboarding"
        ? "odchody"
        : "zmeny"

  const loadDeleted = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/${endpoint}/deleted`, {
        cache: "no-store",
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.message || "Chyba při načítání")
      }

      if (json.status === "success" && Array.isArray(json.data)) {
        setDeleted(json.data)
      } else {
        setDeleted([])
      }
    } catch (err) {
      console.error("Error loading deleted records:", err)
      setError(err instanceof Error ? err.message : "Chyba při načítání dat")
      setDeleted([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      void loadDeleted()
    }
  }

  const openRestoreConfirm = async (record: DeletedRecord) => {
    setError(null)
    setPendingRestore({
      record,
      loading: true,
      checked: false,
      willPause: false,
      linkedLabel: null,
      infoNote: null,
    })

    if (kind === "employee-change") {
      try {
        const res = await fetch(`/api/zmeny/${record.id}/dopad`, {
          cache: "no-store",
        })
        const json = await res.json().catch(() => null)

        if (!res.ok) {
          throw new Error(json?.message || "Nepodařilo se ověřit propojení.")
        }

        const onboardingMatches: Array<{ cancelledAt?: string | null }> =
          Array.isArray(json?.data?.onboardingMatches)
            ? json.data.onboardingMatches
            : []
        const offboardingCount = Array.isArray(json?.data?.offboardingMatches)
          ? json.data.offboardingMatches.length
          : 0
        const activeOnboardingCount = onboardingMatches.filter(
          (m) => !m.cancelledAt
        ).length
        const cancelledOnboardingCount =
          onboardingMatches.length - activeOnboardingCount

        const parts: string[] = []
        if (activeOnboardingCount > 0)
          parts.push(
            `${activeOnboardingCount} ${activeOnboardingCount === 1 ? "nástupem" : "nástupy"}`
          )
        if (cancelledOnboardingCount > 0)
          parts.push(
            `${cancelledOnboardingCount} neuskutečněným${cancelledOnboardingCount === 1 ? "" : "i"} ${cancelledOnboardingCount === 1 ? "nástupem" : "nástupy"}`
          )
        if (offboardingCount > 0)
          parts.push(
            `${offboardingCount} ${offboardingCount === 1 ? "odchodem" : "odchody"}`
          )

        setPendingRestore({
          record,
          loading: false,
          checked: true,
          willPause: false,
          linkedLabel: null,
          infoNote:
            parts.length > 0
              ? `Propojeno s ${parts.join(" a ")} podle osobního čísla (jen informační vazba).`
              : null,
        })
      } catch {
        setPendingRestore({
          record,
          loading: false,
          checked: true,
          willPause: false,
          linkedLabel: null,
          infoNote: null,
        })
      }
      return
    }

    try {
      const res = await fetch(
        `/api/${endpoint}/${record.id}/restore?preview=true`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      )
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message || "Nepodařilo se ověřit propojení.")
      }

      const linked =
        json?.data?.linkedOnboarding ?? json?.data?.linkedOffboarding
      const linkedChangesCount: number = json?.data?.linkedChangesCount ?? 0

      setPendingRestore({
        record,
        loading: false,
        checked: true,
        willPause: Boolean(json?.data?.willPause),
        linkedLabel: linked?.label ?? null,
        infoNote:
          linkedChangesCount > 0
            ? `Propojeno i s ${linkedChangesCount} ${linkedChangesCount === 1 ? "zaměstnaneckou změnou" : "zaměstnaneckými změnami"} podle osobního čísla (jen informační vazba).`
            : null,
      })
    } catch (err) {
      console.error("Error checking restore impact:", err)
      setPendingRestore({
        record,
        loading: false,
        checked: true,
        willPause: false,
        linkedLabel: null,
        infoNote: null,
      })
    }
  }

  const performRestore = async () => {
    if (!pendingRestore) return
    const { record, willPause } = pendingRestore

    setPendingRestore((prev) => (prev ? { ...prev, loading: true } : prev))
    setError(null)

    try {
      let res = await fetch(
        `/api/${endpoint}/${record.id}/restore${willPause ? "?confirmPause=true" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      )
      let json = await res.json().catch(() => null)

      if (res.ok && json?.status === "confirm_required") {
        res = await fetch(
          `/api/${endpoint}/${record.id}/restore?confirmPause=true`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }
        )
        json = await res.json().catch(() => null)
      }

      if (!res.ok) {
        throw new Error(json?.message || "Obnovení se nezdařilo")
      }

      setDeleted((prev) => prev.filter((r) => r.id !== record.id))
      setPendingRestore(null)

      onRestore?.()

      if (successEvent) {
        window.dispatchEvent(new Event(successEvent))
      }
    } catch (err) {
      console.error("Error restoring record:", err)
      setError(err instanceof Error ? err.message : "Obnovení se nezdařilo")
      setPendingRestore(null)
    }
  }

  const getFullName = (record: DeletedRecord) => {
    return [record.titleBefore, record.name, record.surname, record.titleAfter]
      .filter(Boolean)
      .join(" ")
  }

  const getDateLabel = (record: DeletedRecord) => {
    if (kind === "onboarding") {
      const date = record.actualStart || record.plannedStart
      return date ? format(new Date(date), "d.M.yyyy", { locale: cs }) : "–"
    }
    if (kind === "employee-change") {
      return record.effectiveDate
        ? format(new Date(record.effectiveDate), "d.M.yyyy", { locale: cs })
        : "–"
    } else {
      const date = record.actualEnd || record.plannedEnd
      return date ? format(new Date(date), "d.M.yyyy", { locale: cs }) : "–"
    }
  }

  const recordKindLabel =
    kind === "onboarding"
      ? "Tento nástup"
      : kind === "offboarding"
        ? "Tento odchod"
        : "Tento záznam"

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Trash2 className="mr-2 size-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-w-4xl"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5" />
              {title}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <ScrollArea
            className="max-h-[60vh]"
            data-lenis-prevent=""
            onWheelCapture={(event) => event.stopPropagation()}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Načítám...
                </span>
              </div>
            ) : deleted.length === 0 ? (
              <div className="py-8 text-center">
                <Trash2 className="mx-auto mb-2 size-12 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  Žádné smazané záznamy
                </p>
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {deleted.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-lg border bg-muted/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div>
                          <div className="font-semibold">
                            {getFullName(record)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {record.positionName}
                            {record.unitName && ` · ${record.unitName}`}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {record.department}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              {kind === "onboarding"
                                ? "Nástup:"
                                : kind === "employee-change"
                                  ? "Účinnost:"
                                  : "Odchod:"}
                            </span>{" "}
                            <span className="font-medium">
                              {getDateLabel(record)}
                            </span>
                          </div>
                          {record.personalNumber && (
                            <div>
                              <span className="text-muted-foreground">
                                Os. číslo:
                              </span>{" "}
                              <span className="font-mono font-medium">
                                {record.personalNumber}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            <span>
                              Smazáno:{" "}
                              {format(
                                new Date(record.deletedAt),
                                "d.M.yyyy HH:mm",
                                {
                                  locale: cs,
                                }
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="size-3" />
                            <span>Smazal: {record.deletedBy}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void openRestoreConfirm(record)}
                        disabled={pendingRestore !== null || isReadonly}
                        className="shrink-0"
                      >
                        <RotateCcw className="mr-2 size-4" />
                        Obnovit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRestore !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !pendingRestore?.loading) setPendingRestore(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/20">
                <RotateCcw className="size-5 text-sky-700 dark:text-sky-400" />
              </div>
              <div>
                <DialogTitle>Obnovit záznam</DialogTitle>
                {pendingRestore && (
                  <p className="text-sm font-medium text-muted-foreground">
                    {getFullName(pendingRestore.record)}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {pendingRestore && !pendingRestore.checked ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Ověřuji propojené záznamy…
            </div>
          ) : (
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground">
                {recordKindLabel} se obnoví a zařadí zpět mezi aktivní záznamy.
              </p>

              {pendingRestore?.willPause && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <p className="font-medium">
                    {kind === "onboarding"
                      ? "Zkušební doba se po obnovení znovu pozastaví – je propojený s odchodem, který ji pozastavuje."
                      : "Tento odchod znovu pozastaví zkušební dobu propojeného nástupu."}
                  </p>
                  {pendingRestore.linkedLabel && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {pendingRestore.linkedLabel}
                    </p>
                  )}
                </div>
              )}

              {!pendingRestore?.willPause && pendingRestore?.linkedLabel && (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {kind === "onboarding"
                      ? "Po obnovení se tento nástup znovu propojí s odchodem nalezeným podle osobního čísla."
                      : "Po obnovení se tento odchod znovu propojí s nástupem nalezeným podle osobního čísla."}
                  </p>
                  <p className="mt-0.5">{pendingRestore.linkedLabel}</p>
                </div>
              )}

              {pendingRestore?.infoNote && (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {pendingRestore.infoNote}
                </div>
              )}

              <p className="text-muted-foreground">Souhlasíte s obnovením?</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingRestore(null)}
              disabled={pendingRestore?.loading}
            >
              Zrušit
            </Button>
            <Button
              onClick={() => void performRestore()}
              disabled={!pendingRestore?.checked || pendingRestore.loading}
              className="flex items-center gap-2"
            >
              {pendingRestore?.loading && pendingRestore.checked && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Obnovit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
