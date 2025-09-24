"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertTriangle, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Kind = "onboarding" | "offboarding"

type DeletedRow = {
  id: number
  userId: string
  displayUser?: string
  createdAt: string
  oldValue: string | null
}

type OldCommon = Partial<{
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  department: string
  unitName: string
  positionNum: string | number | null
  positionName: string
  notes: string | null
  status: "NEW" | "IN_PROGRESS" | "COMPLETED"
  email: string | null
  plannedStart: string
  actualStart: string | null
  userEmail: string | null
  userName: string | null
  personalNumber: string | null
  plannedEnd: string
  actualEnd: string | null
}>

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const pickS = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "string") return v
  }
  return undefined
}
const pickSN = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "string" || typeof v === "number") return v
  }
  return undefined
}
const date10 = (v?: string) =>
  v && v.length >= 10 ? v.slice(0, 10) : undefined
const toStr = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" ? v : ""

function normalizeOld(raw: unknown): OldCommon | undefined {
  if (!isObj(raw)) return undefined
  const base = isObj(raw.data) ? raw.data : raw
  return {
    titleBefore: pickS(base, "titleBefore", "title_before") ?? null,
    name: pickS(base, "name") ?? "",
    surname: pickS(base, "surname") ?? "",
    titleAfter: pickS(base, "titleAfter", "title_after") ?? null,
    email: pickS(base, "email", "personal_email", "contact_email") ?? null,
    positionNum: pickSN(base, "positionNum", "position_num") ?? null,
    positionName: pickS(base, "positionName", "position_name") ?? "",
    department: pickS(base, "department", "dept_name", "department_name") ?? "",
    unitName: pickS(base, "unitName", "unit_name", "unit") ?? "",
    plannedStart: date10(pickS(base, "plannedStart", "planned_start")),
    actualStart: date10(pickS(base, "actualStart", "actual_start")),
    plannedEnd: date10(pickS(base, "plannedEnd", "planned_end")),
    actualEnd: date10(pickS(base, "actualEnd", "actual_end")),
    userEmail: pickS(base, "userEmail", "user_email") ?? null,
    userName: pickS(base, "userName", "user_name") ?? null,
    personalNumber: pickS(base, "personalNumber", "personal_number") ?? null,
    notes: pickS(base, "notes") ?? null,
    status: pickS(base, "status") as OldCommon["status"] | undefined,
  }
}

function parseOld(s: string | null): OldCommon | undefined {
  if (!s) return undefined
  try {
    return normalizeOld(JSON.parse(s))
  } catch {
    return undefined
  }
}

const fullName = (o?: OldCommon) =>
  [o?.titleBefore, o?.name, o?.surname, o?.titleAfter]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(" ")

const isPlanned = (kind: Kind, o?: OldCommon) =>
  kind === "onboarding"
    ? Boolean(o?.plannedStart) && !o?.actualStart
    : Boolean(o?.plannedEnd) && !o?.actualEnd

const plannedISO = (kind: Kind, o?: OldCommon) =>
  kind === "onboarding" ? (o?.plannedStart ?? null) : (o?.plannedEnd ?? null)

