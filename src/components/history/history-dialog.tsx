"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { History as HistoryIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Kind = "onboarding" | "offboarding"

type AuditRow = {
  id: number
  employeeId: number
  userId: string
  displayUser?: string
  action: "UPDATE" | "DELETE" | "CREATE"
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: string
}

function parseJSON(v: string | null): unknown {
  if (!v) return null
  try {
    const parsed = JSON.parse(v)
    return parsed
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
  plannedStart: "Plán. nástup",
  actualStart: "Skutečný nástup",
  userEmail: "Firemní účet",
  userName: "Uživatelské jméno",
  personalNumber: "Osobní číslo",
  plannedEnd: "Plán. odchod",
  actualEnd: "Skutečný odchod",
  "*": "Záznam",
}

function prettyValue(field: string | null | undefined, val: unknown) {
  if (val == null) return "—"

  const f = field ?? ""
  const isDateField =
    f.includes("plannedStart") ||
    f.includes("actualStart") ||
    f.includes("plannedEnd") ||
    f.includes("actualEnd")

  if (isDateField) {
    try {
      const iso = typeof val === "string" ? val : String(val)
      const d = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`)
      if (!isNaN(d.getTime())) return format(d, "d.M.yyyy", { locale: cs })
    } catch {}
  }

  if (
    f === "positionNum" &&
    (typeof val === "string" || typeof val === "number")
  )
    return String(val)

  if (typeof val === "string") return val
  return JSON.stringify(val)
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

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch(`/api/audit?kind=${kind}&id=${id}`, {
          cache: "no-store",
        })
        const j = await res.json().catch(() => null)
        const raw: AuditRow[] = Array.isArray(j?.data) ? j.data : []
        setRows(raw)
      } catch {
        setRows([])
      }
    })()
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

      {/* ⬇️ menší modal, obsah uvnitř scrolluje */}
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogTitle className="px-6 pt-6">Historie změn</DialogTitle>

        <div className="max-h-[80vh] overflow-y-auto px-6 pb-6">
          {!rows ? (
            <p className="mt-1 text-sm text-muted-foreground">Načítám…</p>
          ) : rows.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Zatím žádné změny.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {rows.map((r) => {
                const oldV = parseJSON(r.oldValue)
                const newV = parseJSON(r.newValue)
                const label =
                  r.field && CZ_FIELD_LABEL[r.field]
                    ? CZ_FIELD_LABEL[r.field]
                    : CZ_FIELD_LABEL["*"]

                return (
                  <div key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {r.action === "DELETE"
                          ? "Smazání záznamu"
                          : r.action === "CREATE"
                            ? "Vytvoření záznamu"
                            : `Změna: ${label}`}
                      </span>
                      <span className="text-muted-foreground">
                        {new Intl.DateTimeFormat("cs-CZ", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(r.createdAt))}
                        {" · "}uživatel: {r.displayUser ?? r.userId}
                      </span>
                    </div>

                    {r.action === "UPDATE" && (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div className="rounded bg-muted/40 p-2">
                          <div className="text-[11px] uppercase text-muted-foreground">
                            Před
                          </div>
                          <div>{prettyValue(r.field, oldV)}</div>
                        </div>
                        <div className="rounded bg-muted/40 p-2">
                          <div className="text-[11px] uppercase text-muted-foreground">
                            Po
                          </div>
                          <div>{prettyValue(r.field, newV)}</div>
                        </div>
                      </div>
                    )}

                    {r.action === "DELETE" && r.oldValue && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Zobrazit surová data
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                          {r.oldValue}
                        </pre>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
