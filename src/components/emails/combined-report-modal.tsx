"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { format as fmt } from "date-fns"
import { cs } from "date-fns/locale"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReportsHistoryButton } from "@/components/history/reports-history-button"

type Audience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES"
type Mode = "selected" | "all" | "unsentOnly"
type RecordKind = "planned" | "actual"
type ChangeType = "POSITION" | "NAME" | "NAME_AND_POSITION"

type PersonRow = {
  id: number
  name: string
  surname: string
  titleBefore: string | null
  titleAfter: string | null
  date: string | null
  position: string | null
  department: string | null
  personalNumber: string | null
  positionNum: string | null
  month: string
  kind: RecordKind
  wasSent: boolean
  sentDate: string | null
}

type ChangeRow = {
  id: number
  type: ChangeType
  status: string
  employeeName: string
  personalNumber: string | null
  position: string | null
  positionNum: string | null
  department: string | null
  effectiveDate: string
  month: string
  oldTitleBefore: string | null
  newTitleBefore: string | null
  oldName: string | null
  newName: string | null
  oldSurname: string | null
  newSurname: string | null
  oldTitleAfter: string | null
  newTitleAfter: string | null
  oldDepartment: string | null
  newDepartment: string | null
  oldUnitName: string | null
  newUnitName: string | null
  oldPositionName: string | null
  newPositionName: string | null
  oldPositionNum: string | null
  newPositionNum: string | null
  wasSent: boolean
  sentDate: string | null
}

interface RecordsResponse {
  onboardings: PersonRow[]
  offboardings: PersonRow[]
  changes: ChangeRow[]
}

type LaunchContext = "nastupy" | "odchody" | "zmeny"

interface Props {
  openSignal?: number
  defaultMonth?: string
  defaultAudience?: Audience
  defaultKind?: RecordKind
  context?: LaunchContext
}

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 " +
  "focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary " +
  "focus-visible:ring-2 focus-visible:ring-primary/55 " +
  "focus-visible:ring-offset-2 focus:ring-offset-background"

const ALL_CHANGE_TYPES: ChangeType[] = ["POSITION", "NAME", "NAME_AND_POSITION"]

function toggleInArray<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
}

function personKey(prefix: string, r: PersonRow) {
  return `${prefix}-${r.kind}-${r.month}-${r.id}`
}

function changeKey(r: ChangeRow) {
  return `change-${r.month}-${r.id}`
}

function formatFullName(r: {
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
}) {
  const before = r.titleBefore?.trim()
  const after = r.titleAfter?.trim()
  const base = `${r.name} ${r.surname}`.trim()
  let full = base
  if (before) full = `${before} ${full}`
  if (after) full = `${full}, ${after}`
  return full
}

function changeTypeLabel(type: ChangeRow["type"]) {
  if (type === "NAME") return "Jméno / titul"
  if (type === "POSITION") return "Pozice / odbor"
  return "Jméno i pozice"
}

function positionWithNum(position: string | null, positionNum: string | null) {
  if (position && positionNum) return `${position} (${positionNum})`
  return position ?? positionNum ?? "—"
}

function kindLabel(kind: RecordKind) {
  return kind === "planned" ? "Plánované" : "Skutečné"
}

function monthLabel(month: string) {
  return fmt(new Date(`${month}-01`), "LLLL yyyy", { locale: cs })
}

function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
  )
}

function groupByMonth<T extends { month: string }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const list = map.get(r.month)
    if (list) list.push(r)
    else map.set(r.month, [r])
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