export function DeletedPlannedDialog({
  kind,
  title,
  successEvent,
  triggerClassName,
  restoreButtonClassName,
  triggerLabel = "Smazané záznamy",
  restoreLabel = "Obnovit",
}: {
  kind: Kind
  title: string
  successEvent: string
  triggerClassName?: string
  restoreButtonClassName?: string
  triggerLabel?: string
  restoreLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rows, setRows] = useState<Array<DeletedRow & { old?: OldCommon }>>([])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch(`/api/audit/deleted?kind=${kind}`, {
          cache: "no-store",
        })
        const j = await res.json().catch(() => null)
        const raw: DeletedRow[] = Array.isArray(j?.data) ? j.data : []
        setRows(
          raw
            .map((r) => ({ ...r, old: parseOld(r.oldValue) }))
            .filter((r) => !r.old || isPlanned(kind, r.old))
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
        )
      } catch {
        setRows([])
      }
    })()
  }, [open, kind])

  function missing(o?: OldCommon) {
    const m: string[] = []
    if (!o) return ["data"]
    if (!o.name) m.push("jméno")
    if (!o.surname) m.push("příjmení")
    if (!toStr(o.positionNum)) m.push("číslo pozice")
    if (kind === "onboarding") {
      if (!o.plannedStart) m.push("datum plán. nástupu")
    } else {
      if (!o.plannedEnd) m.push("datum plán. odchodu")
    }
    return m
  }

  async function restore(row: DeletedRow & { old?: OldCommon }) {
    try {
      setBusyId(row.id)
      const o = row.old
      if (!o) throw new Error("Chybí data záznamu (oldValue).")
      const miss = missing(o)
      if (miss.length)
        throw new Error(`Nelze obnovit: chybí ${miss.join(", ")}.`)

      if (kind === "onboarding") {
        const payload = {
          titleBefore: o.titleBefore ?? null,
          name: o.name ?? "",
          surname: o.surname ?? "",
          titleAfter: o.titleAfter ?? null,
          email: o.email ?? null,
          userEmail: o.userEmail ?? null,
          positionNum: toStr(o.positionNum),
          positionName: o.positionName ?? "",
          department: o.department ?? "",
          unitName: o.unitName ?? "",
          plannedStart: o.plannedStart!,
          userName: o.userName ?? null,
          personalNumber: o.personalNumber ?? null,
          notes: o.notes ?? null,
          status: o.status ?? "NEW",
        }
        const res = await fetch("/api/nastupy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => null))?.message ??
              "Obnovení se nepodařilo."
          )
      } else {
        const payload = {
          titleBefore: o.titleBefore ?? null,
          name: o.name ?? "",
          surname: o.surname ?? "",
          titleAfter: o.titleAfter ?? null,
          positionNum: o.positionNum == null ? null : toStr(o.positionNum),
          positionName: o.positionName ?? "",
          department: o.department ?? "",
          unitName: o.unitName ?? "",
          plannedEnd: o.plannedEnd!,
          userEmail: o.userEmail ?? null,
          userName: o.userName ?? null,
          personalNumber: o.personalNumber ?? null,
          notes: o.notes ?? null,
          status: o.status ?? "NEW",
        }
        const res = await fetch("/api/odchody", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => null))?.message ??
              "Obnovení se nepodařilo."
          )
      }

      setRows((prev) => prev.filter((x) => x.id !== row.id))
      window.dispatchEvent(new Event(successEvent))
    } catch (e) {
      alert(e instanceof Error ? e.message : "Obnovení se nepodařilo.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className={triggerClassName ?? "text-muted-foreground"}
          title={triggerLabel}
          aria-label={triggerLabel}
        >
          <Trash2 className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      {/* ⬇️ pevná výška, obsah uvnitř scrolluje + „hezký“ layout */}
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        <DialogTitle className="px-6 pt-6">{title}</DialogTitle>

        <div className="max-h-[80vh] overflow-y-auto px-6 pb-6">
          {rows.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Žádné záznamy k zobrazení.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {rows.map((r) => {
                const o = r.old
                const iso = plannedISO(kind, o)
                const pretty = iso
                  ? format(new Date(iso), "d.M.yyyy", { locale: cs })
                  : null
                const miss = missing(o)
                const canRestore = miss.length === 0
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {(o ? fullName(o) : "—") || "—"} ·{" "}
                        {o?.positionName || "Pozice neznámá"}
                        {pretty ? ` · ${pretty}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Smazáno:{" "}
                        {new Intl.DateTimeFormat("cs-CZ", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(r.createdAt))}
                        {" · "}uživatel: {r.displayUser ?? r.userId}
                      </div>
                      {!canRestore && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="size-4" />
                          Nelze obnovit: chybí {miss.join(", ")}.
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void restore(r)}
                        disabled={busyId === r.id || !canRestore}
                        className={restoreButtonClassName}
                        title={canRestore ? restoreLabel : "Nelze obnovit"}
                        aria-label={canRestore ? restoreLabel : "Nelze obnovit"}
                      >
                        {busyId === r.id ? "Obnovuji…" : restoreLabel}
                      </Button>
                    </div>
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
