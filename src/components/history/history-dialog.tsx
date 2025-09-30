"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Calendar, History as HistoryIcon, User } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

type Kind = "onboarding" | "offboarding"

type AuditRow = {
  id: number
  employeeId: number
  userId: string
  displayUser?: string
  action: "UPDATE" | "DELETE" | "CREATE" | "RESTORED" | "STATUS_CHANGED"
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: string
}

function parseJSON(v: string | null): unknown {
  if (!v) return null
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

const CZ_FIELD_LABEL: Record<string, string> = {
  titleBefore: "Titul před",
  name: "Jméno",
  surname: "Příjmení",
  titleAfter: "Titul za",
  positionNum: "Číslo pozice",
  positionName: "Pozice",
  department: "Odbor",
  unitName: "Oddělení",
  notes: "Poznámka",
  status: "Stav",
  email: "E-mail (osobní)",
  plannedStart: "Plánovaný nástup",
  actualStart: "Skutečný nástup",
  probationEnd: "Konec zkušební doby",
  startTime: "Čas nástupu",
  userEmail: "Firemní účet",
  userName: "Uživatelské jméno",
  personalNumber: "Osobní číslo",
  plannedEnd: "Plánovaný odchod",
  actualEnd: "Skutečný odchod",
  noticePeriodEnd: "Konec výpovědní lhůty",
  deleted_at: "Smazání",
  "*": "Záznam",
}

const CZ_ACTION_LABEL: Record<string, string> = {
  CREATE: "Vytvoření záznamu",
  UPDATE: "Změna",
  DELETE: "Smazání",
  RESTORED: "Obnovení",
  STATUS_CHANGED: "Změna stavu",
}

function prettyValue(field: string | null | undefined, val: unknown): string {
  if (val == null || val === "") return "—"

  const f = field ?? ""

  const isDateField =
    f.includes("plannedStart") ||
    f.includes("actualStart") ||
    f.includes("plannedEnd") ||
    f.includes("actualEnd") ||
    f.includes("probationEnd") ||
    f.includes("noticePeriodEnd")

  if (isDateField) {
    try {
      const iso = typeof val === "string" ? val : String(val)
      const d = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`)
      if (!isNaN(d.getTime())) {
        return format(d, "d.M.yyyy", { locale: cs })
      }
    } catch {}
  }

  if (
    f === "positionNum" &&
    (typeof val === "string" || typeof val === "number")
  ) {
    return String(val)
  }

  if (typeof val === "boolean") {
    return val ? "Ano" : "Ne"
  }

  if (typeof val === "string") {
    return val
  }

  return JSON.stringify(val)
}

function getActionBadgeVariant(
  action: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "CREATE":
      return "default"
    case "DELETE":
      return "destructive"
    case "RESTORED":
      return "default"
    case "STATUS_CHANGED":
      return "secondary"
    default:
      return "outline"
  }
}

export function HistoryDialog({
  id,
  kind,
  trigger,
}: {
  id: number
  kind: Kind
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    const loadHistory = async () => {
      setLoading(true)
      try {
        const endpoint = kind === "onboarding" ? "nastupy" : "odchody"
        const res = await fetch(`/api/${endpoint}/${id}/history`, {
          cache: "no-store",
        })

        if (!res.ok) {
          console.error("History API error:", res.status, res.statusText)
          setRows([])
          return
        }

        const j = await res.json()
        console.log("History API response:", j)

        const raw: AuditRow[] = Array.isArray(j?.data) ? j.data : []
        setRows(raw)
      } catch (err) {
        console.error("Error loading history:", err)
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    void loadHistory()
  }, [open, kind, id])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="icon"
            variant="ghost"
            title="Historie změn"
            aria-label="Historie změn"
          >
            <HistoryIcon className="size-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-5" />
            Historie změn
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          {loading || !rows ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
              <span className="ml-2 text-sm text-muted-foreground">
                Načítám historii…
              </span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center">
              <HistoryIcon className="mx-auto mb-2 size-12 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                Zatím žádné změny.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {rows.map((r) => {
                const oldV = parseJSON(r.oldValue)
                const newV = parseJSON(r.newValue)
                const fieldLabel =
                  r.field && CZ_FIELD_LABEL[r.field]
                    ? CZ_FIELD_LABEL[r.field]
                    : r.field || "Záznam"
                const actionLabel = CZ_ACTION_LABEL[r.action] || r.action
                const userName = r.displayUser || r.userId || "Neznámý"

                return (
                  <div key={r.id} className="rounded-lg border bg-muted/30 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Badge
                          variant={getActionBadgeVariant(r.action)}
                          className="w-fit"
                        >
                          {actionLabel}
                          {r.action === "UPDATE" && `: ${fieldLabel}`}
                        </Badge>
                      </div>

                      <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <User className="size-3.5" />
                          <span className="font-medium">{userName}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5" />
                          <span>
                            {format(new Date(r.createdAt), "d.M.yyyy HH:mm", {
                              locale: cs,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {r.action === "UPDATE" && (
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <div className="rounded-md border bg-background/50 p-3">
                          <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                            Původní hodnota
                          </div>
                          <div className="break-words text-muted-foreground">
                            {prettyValue(r.field, oldV)}
                          </div>
                        </div>
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                          <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                            Nová hodnota
                          </div>
                          <div className="break-words font-semibold">
                            {prettyValue(r.field, newV)}
                          </div>
                        </div>
                      </div>
                    )}

                    {(r.action === "CREATE" ||
                      r.action === "DELETE" ||
                      r.action === "RESTORED") && (
                      <div className="text-sm text-muted-foreground">
                        {r.action === "CREATE" && <p>Záznam byl vytvořen.</p>}
                        {r.action === "DELETE" && <p>Záznam byl smazán.</p>}
                        {r.action === "RESTORED" && (
                          <p>Záznam byl obnoven ze smazaných.</p>
                        )}
                        {r.oldValue && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs hover:text-foreground">
                              Zobrazit detailní data
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[11px]">
                              {r.oldValue}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}

                    {r.action === "STATUS_CHANGED" && (
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <div className="rounded-md border bg-background/50 p-3">
                          <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                            Původní stav
                          </div>
                          <div className="break-words text-muted-foreground">
                            {prettyValue("status", oldV)}
                          </div>
                        </div>
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                          <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                            Nový stav
                          </div>
                          <div className="break-words font-semibold">
                            {prettyValue("status", newV)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
