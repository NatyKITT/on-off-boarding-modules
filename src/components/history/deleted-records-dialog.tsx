"use client"

import { useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertCircle, Calendar, RotateCcw, Trash2, User } from "lucide-react"

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
}

interface DeletedRecordsDialogProps {
  kind: "onboarding" | "offboarding"
  title: string
  triggerLabel?: string
  successEvent?: string
  restoreButtonClassName?: string
  onRestore?: () => void
}

export function DeletedRecordsDialog({
  kind,
  title,
  triggerLabel = "Smazané záznamy",
  successEvent,
  onRestore,
}: DeletedRecordsDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleted, setDeleted] = useState<DeletedRecord[]>([])
  const [restoring, setRestoring] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDeleted = async () => {
    setLoading(true)
    setError(null)
    try {
      const endpoint = kind === "onboarding" ? "nastupy" : "odchody"
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

  const handleRestore = async (record: DeletedRecord) => {
    if (restoring) return

    setRestoring(record.id)
    setError(null)
    try {
      const endpoint = kind === "onboarding" ? "nastupy" : "odchody"
      const res = await fetch(`/api/${endpoint}/${record.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.message || "Obnovení se nezdařilo")
      }

      setDeleted((prev) => prev.filter((r) => r.id !== record.id))

      onRestore?.()

      if (successEvent) {
        window.dispatchEvent(new Event(successEvent))
      }
    } catch (err) {
      console.error("Error restoring record:", err)
      setError(err instanceof Error ? err.message : "Obnovení se nezdařilo")
    } finally {
      setRestoring(null)
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
    } else {
      const date = record.actualEnd || record.plannedEnd
      return date ? format(new Date(date), "d.M.yyyy", { locale: cs }) : "–"
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Trash2 className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
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

        <ScrollArea className="max-h-[60vh]">
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
                            {kind === "onboarding" ? "Nástup:" : "Odchod:"}
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
                              { locale: cs }
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
                      onClick={() => handleRestore(record)}
                      disabled={restoring === record.id}
                      className="shrink-0"
                    >
                      {restoring === record.id ? (
                        <>
                          <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-current" />
                          Obnovuji...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="mr-2 size-4" />
                          Obnovit
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