export function CombinedReportModal({
  openSignal,
  defaultMonth = fmt(new Date(), "yyyy-MM"),
  defaultAudience = "ONBOARDING_GROUP",
  defaultKind = "actual",
  context = "nastupy",
}: Props) {
  const [open, setOpen] = useState(false)

  const [months, setMonths] = useState<string[]>([defaultMonth])
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState<number>(() =>
    Number(defaultMonth.slice(0, 4))
  )
  const [audience, setAudience] = useState<Audience>(defaultAudience)
  const [onboardingKinds, setOnboardingKinds] = useState<RecordKind[]>(
    context === "nastupy" ? [defaultKind] : []
  )
  const [offboardingKinds, setOffboardingKinds] = useState<RecordKind[]>(
    context === "odchody" ? [defaultKind] : []
  )
  const [changeTypes, setChangeTypes] = useState<ChangeType[]>(
    context === "zmeny" ? ALL_CHANGE_TYPES : []
  )

  const [onboardings, setOnboardings] = useState<PersonRow[]>([])
  const [offboardings, setOffboardings] = useState<PersonRow[]>([])
  const [changes, setChanges] = useState<ChangeRow[]>([])

  const [selectedOnboarding, setSelectedOnboarding] = useState<string[]>([])
  const [selectedOffboarding, setSelectedOffboarding] = useState<string[]>([])
  const [selectedChanges, setSelectedChanges] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const [confirmState, setConfirmState] = useState<{
    open: boolean
    mode: Mode | null
    alreadySent: number
    total: number
  }>({ open: false, mode: null, alreadySent: 0, total: 0 })

  const [successState, setSuccessState] = useState<{
    open: boolean
    total: number
  }>({ open: false, total: 0 })

  const [errorState, setErrorState] = useState<{
    open: boolean
    message: string | null
  }>({ open: false, message: null })

  useEffect(() => {
    if (confirmState.open || successState.open || errorState.open) return
    if (!open) return

    const timeout = setTimeout(() => {
      document.body.style.removeProperty("pointer-events")
    }, 0)

    return () => clearTimeout(timeout)
  }, [confirmState.open, successState.open, errorState.open, open])

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!openSignal) return

    setOpen(true)
    setAudience(defaultAudience)
    setOnboardingKinds(context === "nastupy" ? [defaultKind] : [])
    setOffboardingKinds(context === "odchody" ? [defaultKind] : [])
    setChangeTypes(context === "zmeny" ? ALL_CHANGE_TYPES : [])
    setMonths([defaultMonth])
    setPickerYear(Number(defaultMonth.slice(0, 4)))
    setOpenGroups({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  const yearMonths = useMemo(() => monthsOfYear(pickerYear), [pickerYear])

  const monthsLabel = useMemo(() => {
    const sorted = [...months].sort()
    const labels = sorted.map((m) => monthLabel(m))
    if (labels.length <= 1) return labels[0] ?? "Vyberte měsíc"
    if (labels.length <= 2) return labels.join(", ")
    return `${labels.length} měsíců vybráno`
  }, [months])

  function toggleMonth(m: string) {
    setMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort()
    )
  }

  const loadRecords = useCallback(async () => {
    if (!open || months.length === 0) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        months: months.join(","),
        audience,
        onboardingKinds: onboardingKinds.join(","),
        offboardingKinds: offboardingKinds.join(","),
        changeTypes: changeTypes.join(","),
      })
      const res = await fetch(`/api/reporty/kombinovany/zaznamy?${params}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Nepodařilo se načíst záznamy.")
      }
      const json = (await res.json()) as Partial<RecordsResponse>
      const nextOnboardings = Array.isArray(json?.onboardings)
        ? json.onboardings
        : []
      const nextOffboardings = Array.isArray(json?.offboardings)
        ? json.offboardings
        : []
      const nextChanges = Array.isArray(json?.changes) ? json.changes : []

      setOnboardings(nextOnboardings)
      setOffboardings(nextOffboardings)
      setChanges(nextChanges)

      // Předvybrat rovnou záznamy sekce, ze které se report otevřel -
      // uživatel typicky chce odeslat právě ty.
      setSelectedOnboarding(
        context === "nastupy"
          ? nextOnboardings.map((r) => personKey("on", r))
          : []
      )
      setSelectedOffboarding(
        context === "odchody"
          ? nextOffboardings.map((r) => personKey("off", r))
          : []
      )
      setSelectedChanges(
        context === "zmeny" ? nextChanges.map((r) => changeKey(r)) : []
      )
    } catch (error) {
      setErrorState({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "Nepodařilo se načíst záznamy.",
      })
    } finally {
      setLoading(false)
    }
  }, [
    open,
    months,
    audience,
    onboardingKinds,
    offboardingKinds,
    changeTypes,
    context,
  ])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  const totalRecords = onboardings.length + offboardings.length + changes.length
  const totalSelected =
    selectedOnboarding.length +
    selectedOffboarding.length +
    selectedChanges.length
  const totalSent =
    onboardings.filter((r) => r.wasSent).length +
    offboardings.filter((r) => r.wasSent).length +
    changes.filter((r) => r.wasSent).length

  function toggleAll() {
    if (totalSelected === totalRecords && totalRecords > 0) {
      setSelectedOnboarding([])
      setSelectedOffboarding([])
      setSelectedChanges([])
    } else {
      setSelectedOnboarding(onboardings.map((r) => personKey("on", r)))
      setSelectedOffboarding(offboardings.map((r) => personKey("off", r)))
      setSelectedChanges(changes.map((r) => changeKey(r)))
    }
  }

  function toggleUnsent() {
    setSelectedOnboarding(
      onboardings.filter((r) => !r.wasSent).map((r) => personKey("on", r))
    )
    setSelectedOffboarding(
      offboardings.filter((r) => !r.wasSent).map((r) => personKey("off", r))
    )
    setSelectedChanges(
      changes.filter((r) => !r.wasSent).map((r) => changeKey(r))
    )
  }

  async function handleSend(mode: Mode, force = false) {
    const payloadOnboardings =
      mode === "selected"
        ? onboardings.filter((r) =>
            selectedOnboarding.includes(personKey("on", r))
          )
        : onboardings
    const payloadOffboardings =
      mode === "selected"
        ? offboardings.filter((r) =>
            selectedOffboarding.includes(personKey("off", r))
          )
        : offboardings
    const payloadChanges =
      mode === "selected"
        ? changes.filter((r) => selectedChanges.includes(changeKey(r)))
        : changes

    const total =
      payloadOnboardings.length +
      payloadOffboardings.length +
      payloadChanges.length

    if (total === 0) return

    const alreadySentInPayload =
      payloadOnboardings.filter((r) => r.wasSent).length +
      payloadOffboardings.filter((r) => r.wasSent).length +
      payloadChanges.filter((r) => r.wasSent).length

    if (!force && mode !== "unsentOnly" && alreadySentInPayload > 0) {
      setConfirmState({
        open: true,
        mode,
        alreadySent: alreadySentInPayload,
        total,
      })
      return
    }

    setSending(true)
    try {
      const res = await fetch("/api/reporty/kombinovany/odeslat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          months,
          audience,
          mode,
          onboardings: payloadOnboardings,
          offboardings: payloadOffboardings,
          changes: payloadChanges,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Chyba při odesílání reportu.")
      }

      setSuccessState({ open: true, total })
      await loadRecords()
    } catch (error) {
      setErrorState({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "Chyba při odesílání reportu.",
      })
    } finally {
      setSending(false)
    }
  }

  function renderPersonSections(
    baseTitle: string,
    dateHeader: string,
    rows: PersonRow[],
    prefix: string,
    selected: string[],
    setSelected: (v: string[]) => void
  ) {
    if (loading || rows.length === 0) return null

    const groups = groupByMonth(rows)

    return (
      <div className="space-y-3">
        {groups.map(([month, monthRows]) => {
          const keysInGroup = monthRows.map((r) => personKey(prefix, r))
          const allChecked = keysInGroup.every((k) => selected.includes(k))
          const groupKey = `${prefix}-${month}`
          const isOpen = openGroups[groupKey] ?? true

          return (
            <Collapsible
              key={month}
              open={isOpen}
              onOpenChange={(v) =>
                setOpenGroups((prev) => ({ ...prev, [groupKey]: v }))
              }
              className="space-y-2"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
                >
                  <span>
                    {baseTitle} – {monthLabel(month)} ({monthRows.length})
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="w-full min-w-[640px] text-xs sm:text-sm">
                    <thead className="bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                      <tr>
                        <th className="w-10 p-2">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={() =>
                              setSelected(
                                allChecked
                                  ? selected.filter(
                                      (k) => !keysInGroup.includes(k)
                                    )
                                  : Array.from(
                                      new Set([...selected, ...keysInGroup])
                                    )
                              )
                            }
                            aria-label="Vybrat vše v tomto měsíci"
                          />
                        </th>
                        <th className="p-2 text-left font-medium">Jméno</th>
                        <th className="p-2 text-left font-medium">
                          Osobní číslo
                        </th>
                        <th className="p-2 text-left font-medium">Pozice</th>
                        <th className="hidden p-2 text-left font-medium sm:table-cell">
                          Odbor
                        </th>
                        <th className="p-2 text-left font-medium">
                          {dateHeader}
                        </th>
                        <th className="p-2 text-left font-medium">Režim</th>
                        <th className="w-32 p-2 text-left font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map((r) => {
                        const key = personKey(prefix, r)
                        return (
                          <tr
                            key={key}
                            className={cn(
                              "border-t hover:bg-muted/20",
                              r.wasSent && "bg-muted/10"
                            )}
                          >
                            <td className="p-2">
                              <Checkbox
                                checked={selected.includes(key)}
                                onCheckedChange={() =>
                                  setSelected(
                                    selected.includes(key)
                                      ? selected.filter((k) => k !== key)
                                      : [...selected, key]
                                  )
                                }
                                aria-label="Vybrat záznam"
                              />
                            </td>
                            <td className="p-2 font-medium">
                              {formatFullName(r)}
                            </td>
                            <td className="p-2">{r.personalNumber ?? "—"}</td>
                            <td className="p-2">{r.position ?? "—"}</td>
                            <td className="hidden p-2 sm:table-cell">
                              {r.department ?? "—"}
                            </td>
                            <td className="whitespace-nowrap p-2">
                              {r.date
                                ? fmt(new Date(r.date), "dd.MM.yyyy")
                                : "–"}
                            </td>
                            <td className="p-2">
                              <Badge
                                variant={
                                  r.kind === "planned" ? "secondary" : "default"
                                }
                              >
                                {kindLabel(r.kind)}
                              </Badge>
                            </td>
                            <td className="p-2">
                              {r.wasSent ? (
                                <span className="inline-flex flex-col gap-0.5 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCircle2 className="size-3 shrink-0" />
                                    Odesláno
                                  </span>
                                  {r.sentDate && (
                                    <span className="pl-4 text-[10px]">
                                      {fmt(new Date(r.sentDate), "dd.MM.yyyy")}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-green-600">
                                  Nové
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    )
  }

  function renderChangeSections() {
    if (loading || changes.length === 0) return null

    const groups = groupByMonth(changes)

    return (
      <div className="space-y-3">
        {groups.map(([month, monthRows]) => {
          const keysInGroup = monthRows.map((r) => changeKey(r))
          const allChecked = keysInGroup.every((k) =>
            selectedChanges.includes(k)
          )
          const groupKey = `changes-${month}`
          const isOpen = openGroups[groupKey] ?? true

          return (
            <Collapsible
              key={month}
              open={isOpen}
              onOpenChange={(v) =>
                setOpenGroups((prev) => ({ ...prev, [groupKey]: v }))
              }
              className="space-y-2"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
                >
                  <span>
                    Personální změny – {monthLabel(month)} ({monthRows.length})
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto rounded-lg border bg-background">
                  <table className="w-full min-w-[640px] text-xs sm:text-sm">
                    <thead className="bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                      <tr>
                        <th className="w-10 p-2">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={() =>
                              setSelectedChanges(
                                allChecked
                                  ? selectedChanges.filter(
                                      (k) => !keysInGroup.includes(k)
                                    )
                                  : Array.from(
                                      new Set([
                                        ...selectedChanges,
                                        ...keysInGroup,
                                      ])
                                    )
                              )
                            }
                            aria-label="Vybrat vše v tomto měsíci"
                          />
                        </th>
                        <th className="p-2 text-left font-medium">Jméno</th>
                        <th className="p-2 text-left font-medium">
                          Osobní číslo
                        </th>
                        <th className="hidden p-2 text-left font-medium sm:table-cell">
                          Pozice
                        </th>
                        <th className="hidden p-2 text-left font-medium sm:table-cell">
                          Odbor
                        </th>
                        <th className="p-2 text-left font-medium">Účinnost</th>
                        <th className="p-2 text-left font-medium">Typ změny</th>
                        <th className="w-32 p-2 text-left font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map((r) => {
                        const key = changeKey(r)
                        return (
                          <tr
                            key={key}
                            className={cn(
                              "border-t hover:bg-muted/20",
                              r.wasSent && "bg-muted/10"
                            )}
                          >
                            <td className="p-2">
                              <Checkbox
                                checked={selectedChanges.includes(key)}
                                onCheckedChange={() =>
                                  setSelectedChanges(
                                    selectedChanges.includes(key)
                                      ? selectedChanges.filter((k) => k !== key)
                                      : [...selectedChanges, key]
                                  )
                                }
                                aria-label="Vybrat záznam"
                              />
                            </td>
                            <td className="p-2 font-medium">
                              {r.employeeName}
                            </td>
                            <td className="p-2">{r.personalNumber ?? "—"}</td>
                            <td className="hidden p-2 sm:table-cell">
                              {positionWithNum(r.position, r.positionNum)}
                            </td>
                            <td className="hidden p-2 sm:table-cell">
                              {r.department ?? "—"}
                            </td>
                            <td className="whitespace-nowrap p-2">
                              {fmt(new Date(r.effectiveDate), "dd.MM.yyyy")}
                            </td>
                            <td className="p-2">
                              <Badge variant="secondary">
                                {changeTypeLabel(r.type)}
                              </Badge>
                            </td>
                            <td className="p-2">
                              {r.wasSent ? (
                                <span className="inline-flex flex-col gap-0.5 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCircle2 className="size-3 shrink-0" />
                                    Odesláno
                                  </span>
                                  {r.sentDate && (
                                    <span className="pl-4 text-[10px]">
                                      {fmt(new Date(r.sentDate), "dd.MM.yyyy")}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-green-600">
                                  Nové
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[88svh] w-full max-w-6xl flex-col gap-0 p-0 sm:max-h-[90svh]"
          style={{ overscrollBehavior: "contain" }}
        >
          <DialogHeader className="shrink-0 border-b p-3 sm:p-4 sm:px-6">
            <DialogTitle>Měsíční report – {monthsLabel}</DialogTitle>
          </DialogHeader>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            onWheelCapture={(e) => e.stopPropagation()}
          >
            <div className="space-y-3 p-3 sm:space-y-4 sm:p-4 sm:px-6">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[200px] flex-1">
                  <Label>Měsíce</Label>
                  <Popover
                    open={monthPickerOpen}
                    onOpenChange={(next) => {
                      setMonthPickerOpen(next)
                      if (next) {
                        const sorted = [...months].sort()
                        const latest = sorted[sorted.length - 1]
                        if (latest) setPickerYear(Number(latest.slice(0, 4)))
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "mt-1 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
                          focusRing
                        )}
                      >
                        <span className="truncate">{monthsLabel}</span>
                        <ChevronDown className="size-4 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      {months.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1 border-b pb-2">
                          {[...months].sort().map((m) => (
                            <Badge
                              key={m}
                              variant="secondary"
                              className="cursor-pointer gap-1 pr-1.5"
                              onClick={() => toggleMonth(m)}
                            >
                              {monthLabel(m)}
                              <span className="text-muted-foreground">×</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="mb-2 flex items-center justify-between px-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => setPickerYear((y) => y - 1)}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm font-semibold">
                          {pickerYear}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => setPickerYear((y) => y + 1)}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {yearMonths.map((m) => (
                          <label
                            key={m}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <Checkbox
                              checked={months.includes(m)}
                              onCheckedChange={() => toggleMonth(m)}
                            />
                            <span className="capitalize">
                              {fmt(new Date(`${m}-01`), "LLLL", {
                                locale: cs,
                              })}
                            </span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="min-w-[220px] flex-1">
                  <Label>Příjemce</Label>
                  <Tabs
                    value={audience}
                    onValueChange={(v) => setAudience(v as Audience)}
                    className="mt-1"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="ONBOARDING_GROUP">
                        Vybraná skupina
                      </TabsTrigger>
                      <TabsTrigger value="ALL_EMPLOYEES">
                        Všichni zaměstnanci
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Určuje jen komu se e-mail pošle (seznam z nastavení).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
                    Nástupy
                  </Label>
                  <div className="mt-2 space-y-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={onboardingKinds.includes("planned")}
                        onCheckedChange={() =>
                          setOnboardingKinds((prev) =>
                            toggleInArray(prev, "planned")
                          )
                        }
                      />
                      Plánované
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={onboardingKinds.includes("actual")}
                        onCheckedChange={() =>
                          setOnboardingKinds((prev) =>
                            toggleInArray(prev, "actual")
                          )
                        }
                      />
                      Skutečné
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
                    Odchody
                  </Label>
                  <div className="mt-2 space-y-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={offboardingKinds.includes("planned")}
                        onCheckedChange={() =>
                          setOffboardingKinds((prev) =>
                            toggleInArray(prev, "planned")
                          )
                        }
                      />
                      Plánované
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={offboardingKinds.includes("actual")}
                        onCheckedChange={() =>
                          setOffboardingKinds((prev) =>
                            toggleInArray(prev, "actual")
                          )
                        }
                      />
                      Skutečné
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
                    Typy změn
                  </Label>
                  <div className="mt-2 space-y-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={changeTypes.includes("POSITION")}
                        onCheckedChange={() =>
                          setChangeTypes((prev) =>
                            toggleInArray(prev, "POSITION")
                          )
                        }
                      />
                      Pozice / odbor
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={changeTypes.includes("NAME")}
                        onCheckedChange={() =>
                          setChangeTypes((prev) => toggleInArray(prev, "NAME"))
                        }
                      />
                      Jméno / titul
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={changeTypes.includes("NAME_AND_POSITION")}
                        onCheckedChange={() =>
                          setChangeTypes((prev) =>
                            toggleInArray(prev, "NAME_AND_POSITION")
                          )
                        }
                      />
                      Jméno i pozice
                    </label>
                  </div>
                </div>
              </div>

              {totalSent > 0 && (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {totalSent} z {totalRecords} záznamů už bylo odesláno.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleAll}
                  disabled={loading}
                >
                  {totalSelected === totalRecords && totalRecords > 0
                    ? "Odznačit vše"
                    : "Vybrat vše"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleUnsent}
                  disabled={loading}
                >
                  Vybrat neodeslané
                </Button>
                <div className="ml-auto text-sm text-muted-foreground">
                  Vybráno: {totalSelected} / {totalRecords}
                </div>
              </div>

              {loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Načítám…
                </div>
              ) : totalRecords === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Žádné záznamy pro vybraný výběr
                </div>
              ) : (
                <div className="space-y-6">
                  {renderPersonSections(
                    "Nástupy",
                    "Datum nástupu",
                    onboardings,
                    "on",
                    selectedOnboarding,
                    setSelectedOnboarding
                  )}
                  {renderPersonSections(
                    "Odchody",
                    "Datum odchodu",
                    offboardings,
                    "off",
                    selectedOffboarding,
                    setSelectedOffboarding
                  )}
                  {renderChangeSections()}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t px-3 py-2.5 sm:px-6 sm:py-3">
            <div className="flex flex-wrap justify-end gap-2">
              <ReportsHistoryButton scope="combined" title="Historie reportů" />

              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="mr-auto"
              >
                Zrušit
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSend("unsentOnly")}
                disabled={sending || loading}
                className="inline-flex items-center gap-1.5"
              >
                <Mail className="size-4 shrink-0" />
                Neodeslané
              </Button>
              <Button
                onClick={() => handleSend("selected")}
                disabled={totalSelected === 0 || sending || loading}
                className="inline-flex items-center gap-1.5"
              >
                <Mail className="size-4 shrink-0" />
                Vybrané ({totalSelected})
              </Button>
              <Button
                onClick={() => handleSend("all")}
                disabled={sending || loading}
                className="inline-flex items-center gap-1.5"
              >
                <Mail className="size-4 shrink-0" />
                Vše
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Odeslat znovu již odeslané?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            V aktuálním výběru je{" "}
            <span className="font-semibold">{confirmState.alreadySent}</span>{" "}
            záznamů, které už byly dříve odeslány.
            <br />
            Chcete je zahrnout znovu do tohoto reportu?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setConfirmState((prev) => ({ ...prev, open: false }))
              }
            >
              Ne, neodesílat znovu
            </Button>
            <Button
              onClick={() => {
                const m = confirmState.mode
                setConfirmState((prev) => ({ ...prev, open: false }))
                if (m) void handleSend(m, true)
              }}
            >
              Odeslat včetně nich
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={successState.open}
        onOpenChange={(open) => setSuccessState((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" />
              Report odeslán
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {successState.total} záznamů bylo úspěšně odesláno.
          </p>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                setSuccessState((prev) => ({ ...prev, open: false }))
                setOpen(false)
              }}
            >
              Pokračovat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={errorState.open}
        onOpenChange={(open) => setErrorState((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-5 text-red-600" />
              Chyba
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {errorState.message ?? "Nastala neznámá chyba."}
          </p>
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() =>
                setErrorState((prev) => ({ ...prev, open: false }))
              }
            >
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
