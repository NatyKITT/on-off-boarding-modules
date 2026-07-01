"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit,
  History as HistoryIcon,
  Link2,
  Search,
  Trash2,
  User,
  XCircle,
} from "lucide-react"

import { type Position } from "@/types/position"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmployeeChangeReportLauncher } from "@/components/emails/employee-change-report-launcher"
import { EmployeeChangeForm } from "@/components/forms/employee-change-form"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

type ChangeType = "POSITION" | "NAME" | "NAME_AND_POSITION"
type ChangeStatus = "DRAFT" | "APPLIED" | "CANCELLED"
type ChangeTypeFilter = "all" | "NAME" | "POSITION" | "NAME_AND_POSITION"

type ChangeRow = {
  id: number
  type: ChangeType
  status: ChangeStatus
  audience?: string | null
  effectiveDate: string

  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
  personalNumber?: string | null

  oldTitleBefore?: string | null
  newTitleBefore?: string | null
  oldName?: string | null
  newName?: string | null
  oldSurname?: string | null
  newSurname?: string | null
  oldTitleAfter?: string | null
  newTitleAfter?: string | null

  oldDepartment?: string | null
  newDepartment?: string | null
  oldUnitName?: string | null
  newUnitName?: string | null
  oldPositionName?: string | null
  newPositionName?: string | null
  oldPositionNum?: string | null
  newPositionNum?: string | null

  notes?: string | null
  emailSentAt?: string | null
  appliedAt?: string | null
  targets?: Array<{ id: number; targetType: string; targetId: number }>

  onboardingMatchesCount?: number
  offboardingMatchesCount?: number
  linkCandidateCount?: number
}

type RawPosition = {
  id?: unknown
  num?: unknown
  name?: unknown
  dept_name?: unknown
  unit_name?: unknown
}

function normalizePositions(payload: unknown): Position[] {
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []

  const raw = arr.filter(
    (value): value is RawPosition =>
      value != null && typeof value === "object" && "num" in value
  )

  return raw.map((value) => ({
    id: String((value.id as string | number | undefined) ?? value.num),
    num: String(value.num as string | number),
    name: typeof value.name === "string" ? value.name : "",
    dept_name: typeof value.dept_name === "string" ? value.dept_name : "",
    unit_name: typeof value.unit_name === "string" ? value.unit_name : "",
    supervisorName: "",
    supervisorEmail: "",
  }))
}

function normalizeRows(payload: unknown): ChangeRow[] {
  if (Array.isArray(payload)) return payload as ChangeRow[]

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: ChangeRow[] }).data
  }

  return []
}

function formatDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? "–"
    : format(date, "d.M.yyyy", { locale: cs })
}

function formatMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00`)

  return Number.isNaN(date.getTime())
    ? month
    : format(date, "LLLL yyyy", { locale: cs })
}

function fullName(row: ChangeRow) {
  return [row.titleBefore, row.name, row.surname, row.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function typeLabel(type: ChangeType) {
  if (type === "NAME") return "Změna jména"
  if (type === "POSITION") return "Změna pozice"

  return "Změna jména i pozice"
}

function changed(a?: string | null, b?: string | null) {
  return (a ?? null) !== (b ?? null)
}

function val(value?: string | null) {
  return value?.trim() ? value : "–"
}

function groupByYearAndMonth(rows: ChangeRow[]) {
  const grouped: Record<string, Record<string, ChangeRow[]>> = {}

  for (const row of rows) {
    const year = row.effectiveDate?.slice(0, 4) || "bez-roku"
    const month = row.effectiveDate?.slice(0, 7) || "bez-data"

    grouped[year] ??= {}
    grouped[year][month] ??= []
    grouped[year][month].push(row)
  }

  return grouped
}

function getLatestYearAndMonth(rows: ChangeRow[]) {
  if (!rows.length) return null

  const latest = [...rows].sort(
    (a, b) =>
      new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
  )[0]

  if (!latest?.effectiveDate) return null

  return {
    year: latest.effectiveDate.slice(0, 4),
    month: latest.effectiveDate.slice(0, 7),
  }
}

function isLinked(row: ChangeRow) {
  return row.status === "APPLIED" || Boolean(row.targets?.length)
}

function linkCandidateCount(row: ChangeRow) {
  return row.linkCandidateCount ?? 0
}

function canShowLinkButton(row: ChangeRow) {
  return row.status === "DRAFT" && !isLinked(row) && linkCandidateCount(row) > 0
}

function ResponsiveTableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
      <div className="min-w-[1480px]">{children}</div>
    </div>
  )
}

export default function EmployeeChangesPage() {
  const [rows, setRows] = useState<ChangeRow[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPositions, setLoadingPositions] = useState(false)

  const [openNew, setOpenNew] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [editRow, setEditRow] = useState<ChangeRow | null>(null)

  const [typeFilter, setTypeFilter] = useState<ChangeTypeFilter>("all")
  const [query, setQuery] = useState("")
  const [monthFilter, setMonthFilter] = useState("")

  const [expandedYears, setExpandedYears] = useState<string[]>([])
  const [expandedMonths, setExpandedMonths] = useState<string[]>([])

  const [successModal, setSuccessModal] = useState({
    open: false,
    title: "",
    message: "",
  })
  const [errorModal, setErrorModal] = useState({
    open: false,
    title: "",
    message: "",
  })

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    row: ChangeRow | null
    loading: boolean
  }>({ open: false, row: null, loading: false })

  const [linkDialog, setLinkDialog] = useState<{
    open: boolean
    row: ChangeRow | null
    loading: boolean
    linking: boolean
    matches: Array<{
      id: number
      name: string
      surname: string
      positionName?: string | null
      department?: string | null
      date?: string | null
      kind: "onboarding" | "offboarding"
    }>
  }>({ open: false, row: null, loading: false, linking: false, matches: [] })

  const showSuccess = React.useCallback((title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }, [])

  const showError = React.useCallback((title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }, [])

  const reload = React.useCallback(async () => {
    setLoading(true)

    try {
      const res = await fetch("/api/zmeny", { cache: "no-store" })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Nepodařilo se načíst změny.")
      }

      setRows(normalizeRows(json))
    } catch (err) {
      showError(
        "Chyba při načítání",
        err instanceof Error ? err.message : "Nepodařilo se načíst změny."
      )
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showError])

  const loadPositions = React.useCallback(async () => {
    if (positions.length > 0) return

    setLoadingPositions(true)

    try {
      const res = await fetch("/api/systemizace", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      setPositions(normalizePositions(json))
    } catch {
      showError("Chyba", "Nepodařilo se načíst pozice.")
    } finally {
      setLoadingPositions(false)
    }
  }, [positions.length, showError])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const latest = getLatestYearAndMonth(rows)

    setExpandedYears(latest?.year ? [latest.year] : [])
    setExpandedMonths(latest?.month ? [latest.month] : [])
  }, [rows])

  const counts = useMemo(
    () => ({
      all: rows.filter((row) => row.status !== "CANCELLED").length,
      name: rows.filter(
        (row) => row.status !== "CANCELLED" && row.type === "NAME"
      ).length,
      position: rows.filter(
        (row) => row.status !== "CANCELLED" && row.type === "POSITION"
      ).length,
      both: rows.filter(
        (row) => row.status !== "CANCELLED" && row.type === "NAME_AND_POSITION"
      ).length,
    }),
    [rows]
  )

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return rows.filter((row) => {
      if (row.status === "CANCELLED") return false
      if (typeFilter !== "all" && row.type !== typeFilter) return false

      if (monthFilter && row.effectiveDate?.slice(0, 7) !== monthFilter) {
        return false
      }

      if (!needle) return true

      return [
        fullName(row),
        row.personalNumber,
        row.oldTitleBefore,
        row.newTitleBefore,
        row.oldName,
        row.newName,
        row.oldSurname,
        row.newSurname,
        row.oldTitleAfter,
        row.newTitleAfter,
        row.oldDepartment,
        row.newDepartment,
        row.oldUnitName,
        row.newUnitName,
        row.oldPositionName,
        row.newPositionName,
        row.oldPositionNum,
        row.newPositionNum,
        row.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [monthFilter, query, rows, typeFilter])

  const grouped = useMemo(
    () => groupByYearAndMonth(filteredRows),
    [filteredRows]
  )

  function toggleYear(year: string) {
    setExpandedYears((prev) =>
      prev.includes(year)
        ? prev.filter((item) => item !== year)
        : [...prev, year]
    )
  }

  function toggleMonth(month: string) {
    setExpandedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((item) => item !== month)
        : [...prev, month]
    )
  }

  function openEditDialog(row: ChangeRow) {
    setEditRow(row)
    setOpenEdit(true)

    if (positions.length === 0) void loadPositions()
  }

  async function openLinkDialog(row: ChangeRow) {
    setLinkDialog({
      open: true,
      row,
      loading: true,
      linking: false,
      matches: [],
    })

    try {
      const res = await fetch(`/api/zmeny/${row.id}/dopad`, {
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || json?.status !== "success") {
        setLinkDialog((prev) => ({ ...prev, loading: false, matches: [] }))
        return
      }

      const data = json.data as {
        onboardingMatches: Array<{
          id: number
          name: string
          surname: string
          positionName?: string
          department?: string
          actualStart?: string
          plannedStart?: string
        }>
        offboardingMatches: Array<{
          id: number
          name: string
          surname: string
          positionName?: string
          department?: string
          actualEnd?: string
          plannedEnd?: string
        }>
      }

      const matches = [
        ...data.onboardingMatches.map((match) => ({
          ...match,
          date: match.actualStart ?? match.plannedStart ?? null,
          kind: "onboarding" as const,
        })),
        ...data.offboardingMatches.map((match) => ({
          ...match,
          date: match.actualEnd ?? match.plannedEnd ?? null,
          kind: "offboarding" as const,
        })),
      ]

      setLinkDialog((prev) => ({ ...prev, loading: false, matches }))
    } catch {
      setLinkDialog((prev) => ({ ...prev, loading: false, matches: [] }))
    }
  }

  async function handleLink() {
    const row = linkDialog.row
    if (!row) return

    setLinkDialog((prev) => ({ ...prev, linking: true }))

    try {
      const res = await fetch(`/api/zmeny/${row.id}/aplikovat`, {
        method: "POST",
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Propojení se nezdařilo.")
      }

      setLinkDialog({
        open: false,
        row: null,
        loading: false,
        linking: false,
        matches: [],
      })

      showSuccess("Změna propojena", "Změna byla propojena se záznamy.")
      await reload()
    } catch (err) {
      showError(
        "Chyba při propojování",
        err instanceof Error ? err.message : "Propojení se nezdařilo."
      )
      setLinkDialog((prev) => ({ ...prev, linking: false }))
    }
  }

  async function handleDelete() {
    const row = deleteDialog.row
    if (!row) return

    setDeleteDialog((prev) => ({ ...prev, loading: true }))

    try {
      const res = await fetch(`/api/zmeny/${row.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Smazání se nezdařilo.")
      }

      setDeleteDialog({ open: false, row: null, loading: false })
      showSuccess("Změna smazána", "Záznam byl přesunut mezi smazané.")
      await reload()
    } catch (err) {
      showError(
        "Chyba při mazání",
        err instanceof Error ? err.message : "Smazání se nezdařilo."
      )
      setDeleteDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  const ChangeTableRow = ({ row }: { row: ChangeRow }) => {
    const linked = isLinked(row)
    const canLink = canShowLinkButton(row)

    const nameChange = row.type === "NAME" || row.type === "NAME_AND_POSITION"
    const posChange =
      row.type === "POSITION" || row.type === "NAME_AND_POSITION"

    return (
      <TableRow>
        <TableCell className="w-[220px] min-w-[220px]">
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate py-0.5 text-sm font-medium leading-normal">
                {fullName(row)}
              </div>
              {row.personalNumber && (
                <div className="font-mono text-xs text-muted-foreground">
                  #{row.personalNumber}
                </div>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell className="w-[165px] min-w-[165px]">
          <Badge variant="outline" className="text-xs">
            {typeLabel(row.type)}
          </Badge>
        </TableCell>

        <TableCell className="w-[120px] min-w-[120px] whitespace-nowrap text-sm">
          {formatDate(row.effectiveDate)}
        </TableCell>

        <TableCell className="w-[330px] min-w-[330px]">
          {nameChange ? (
            <div className="space-y-1 text-xs">
              {changed(row.oldTitleBefore, row.newTitleBefore) && (
                <div>
                  <span className="text-muted-foreground">Titul před: </span>
                  <span className="line-through">
                    {val(row.oldTitleBefore)}
                  </span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newTitleBefore)}
                  </span>
                </div>
              )}

              {changed(row.oldName, row.newName) && (
                <div>
                  <span className="text-muted-foreground">Jméno: </span>
                  <span className="line-through">{val(row.oldName)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newName)}
                  </span>
                </div>
              )}

              {changed(row.oldSurname, row.newSurname) && (
                <div>
                  <span className="text-muted-foreground">Příjmení: </span>
                  <span className="line-through">{val(row.oldSurname)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newSurname)}
                  </span>
                </div>
              )}

              {changed(row.oldTitleAfter, row.newTitleAfter) && (
                <div>
                  <span className="text-muted-foreground">Titul za: </span>
                  <span className="line-through">{val(row.oldTitleAfter)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newTitleAfter)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[420px] min-w-[420px]">
          {posChange ? (
            <div className="space-y-1 text-xs">
              {changed(row.oldPositionName, row.newPositionName) && (
                <div>
                  <span className="text-muted-foreground">Pozice: </span>
                  <span className="line-through">
                    {val(row.oldPositionName)}
                  </span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newPositionName)}
                  </span>
                </div>
              )}

              {changed(row.oldDepartment, row.newDepartment) && (
                <div>
                  <span className="text-muted-foreground">Odbor: </span>
                  <span className="line-through">{val(row.oldDepartment)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newDepartment)}
                  </span>
                </div>
              )}

              {changed(row.oldUnitName, row.newUnitName) && (
                <div>
                  <span className="text-muted-foreground">Oddělení: </span>
                  <span className="line-through">{val(row.oldUnitName)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {val(row.newUnitName)}
                  </span>
                </div>
              )}

              {changed(row.oldPositionNum, row.newPositionNum) && (
                <div>
                  <span className="text-muted-foreground">Č. funkce: </span>
                  <span className="font-mono line-through">
                    {val(row.oldPositionNum)}
                  </span>
                  <span className="mx-1">→</span>
                  <span className="font-mono font-medium text-green-700 dark:text-green-400">
                    {val(row.newPositionNum)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[210px] min-w-[210px]">
          {linked ? (
            <div className="space-y-1">
              <Badge variant="default" className="text-xs">
                Propojeno
              </Badge>
              {row.appliedAt && (
                <div className="text-[10px] text-muted-foreground">
                  {formatDate(row.appliedAt)}
                </div>
              )}
            </div>
          ) : canLink ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                <AlertTriangle className="size-2.5 shrink-0" />
                <span>Nalezen související nástup/odchod</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Změna je aktivní i bez propojení.
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[130px] min-w-[130px]">
          {row.emailSentAt ? (
            <div className="flex items-center gap-1 text-xs text-green-700">
              <CheckCircle className="size-3" />
              {formatDate(row.emailSentAt)}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[270px] min-w-[270px] whitespace-nowrap text-right">
          <div className="flex justify-end gap-1">
            <HistoryDialog
              id={row.id}
              kind="employee-change"
              trigger={
                <Button size="sm" variant="outline" title="Historie změn">
                  <HistoryIcon className="size-4" />
                </Button>
              }
            />

            {canLink && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void openLinkDialog(row)}
                title="Propojit se záznamy"
                className="text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                <Link2 className="size-4" />
                <span className="ml-1 hidden sm:inline">Propojit</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => openEditDialog(row)}
              title="Upravit záznam"
            >
              <Edit className="size-4" />
              <span className="ml-1 hidden sm:inline">Upravit</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDeleteDialog({ open: true, row, loading: false })
              }
              title="Smazat záznam"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden px-3 pb-8 sm:px-4 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">
          Zaměstnanecké změny
        </h1>
        <p className="text-muted-foreground">
          Správa změn jména, titulů, pozic a odborů
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
        <span className="mr-1 text-sm font-medium text-muted-foreground">
          Typ změny:
        </span>
        {(
          [
            ["NAME", "Změna jména", counts.name],
            ["POSITION", "Změny pozice", counts.position],
            ["NAME_AND_POSITION", "Změny jména i pozice", counts.both],
            ["all", "Veškeré změny", counts.all],
          ] as [ChangeTypeFilter, string, number][]
        ).map(([value, label, count]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={typeFilter === value ? "default" : "outline"}
            onClick={() => setTypeFilter(value)}
            className={
              typeFilter === value
                ? "bg-[#00847C] text-white hover:bg-[#0B6D73]"
                : ""
            }
          >
            {label}
            <Badge
              variant={typeFilter === value ? "secondary" : "outline"}
              className="ml-2"
            >
              {count}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Hledat podle jména, osobního čísla, odboru, pozice…"
              className="pl-9"
            />
          </div>

          <Input
            type="month"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="w-auto"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Dialog
            modal={false}
            open={openNew}
            onOpenChange={(open) => {
              setOpenNew(open)
              if (open && positions.length === 0) void loadPositions()
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-[#00847C] text-white hover:bg-[#0B6D73]">
                Přidat novou změnu
              </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
              <DialogTitle className="px-6 pt-6">
                Přidat novou změnu
              </DialogTitle>

              <div className="p-6">
                {loadingPositions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                    <span className="ml-2 text-muted-foreground">
                      Načítám pozice...
                    </span>
                  </div>
                ) : (
                  <EmployeeChangeForm
                    positions={positions}
                    mode="create"
                    onSuccess={async () => {
                      setOpenNew(false)
                      await reload()
                    }}
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>

          <DeletedRecordsDialog
            kind="employee-change"
            title="Smazané změny"
            triggerLabel="Smazané záznamy"
            successEvent="employee-change:deleted"
            onRestore={() => void reload()}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
            <span className="ml-2 text-muted-foreground">Načítám změny...</span>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarDays className="mb-4 size-12 text-muted-foreground" />
              <p className="text-lg font-medium text-muted-foreground">
                Žádné změny k zobrazení
              </p>
              <p className="text-sm text-muted-foreground">
                Přidejte první záznam pomocí tlačítka výše
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="min-w-0 space-y-5 pb-2">
            {Object.keys(grouped)
              .sort((a, b) => b.localeCompare(a))
              .map((year) => {
                const yearData = grouped[year]
                const yearCount = Object.values(yearData).reduce(
                  (sum, monthRows) => sum + monthRows.length,
                  0
                )
                const isYearExpanded = expandedYears.includes(year)

                return (
                  <Collapsible key={year} open={isYearExpanded}>
                    <CollapsibleTrigger
                      onClick={() => toggleYear(year)}
                      className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-slate-100 p-3 transition-colors hover:bg-slate-200 dark:bg-slate-900/40 dark:hover:bg-slate-900/60"
                    >
                      {isYearExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      <CalendarDays className="size-4 text-slate-700 dark:text-slate-300" />
                      <span className="text-lg font-semibold">{year}</span>
                      <Badge variant="outline" className="ml-auto">
                        {yearCount}
                      </Badge>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-3 space-y-4">
                      {Object.keys(yearData)
                        .sort((a, b) => b.localeCompare(a))
                        .map((month) => {
                          const monthData = yearData[month]
                          const isMonthExpanded = expandedMonths.includes(month)

                          return (
                            <Collapsible key={month} open={isMonthExpanded}>
                              <CollapsibleTrigger
                                onClick={() => toggleMonth(month)}
                                className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-violet-50 p-2 transition-colors hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/30"
                              >
                                {isMonthExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                                <CalendarDays className="size-4 text-violet-600" />
                                <span className="font-medium">
                                  {formatMonth(month)}
                                </span>
                                <Badge variant="outline" className="ml-auto">
                                  {monthData.length}
                                </Badge>
                              </CollapsibleTrigger>

                              <CollapsibleContent className="mt-2">
                                <Card className="max-w-full">
                                  <CardContent className="p-0">
                                    <ResponsiveTableShell>
                                      <Table
                                        disableWrapperScroll
                                        className="w-full"
                                      >
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Zaměstnanec
                                            </TableHead>
                                            <TableHead className="w-[165px] min-w-[165px]">
                                              Typ
                                            </TableHead>
                                            <TableHead className="w-[120px] min-w-[120px]">
                                              Účinnost
                                            </TableHead>
                                            <TableHead className="w-[330px] min-w-[330px]">
                                              Změna jména
                                            </TableHead>
                                            <TableHead className="w-[420px] min-w-[420px]">
                                              Změna pozice
                                            </TableHead>
                                            <TableHead className="w-[210px] min-w-[210px]">
                                              Vazba
                                            </TableHead>
                                            <TableHead className="w-[130px] min-w-[130px]">
                                              Report
                                            </TableHead>
                                            <TableHead className="w-[270px] min-w-[270px] text-right">
                                              Akce
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                          {monthData.map((row) => (
                                            <ChangeTableRow
                                              key={row.id}
                                              row={row}
                                            />
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </ResponsiveTableShell>
                                  </CardContent>
                                </Card>
                              </CollapsibleContent>
                            </Collapsible>
                          )
                        })}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
          </div>
        )}
        <div className="flex justify-end pt-4">
          <div className="flex items-center gap-2">
            <EmployeeChangeReportLauncher />
          </div>
        </div>
      </div>

      <Dialog
        modal={false}
        open={openEdit}
        onOpenChange={(open) => {
          setOpenEdit(open)
          if (!open) setEditRow(null)
          if (open && positions.length === 0) void loadPositions()
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogTitle className="px-6 pt-6">Upravit změnu</DialogTitle>
          <div className="p-6">
            {loadingPositions ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                <span className="ml-2 text-muted-foreground">
                  Načítám pozice...
                </span>
              </div>
            ) : editRow ? (
              <EmployeeChangeForm
                key={`edit-${editRow.id}`}
                positions={positions}
                id={editRow.id}
                mode="edit"
                initial={editRow as unknown as Record<string, unknown>}
                onSuccess={async () => {
                  setOpenEdit(false)
                  setEditRow(null)
                  showSuccess("Změny uloženy", "Záznam byl úspěšně upraven.")
                  await reload()
                }}
              />
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Načítám data pro editaci...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={linkDialog.open}
        onOpenChange={(open) => setLinkDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
                <Link2 className="size-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <DialogTitle>Propojit změnu se záznamy</DialogTitle>
                <DialogDescription>
                  {linkDialog.row && (
                    <>
                      {fullName(linkDialog.row)}
                      {linkDialog.row.personalNumber && (
                        <span className="ml-2 font-mono text-xs">
                          #{linkDialog.row.personalNumber}
                        </span>
                      )}
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {linkDialog.loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">
                Hledám záznamy…
              </span>
            </div>
          ) : linkDialog.matches.length === 0 ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Nebyl nalezen žádný nástup ani odchod pro toto osobní číslo.
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nalezeny tyto záznamy. Propojením se aktualizují data
                zaměstnance v nástupech nebo odchodech.
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">
                {linkDialog.matches.map((match) => (
                  <div
                    key={`${match.kind}-${match.id}`}
                    className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-sm"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {match.kind === "onboarding" ? "Nástup" : "Odchod"}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-medium">
                        {match.name} {match.surname}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          match.positionName,
                          match.department,
                          match.date ? formatDate(match.date) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setLinkDialog({
                  open: false,
                  row: null,
                  loading: false,
                  linking: false,
                  matches: [],
                })
              }
              disabled={linkDialog.linking}
            >
              Zavřít
            </Button>
            <Button
              onClick={() => void handleLink()}
              disabled={
                linkDialog.linking ||
                linkDialog.loading ||
                linkDialog.matches.length === 0
              }
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
            >
              {linkDialog.linking ? (
                <>
                  <span className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Propojuji…
                </>
              ) : (
                <>
                  <Link2 className="mr-2 size-4" />
                  Propojit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <DialogTitle>Smazat změnu?</DialogTitle>
                {deleteDialog.row && (
                  <DialogDescription className="font-medium">
                    {fullName(deleteDialog.row)}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Záznam bude přesunut mezi smazané. Lze obnovit přes &#34;Smazané
            záznamy&#34;.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialog({ open: false, row: null, loading: false })
              }
              disabled={deleteDialog.loading}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteDialog.loading}
              className="flex items-center gap-2"
            >
              {deleteDialog.loading && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Smazat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={successModal.open}
        onOpenChange={(open) => setSuccessModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center gap-4">
            <CheckCircle className="size-12 text-green-500" />
            <div className="space-y-2">
              <DialogTitle className="text-lg font-semibold">
                {successModal.title}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {successModal.message}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                setSuccessModal((prev) => ({ ...prev, open: false }))
              }
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center gap-4">
            <XCircle className="size-12 text-red-500" />
            <div className="space-y-2">
              <DialogTitle className="text-lg font-semibold">
                {errorModal.title}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {errorModal.message}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() =>
                setErrorModal((prev) => ({ ...prev, open: false }))
              }
            >
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
