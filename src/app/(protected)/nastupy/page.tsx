"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns"
import { cs } from "date-fns/locale"
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit,
  History as HistoryIcon,
  Info,
  Mail,
  RotateCcw,
  Trash2,
  User,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react"

import { type Position } from "@/types/position"

import { useIsReadonly } from "@/hooks/use-current-role"
import { useDismissableHighlight } from "@/hooks/use-dismissable-highlight"
import { useFacetedFilter } from "@/hooks/use-faceted-filter"
import { useTextFilter } from "@/hooks/use-text-filter"
import {
  EMPTY_DAY_RANGE,
  formatDayCountCs,
  formatHumanDurationBetween,
  getDateProgressBucket,
  getDaysRemaining,
  isDayRangeActive,
  matchesDayRange,
  type DayRangeValue,
} from "@/lib/dates"
import {
  buildDistinctOptions,
  buildOptionsWithEmpty,
  FILTER_EMPTY_VALUE,
  filterAvailableOptions,
} from "@/lib/filter-options"

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
import { ProbationProgressBar } from "@/components/ui/probation-progress-bar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ActiveFilterChips } from "@/components/common/active-filter-chips"
import { EmployeeDocumentsDialog } from "@/components/common/employee-documents-dialog"
import { LinkedRecordInfoButton } from "@/components/common/linked-record-info-button"
import { ListPageSkeleton } from "@/components/common/list-page-skeleton"
import { MonthFilter } from "@/components/common/month-filter"
import {
  MultiSelectFilter,
  type MultiSelectOption,
} from "@/components/common/multi-select-filter"
import { RangeFacetFilter } from "@/components/common/range-facet-filter"
import { SearchInput } from "@/components/common/search-input"
import { MonthlyReportLauncher } from "@/components/emails/monthly-report-launcher"
import type {
  FormValues,
  PersonalNumberMeta,
  ProbationExtension,
} from "@/components/forms/onboarding-form"
import { OnboardingFormClient } from "@/components/forms/onboarding-form-client"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

type LinkedOffboardingInfo = {
  id: number
  plannedEnd: string | null
  actualEnd: string | null
  exitDate: string | null
  isActualExit: boolean
  leftDuringProbation: boolean
  probationStopDecision?: "STOP" | "KEEP" | null
  probationShouldBeStopped: boolean
  rowMuted: boolean
  label: string
  description: string
}

type Arrival = {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  email: string
  department: string
  unitName: string
  positionName: string
  positionNum?: string | null
  plannedStart: string
  actualStart?: string | null
  startTime?: string | null
  probationEnd?: string | null
  hasCustomDates?: boolean | null
  probationExtensions?: ProbationExtension[] | null
  probationExtensionSummary?: string | null

  userEmail?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"

  supervisorName?: string | null
  supervisorEmail?: string | null
  supervisorPosition?: string | null
  supervisorDepartment?: string | null
  supervisorUnitName?: string | null
  mentorName?: string | null
  mentorEmail?: string | null

  probationEvaluationSentAt?: string | null
  probationEvaluationSentBy?: string | null

  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null

  linkedOffboarding?: LinkedOffboardingInfo | null
}

const managerialKeywords = ["vedení", "ředitel", "vedoucí", "tajemník"]

const stripAccents = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

function isManagerialPosition(positionName?: string | null) {
  if (!positionName) return false

  const normalized = stripAccents(positionName)

  return managerialKeywords.some((keyword) =>
    normalized.includes(stripAccents(keyword))
  )
}

type ArrivalFacetKey =
  | "status"
  | "department"
  | "unitName"
  | "position"
  | "positionType"
  | "supervisor"
  | "mentor"

const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: "planned", label: "Plánované" },
  { value: "actual", label: "Skutečné" },
  { value: "cancelled", label: "Neuskutečněné" },
  { value: "all", label: "Vše" },
]

const POSITION_TYPE_OPTIONS: MultiSelectOption[] = [
  { value: "MANAGERIAL", label: "Vedoucí pozice" },
  { value: "REGULAR", label: "Řadová pozice" },
]

const PROBATION_PROGRESS_OPTIONS: MultiSelectOption[] = [
  { value: "ACTIVE", label: "Aktivní / běžící" },
  { value: "STOPPED", label: "Pozastaveno (odchod během zkušební)" },
  { value: "TODAY", label: "Dnes (0 dní)" },
  { value: "WITHIN_7", label: "Do 7 dnů" },
  { value: "WITHIN_30", label: "Do 30 dnů" },
  { value: "WITHIN_60", label: "Do 2 měsíců" },
  { value: "WITHIN_120", label: "Do 4 měsíců" },
  { value: "LATER", label: "Více než 4 měsíce" },
  { value: "ENDED", label: "Ukončeno (100 %)" },
]

function arrivalStatus(arrival: Arrival): "planned" | "actual" | "cancelled" {
  if (arrival.cancelledAt) return "cancelled"
  if (arrival.actualStart) return "actual"

  return "planned"
}

function arrivalProbationTags(arrival: Arrival): string[] {
  if (arrivalStatus(arrival) === "cancelled") return []
  if (arrival.linkedOffboarding?.probationShouldBeStopped) return ["STOPPED"]

  const bucket = getDateProgressBucket(arrival.probationEnd)
  if (!bucket) return []

  if (bucket === "OVERDUE") return ["ENDED"]

  return [bucket, "ACTIVE"]
}

function formatIsoDate(date: Date) {
  return format(date, "yyyy-MM-dd")
}

function isWeekday(date: Date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}

function addWeekdaysAfterDate(baseDate: Date, days: number) {
  const result = new Date(baseDate)
  let remaining = Math.max(0, days)

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)

    if (isWeekday(result)) {
      remaining -= 1
    }
  }

  return result
}

function sumProbationExtensionDays(extensions?: ProbationExtension[] | null) {
  return (extensions ?? []).reduce(
    (sum, extension) => sum + (extension.days || 0),
    0
  )
}

function computeBaseProbationEnd(
  start?: string | null,
  positionName?: string | null
) {
  if (!start) return null

  const date = new Date(`${start}T00:00:00`)

  if (Number.isNaN(date.getTime())) return null

  const months = isManagerialPosition(positionName) ? 8 : 4

  return formatIsoDate(addMonths(date, months))
}

function computeProbationEndForStart(arrival: Arrival, start: string) {
  const extensions = arrival.probationExtensions ?? []

  if (extensions.length > 0) {
    const base = computeBaseProbationEnd(start, arrival.positionName)
    if (!base) return arrival.probationEnd?.slice(0, 10) ?? null

    const baseDate = new Date(`${base}T00:00:00`)
    const extensionDays = sumProbationExtensionDays(extensions)

    return formatIsoDate(addWeekdaysAfterDate(baseDate, extensionDays))
  }

  if (arrival.hasCustomDates) {
    return arrival.probationEnd?.slice(0, 10) ?? null
  }

  return computeBaseProbationEnd(start, arrival.positionName)
}

type EmployeeChangeInfo = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION"
  status?: "DRAFT" | "APPLIED" | "CANCELLED" | string | null
  effectiveDate?: string | null
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
}

function normalizeEmployeeChanges(payload: unknown): EmployeeChangeInfo[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : []

  return rows.filter(
    (row): row is EmployeeChangeInfo =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as { id?: unknown }).id === "number"
  )
}

function groupChangesByPersonalNumber(rows: EmployeeChangeInfo[]) {
  const map = new Map<string, EmployeeChangeInfo[]>()

  for (const row of rows) {
    const personalNumber = row.personalNumber?.trim()
    if (!personalNumber || row.status === "CANCELLED") continue

    const current = map.get(personalNumber) ?? []
    current.push(row)
    map.set(personalNumber, current)
  }

  return map
}

function changeTypeLabel(type?: EmployeeChangeInfo["type"] | null) {
  if (type === "NAME") return "Změna jména"
  if (type === "POSITION") return "Změna pozice"
  if (type === "NAME_AND_POSITION") return "Změna jména i pozice"

  return "Zaměstnanecká změna"
}

function buildOldFullNameFromChange(change: EmployeeChangeInfo) {
  return [
    change.oldTitleBefore,
    change.oldName,
    change.oldSurname,
    change.oldTitleAfter,
  ]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ")
}

function buildNewFullNameFromChange(change: EmployeeChangeInfo) {
  const pick = (oldValue?: string | null, newValue?: string | null) =>
    (newValue?.trim() || oldValue?.trim() || "").trim()

  return [
    pick(change.oldTitleBefore, change.newTitleBefore),
    pick(change.oldName, change.newName),
    pick(change.oldSurname, change.newSurname),
    pick(change.oldTitleAfter, change.newTitleAfter),
  ]
    .filter(Boolean)
    .join(" ")
}

function buildOldPositionLine(change: EmployeeChangeInfo) {
  return [change.oldPositionName, change.oldDepartment, change.oldUnitName]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" · ")
}

function buildNewPositionLine(change: EmployeeChangeInfo) {
  const pick = (oldValue?: string | null, newValue?: string | null) =>
    (newValue?.trim() || oldValue?.trim() || "").trim()

  return [
    pick(change.oldPositionName, change.newPositionName),
    pick(change.oldDepartment, change.newDepartment),
    pick(change.oldUnitName, change.newUnitName),
  ]
    .filter(Boolean)
    .join(" · ")
}

function formatOptionalDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? "–" : format(date, "d.M.yyyy")
}

function formatProbationRemaining(
  probationEnd?: string | null,
  frozenAt?: string | null
): { text: string; isPast: boolean } | null {
  if (!probationEnd) return null

  const end = new Date(`${probationEnd.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null

  if (
    frozenAt &&
    end.getTime() > new Date(`${frozenAt.slice(0, 10)}T00:00:00`).getTime()
  ) {
    return {
      text: `zastaveno k ${format(new Date(`${frozenAt.slice(0, 10)}T00:00:00`), "d.M.yyyy")}`,
      isPast: true,
    }
  }

  const today = new Date()
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )

  if (end.getTime() > todayOnly.getTime()) {
    return {
      text: `zbývá ${formatHumanDurationBetween(todayOnly, end)}`,
      isPast: false,
    }
  }

  const elapsedDays = differenceInCalendarDays(todayOnly, end)

  return elapsedDays === 0
    ? { text: "končí dnes", isPast: false }
    : { text: `${formatDayCountCs(elapsedDays)} po konci`, isPast: true }
}

function EmployeeChangeInfoButton({
  changes,
  employeeName,
}: {
  changes: EmployeeChangeInfo[]
  employeeName: string
}) {
  const router = useRouter()

  if (changes.length === 0) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          title="Zobrazit související zaměstnanecké změny"
          className="inline-flex items-center justify-center gap-1 whitespace-nowrap border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
        >
          <Info className="size-4" />
          <span className="hidden sm:inline">Propojené změny</span>
          <span className="sr-only sm:hidden">Propojené změny</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
              <Info className="size-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle>Propojené změny</DialogTitle>
              <DialogDescription>
                {employeeName} · pouze informační náhled, údaje v nástupech ani
                odchodech se tím nepřepisují.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {changes.map((change) => {
            const showName =
              change.type === "NAME" || change.type === "NAME_AND_POSITION"
            const showPosition =
              change.type === "POSITION" || change.type === "NAME_AND_POSITION"

            return (
              <div
                key={change.id}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {changeTypeLabel(change.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Účinnost: {formatOptionalDate(change.effectiveDate)}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/zmeny?highlight=${change.id}`)}
                  >
                    Otevřít změnu
                  </Button>
                </div>

                {showName && (
                  <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-background px-3 py-2">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Původní jméno
                      </div>
                      <div className="break-words text-sm text-muted-foreground">
                        {buildOldFullNameFromChange(change) || "–"}
                      </div>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Nové jméno
                      </div>
                      <div className="break-words text-sm font-semibold text-amber-900 dark:text-amber-100">
                        {buildNewFullNameFromChange(change) || "–"}
                      </div>
                    </div>
                  </div>
                )}

                {showPosition && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-background px-3 py-2">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Původní pozice
                      </div>
                      <div className="break-words text-sm text-muted-foreground">
                        {buildOldPositionLine(change) || "–"}
                      </div>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30">
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Nová pozice
                      </div>
                      <div className="break-words text-sm font-semibold text-amber-900 dark:text-amber-100">
                        {buildNewPositionLine(change) || "–"}
                      </div>
                    </div>
                  </div>
                )}

                {change.notes?.trim() ? (
                  <div className="mt-2 rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                    Poznámka: {change.notes}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function arrivalToInitial(d: Arrival): Partial<FormValues> {
  return {
    titleBefore: d.titleBefore ?? "",
    name: d.name ?? "",
    surname: d.surname ?? "",
    titleAfter: d.titleAfter ?? "",
    email: d.email ?? "",
    positionNum: d.positionNum ?? "",
    positionName: d.positionName ?? "",
    department: d.department ?? "",
    unitName: d.unitName ?? "",
    plannedStart: d.plannedStart ? d.plannedStart.slice(0, 10) : "",
    actualStart: d.actualStart ? d.actualStart.slice(0, 10) : "",
    startTime: d.startTime ?? "",
    probationEnd: d.probationEnd ? d.probationEnd.slice(0, 10) : "",
    hasCustomDates: d.hasCustomDates ?? undefined,
    probationExtensions: d.probationExtensions ?? undefined,
    userEmail: d.userEmail ?? "",
    userName: d.userName ?? "",
    personalNumber: d.personalNumber ?? "",
    notes: d.notes ?? "",
    status: d.status,

    supervisorName: d.supervisorName ?? "",
    supervisorEmail: d.supervisorEmail ?? "",
    supervisorPosition: d.supervisorPosition ?? "",
    supervisorDepartment: d.supervisorDepartment ?? "",
    supervisorUnitName: d.supervisorUnitName ?? "",
    mentorName: d.mentorName ?? "",
    mentorEmail: d.mentorEmail ?? "",
  }
}

type GroupedData = {
  [year: string]: {
    [month: string]: Arrival[]
  }
}

interface SuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
  icon?: React.ReactNode
}

const SuccessModal: React.FC<SuccessModalProps> = ({
  open,
  onOpenChange,
  title,
  message,
  icon,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <div className="flex items-center gap-4">
        {icon || <CheckCircle className="size-12 text-green-500" />}
        <div className="space-y-2">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onOpenChange(false)}>OK</Button>
      </div>
    </DialogContent>
  </Dialog>
)

interface ErrorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  open,
  onOpenChange,
  title,
  message,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <div className="flex items-center gap-4">
        <XCircle className="size-12 text-red-500" />
        <div className="space-y-2">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Zavřít
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)

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
    (v): v is RawPosition => v != null && typeof v === "object" && "num" in v
  )

  const mapped: Position[] = raw.map((v) => {
    const num = String(v.num as string | number)
    return {
      id: num,
      num,
      name: typeof v.name === "string" ? v.name : "",
      dept_name: typeof v.dept_name === "string" ? v.dept_name : "",
      unit_name: typeof v.unit_name === "string" ? v.unit_name : "",
      supervisorName:
        typeof (v as Record<string, unknown>).supervisorName === "string"
          ? ((v as Record<string, unknown>).supervisorName as string)
          : typeof (v as Record<string, unknown>).supervisor_name === "string"
            ? ((v as Record<string, unknown>).supervisor_name as string)
            : "",
      supervisorEmail:
        typeof (v as Record<string, unknown>).supervisorEmail === "string"
          ? ((v as Record<string, unknown>).supervisorEmail as string)
          : typeof (v as Record<string, unknown>).supervisor_email === "string"
            ? ((v as Record<string, unknown>).supervisor_email as string)
            : "",
    }
  })

  const score = (p: Position) =>
    (p.name ? 1 : 0) + (p.dept_name ? 1 : 0) + (p.unit_name ? 1 : 0)

  const byNum = new Map<string, Position>()
  for (const p of mapped) {
    const existing = byNum.get(p.num)
    if (!existing) byNum.set(p.num, p)
    else byNum.set(p.num, score(p) > score(existing) ? p : existing)
  }

  const deduped = Array.from(byNum.values())

  if (process.env.NODE_ENV !== "production") {
    const dupCount = mapped.length - deduped.length
    if (dupCount > 0) {
      console.warn(
        `[systemizace] Deduplikováno ${dupCount} pozic. Backend vrací duplicity.`
      )
    }
  }

  return deduped
}

const groupByYearAndMonth = (
  data: Arrival[],
  dateField: "plannedStart" | "actualStart"
): GroupedData => {
  const grouped: GroupedData = {}

  data.forEach((item) => {
    const dateStr = item[dateField] || item.plannedStart
    if (!dateStr) return

    const date = new Date(dateStr)
    const year = String(date.getFullYear())
    const month = format(date, "yyyy-MM")

    if (!grouped[year]) grouped[year] = {}
    if (!grouped[year][month]) grouped[year][month] = []
    grouped[year][month].push(item)
  })

  return grouped
}

function getLatestYearAndMonth(
  data: Arrival[],
  dateField: "plannedStart" | "actualStart"
): { year?: string; month?: string } {
  if (!data.length) return {}

  const sorted = [...data].sort((a, b) => {
    const aDate = new Date((a[dateField] || a.plannedStart) ?? "").getTime()
    const bDate = new Date((b[dateField] || b.plannedStart) ?? "").getTime()
    return bDate - aDate
  })

  const latest = sorted[0]
  const dateStr = (latest[dateField] || latest.plannedStart) ?? ""
  if (!dateStr) return {}

  return { year: dateStr.slice(0, 4), month: dateStr.slice(0, 7) }
}

function getAllYearsAndMonths(grouped: GroupedData): {
  years: string[]
  months: string[]
} {
  const years = Object.keys(grouped)
  const months = years.flatMap((year) => Object.keys(grouped[year]))

  return { years, months }
}

function ResponsiveTableShell({
  children,
  minWidth = "min-w-[1200px] lg:min-w-[1800px]",
}: {
  children: React.ReactNode
  minWidth?: string
}) {
  return (
    <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
      <div className={`w-full ${minWidth}`}>{children}</div>
    </div>
  )
}

export default function OnboardingPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const isReadonly = useIsReadonly()

  const [planned, setPlanned] = useState<Arrival[]>([])
  const [actual, setActual] = useState<Arrival[]>([])
  const [cancelled, setCancelled] = useState<Arrival[]>([])
  const [employeeChanges, setEmployeeChanges] = useState<EmployeeChangeInfo[]>(
    []
  )
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [loadingPositions, setLoadingPositions] = useState(false)

  const [openNewPlanned, setOpenNewPlanned] = useState(false)
  const [openNewActual, setOpenNewActual] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [editData, setEditData] = useState<{
    id: number
    initial: Partial<FormValues>
    context: "planned" | "actual"
  } | null>(null)

  const [openStart, setOpenStart] = useState(false)
  const [activeRow, setActiveRow] = useState<Arrival | null>(null)
  const [actualStartInput, setActualStartInput] = useState<string>("")

  const [revertDialog, setRevertDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    loading: boolean
  }>({ open: false, arrival: null, loading: false })

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    relatedChanges: EmployeeChangeInfo[]
    loading: boolean
  }>({ open: false, arrival: null, relatedChanges: [], loading: false })

  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    loading: boolean
    reason: string
  }>({ open: false, arrival: null, loading: false, reason: "" })

  const [restoreCancelledDialog, setRestoreCancelledDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    loading: boolean
    targetType: "planned" | "actual" | null
  }>({ open: false, arrival: null, loading: false, targetType: null })

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

  const [expandedPlannedYears, setExpandedPlannedYears] = useState<string[]>([])
  const [expandedPlannedMonths, setExpandedPlannedMonths] = useState<string[]>(
    []
  )
  const [expandedActualYears, setExpandedActualYears] = useState<string[]>([])
  const [expandedActualMonths, setExpandedActualMonths] = useState<string[]>([])
  const [expandedCancelledYears, setExpandedCancelledYears] = useState<
    string[]
  >([])
  const [expandedCancelledMonths, setExpandedCancelledMonths] = useState<
    string[]
  >([])

  const [personalMeta, setPersonalMeta] = useState<
    PersonalNumberMeta | undefined
  >()

  const qpMode = sp.get("new") as "create-planned" | "create-actual" | null
  const qpDate = sp.get("date") || undefined
  const qpHighlightId = sp.get("highlight")
  const qpHighlightStatus = sp.get("status") as
    | "planned"
    | "actual"
    | "cancelled"
    | null

  const currentMonth = format(new Date(), "yyyy-MM")

  const [arrivalDateFilter, setArrivalDateFilter] = useState("")
  const [probationPresets, setProbationPresets] = useState<string[]>([])
  const [probationDayRange, setProbationDayRange] =
    useState<DayRangeValue>(EMPTY_DAY_RANGE)

  const [highlightedArrivalId, setHighlightedArrivalId] = useState<
    number | null
  >(null)
  const [highlightedArrivalVariant, setHighlightedArrivalVariant] = useState<
    "planned" | "actual" | "cancelled" | null
  >(null)

  const employeeChangesByPersonalNumber = useMemo(
    () => groupChangesByPersonalNumber(employeeChanges),
    [employeeChanges]
  )

  const showSuccess = React.useCallback((title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }, [])

  const showError = React.useCallback((title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }, [])

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const [onbRes, metaRes, changesRes] = await Promise.all([
        fetch("/api/nastupy", { cache: "no-store" }),
        fetch("/api/osobni-cislo/meta", { cache: "no-store" }),
        fetch("/api/zmeny", { cache: "no-store" }),
      ])

      const onbJson = await onbRes.json().catch(() => null)
      const metaJson = await metaRes.json().catch(() => null)
      const changesJson = await changesRes.json().catch(() => null)

      if (onbJson?.status === "success" && Array.isArray(onbJson.data)) {
        const rows = onbJson.data as Arrival[]
        setPlanned(rows.filter((e) => !e.actualStart && !e.cancelledAt))
        setActual(rows.filter((e) => e.actualStart && !e.cancelledAt))
        setCancelled(rows.filter((e) => e.cancelledAt))
      } else {
        setPlanned([])
        setActual([])
        setCancelled([])
      }

      if (metaJson?.status === "success") {
        setPersonalMeta(metaJson.data as PersonalNumberMeta)
      } else {
        setPersonalMeta(undefined)
      }

      if (changesRes.ok) {
        setEmployeeChanges(normalizeEmployeeChanges(changesJson))
      } else {
        setEmployeeChanges([])
      }
    } catch (error) {
      console.error("Error loading data:", error)
      showError("Chyba při načítání", "Nepodařilo se načíst data")
      setPlanned([])
      setActual([])
      setCancelled([])
      setEmployeeChanges([])
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [showError])

  const loadPositions = React.useCallback(async () => {
    if (positions.length > 0) return

    setLoadingPositions(true)
    try {
      const res = await fetch("/api/systemizace", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      setPositions(normalizePositions(json))
    } catch (error) {
      console.error("Error loading positions:", error)
      showError("Chyba", "Nepodařilo se načíst pozice")
    } finally {
      setLoadingPositions(false)
    }
  }, [positions.length, showError])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!qpMode) return
    if (qpMode === "create-actual") setOpenNewActual(true)
    else setOpenNewPlanned(true)
  }, [qpMode])

  useEffect(() => {
    const handler = () => void reload()
    window.addEventListener("onboarding:deleted", handler)
    return () => window.removeEventListener("onboarding:deleted", handler)
  }, [reload])

  const getArrivalSearchableText = React.useCallback(
    (arrival: Arrival) => [
      arrival.name,
      arrival.surname,
      arrival.titleBefore,
      arrival.titleAfter,
      arrival.personalNumber,
      arrival.positionName,
      arrival.positionNum,
      arrival.department,
      arrival.unitName,
      arrival.email,
    ],
    []
  )

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    filterRows,
  } = useTextFilter(getArrivalSearchableText)

  const allArrivals = useMemo(
    () => [...planned, ...actual, ...cancelled],
    [planned, actual, cancelled]
  )

  const dateFilteredArrivals = useMemo(() => {
    const hasProbationFilter =
      probationPresets.length > 0 || isDayRangeActive(probationDayRange)

    if (!arrivalDateFilter && !hasProbationFilter) return allArrivals

    return allArrivals.filter((arrival) => {
      const variant = arrivalStatus(arrival)
      const relevantDate =
        variant === "actual" ? arrival.actualStart : arrival.plannedStart

      if (
        arrivalDateFilter &&
        relevantDate?.slice(0, 7) !== arrivalDateFilter
      ) {
        return false
      }

      if (hasProbationFilter) {
        const tags = arrivalProbationTags(arrival)
        const presetMatch =
          probationPresets.length > 0 &&
          probationPresets.some((preset) => tags.includes(preset))
        const rangeMatch =
          isDayRangeActive(probationDayRange) &&
          matchesDayRange(
            getDaysRemaining(arrival.probationEnd),
            probationDayRange
          )

        if (!presetMatch && !rangeMatch) return false
      }

      return true
    })
  }, [allArrivals, arrivalDateFilter, probationPresets, probationDayRange])

  const searchedArrivals = useMemo(
    () => filterRows(dateFilteredArrivals),
    [dateFilteredArrivals, filterRows]
  )

  const arrivalFacets = useMemo(
    () => ({
      // "all" rides along on every row so selecting it (or leaving nothing
      // selected) never restricts by status — see useFacetedFilter's rules.
      status: (arrival: Arrival) => [arrivalStatus(arrival), "all"],
      department: (arrival: Arrival) => [arrival.department],
      unitName: (arrival: Arrival) => [arrival.unitName],
      position: (arrival: Arrival) => [arrival.positionName],
      positionType: (arrival: Arrival) => [
        isManagerialPosition(arrival.positionName) ? "MANAGERIAL" : "REGULAR",
      ],
      supervisor: (arrival: Arrival) => [
        arrival.supervisorName?.trim() || FILTER_EMPTY_VALUE,
      ],
      mentor: (arrival: Arrival) => [
        arrival.mentorName?.trim() || FILTER_EMPTY_VALUE,
      ],
    }),
    []
  )

  const {
    filters: facetFilters,
    setFacetValues: setFacetFilter,
    clearAll: clearAllFacetFilters,
    filteredRows: facetedArrivals,
    availableValues,
  } = useFacetedFilter<Arrival, ArrivalFacetKey>(
    searchedArrivals,
    arrivalFacets
  )

  const handleStatusFilterChange = React.useCallback(
    (nextValues: string[]) => {
      const prevSet = new Set(facetFilters.status)
      const addedValue = nextValues.find((value) => !prevSet.has(value))

      if (addedValue === "all") {
        setFacetFilter("status", ["all"])
        return
      }

      setFacetFilter(
        "status",
        nextValues.filter((value) => value !== "all")
      )
    },
    [facetFilters.status, setFacetFilter]
  )

  const filteredPlanned = useMemo(
    () => facetedArrivals.filter((a) => arrivalStatus(a) === "planned"),
    [facetedArrivals]
  )

  const filteredActual = useMemo(
    () => facetedArrivals.filter((a) => arrivalStatus(a) === "actual"),
    [facetedArrivals]
  )

  const filteredCancelled = useMemo(
    () => facetedArrivals.filter((a) => arrivalStatus(a) === "cancelled"),
    [facetedArrivals]
  )

  const isAnyNonStatusFilterActive =
    searchQuery.trim() !== "" ||
    arrivalDateFilter !== "" ||
    probationPresets.length > 0 ||
    isDayRangeActive(probationDayRange) ||
    facetFilters.department.length > 0 ||
    facetFilters.unitName.length > 0 ||
    facetFilters.position.length > 0 ||
    facetFilters.positionType.length > 0 ||
    facetFilters.supervisor.length > 0 ||
    facetFilters.mentor.length > 0

  const isAnyFilterActive =
    isAnyNonStatusFilterActive || facetFilters.status.length > 0

  // With no explicit status chosen, an active filter still narrows which
  // tab(s) actually contain matches — so the page can jump straight there
  // (or show them combined) instead of silently sitting on an empty tab.
  const displayStatuses = useMemo(() => {
    if (facetFilters.status.length > 0) {
      return facetFilters.status.includes("all")
        ? (["planned", "actual", "cancelled"] as const)
        : (facetFilters.status as Array<"planned" | "actual" | "cancelled">)
    }

    if (!isAnyNonStatusFilterActive) return []

    const nonEmpty: Array<"planned" | "actual" | "cancelled"> = []
    if (filteredPlanned.length > 0) nonEmpty.push("planned")
    if (filteredActual.length > 0) nonEmpty.push("actual")
    if (filteredCancelled.length > 0) nonEmpty.push("cancelled")

    return nonEmpty
  }, [
    facetFilters.status,
    isAnyNonStatusFilterActive,
    filteredPlanned,
    filteredActual,
    filteredCancelled,
  ])

  const isCombinedStatusMode = displayStatuses.length >= 2

  const [activeTab, setActiveTab] = useState<
    "planned" | "actual" | "cancelled"
  >("planned")

  useEffect(() => {
    if (displayStatuses.length === 1) {
      setActiveTab(displayStatuses[0])
    }
  }, [displayStatuses])

  const departmentOptionsAll = useMemo(
    () => buildDistinctOptions(allArrivals.map((a) => a.department)),
    [allArrivals]
  )
  const departmentOptions = useMemo(
    () =>
      filterAvailableOptions(departmentOptionsAll, availableValues.department),
    [departmentOptionsAll, availableValues.department]
  )

  const unitOptionsAll = useMemo(
    () => buildDistinctOptions(allArrivals.map((a) => a.unitName)),
    [allArrivals]
  )
  const unitOptions = useMemo(
    () => filterAvailableOptions(unitOptionsAll, availableValues.unitName),
    [unitOptionsAll, availableValues.unitName]
  )

  const positionOptionsAll = useMemo(
    () => buildDistinctOptions(allArrivals.map((a) => a.positionName)),
    [allArrivals]
  )
  const positionOptions = useMemo(
    () => filterAvailableOptions(positionOptionsAll, availableValues.position),
    [positionOptionsAll, availableValues.position]
  )

  const positionTypeOptions = useMemo(
    () =>
      filterAvailableOptions(
        POSITION_TYPE_OPTIONS,
        availableValues.positionType
      ),
    [availableValues.positionType]
  )

  const supervisorOptionsAll = useMemo(
    () =>
      buildOptionsWithEmpty(
        allArrivals.map((a) => a.supervisorName),
        "Bez vedoucího"
      ),
    [allArrivals]
  )
  const supervisorOptions = useMemo(
    () =>
      filterAvailableOptions(supervisorOptionsAll, availableValues.supervisor),
    [supervisorOptionsAll, availableValues.supervisor]
  )

  const mentorOptionsAll = useMemo(
    () =>
      buildOptionsWithEmpty(
        allArrivals.map((a) => a.mentorName),
        "Bez mentora"
      ),
    [allArrivals]
  )
  const mentorOptions = useMemo(
    () => filterAvailableOptions(mentorOptionsAll, availableValues.mentor),
    [mentorOptionsAll, availableValues.mentor]
  )

  const statusOptions = useMemo(
    () => filterAvailableOptions(STATUS_OPTIONS, availableValues.status),
    [availableValues.status]
  )

  const plannedGrouped = useMemo(
    () => groupByYearAndMonth(filteredPlanned, "plannedStart"),
    [filteredPlanned]
  )
  const actualGrouped = useMemo(
    () => groupByYearAndMonth(filteredActual, "actualStart"),
    [filteredActual]
  )
  const cancelledGrouped = useMemo(
    () => groupByYearAndMonth(filteredCancelled, "plannedStart"),
    [filteredCancelled]
  )

  useEffect(() => {
    if (isAnyFilterActive) {
      const { years, months } = getAllYearsAndMonths(plannedGrouped)
      setExpandedPlannedYears(years)
      setExpandedPlannedMonths(months)
      return
    }

    const { year, month } = getLatestYearAndMonth(
      filteredPlanned,
      "plannedStart"
    )
    setExpandedPlannedYears(year ? [year] : [])
    setExpandedPlannedMonths(month ? [month] : [])
  }, [filteredPlanned, plannedGrouped, isAnyFilterActive])

  useEffect(() => {
    if (isAnyFilterActive) {
      const { years, months } = getAllYearsAndMonths(actualGrouped)
      setExpandedActualYears(years)
      setExpandedActualMonths(months)
      return
    }

    const { year, month } = getLatestYearAndMonth(filteredActual, "actualStart")
    setExpandedActualYears(year ? [year] : [])
    setExpandedActualMonths(month ? [month] : [])
  }, [filteredActual, actualGrouped, isAnyFilterActive])

  useEffect(() => {
    if (isAnyFilterActive) {
      const { years, months } = getAllYearsAndMonths(cancelledGrouped)
      setExpandedCancelledYears(years)
      setExpandedCancelledMonths(months)
      return
    }

    const { year, month } = getLatestYearAndMonth(
      filteredCancelled,
      "plannedStart"
    )
    setExpandedCancelledYears(year ? [year] : [])
    setExpandedCancelledMonths(month ? [month] : [])
  }, [filteredCancelled, cancelledGrouped, isAnyFilterActive])

  const appliedHighlightRef = React.useRef<string | null>(null)
  const previousHighlightIdRef = React.useRef<string | null>(null)

  useEffect(() => {
    const previous = previousHighlightIdRef.current
    previousHighlightIdRef.current = qpHighlightId

    if (!previous || qpHighlightId) return

    if (!isAnyFilterActive) {
      if (highlightedArrivalVariant === "planned") {
        const { year, month } = getLatestYearAndMonth(planned, "plannedStart")
        setExpandedPlannedYears(year ? [year] : [])
        setExpandedPlannedMonths(month ? [month] : [])
      } else if (highlightedArrivalVariant === "actual") {
        const { year, month } = getLatestYearAndMonth(actual, "actualStart")
        setExpandedActualYears(year ? [year] : [])
        setExpandedActualMonths(month ? [month] : [])
      } else if (highlightedArrivalVariant === "cancelled") {
        const { year, month } = getLatestYearAndMonth(cancelled, "plannedStart")
        setExpandedCancelledYears(year ? [year] : [])
        setExpandedCancelledMonths(month ? [month] : [])
      }
    }

    appliedHighlightRef.current = null
    setHighlightedArrivalId(null)
    setHighlightedArrivalVariant(null)
  }, [
    qpHighlightId,
    isAnyFilterActive,
    highlightedArrivalVariant,
    planned,
    actual,
    cancelled,
  ])

  useEffect(() => {
    if (!qpHighlightId) return

    const hasLocalFilters =
      searchQuery.trim() !== "" ||
      arrivalDateFilter !== "" ||
      probationPresets.length > 0 ||
      isDayRangeActive(probationDayRange) ||
      facetFilters.department.length > 0 ||
      facetFilters.unitName.length > 0 ||
      facetFilters.position.length > 0 ||
      facetFilters.positionType.length > 0 ||
      facetFilters.supervisor.length > 0 ||
      facetFilters.mentor.length > 0 ||
      facetFilters.status.length > 0

    if (hasLocalFilters) {
      router.replace("/nastupy")
    }
  }, [
    qpHighlightId,
    searchQuery,
    arrivalDateFilter,
    probationPresets,
    probationDayRange,
    facetFilters,
    router,
  ])

  const expandVariant = React.useCallback(
    (variant: "planned" | "actual" | "cancelled") => {
      if (variant === "planned") {
        const { years, months } = getAllYearsAndMonths(
          groupByYearAndMonth(planned, "plannedStart")
        )
        setExpandedPlannedYears(years)
        setExpandedPlannedMonths(months)
      } else if (variant === "actual") {
        const { years, months } = getAllYearsAndMonths(
          groupByYearAndMonth(actual, "actualStart")
        )
        setExpandedActualYears(years)
        setExpandedActualMonths(months)
      } else {
        const { years, months } = getAllYearsAndMonths(
          groupByYearAndMonth(cancelled, "plannedStart")
        )
        setExpandedCancelledYears(years)
        setExpandedCancelledMonths(months)
      }
    },
    [planned, actual, cancelled]
  )

  useEffect(() => {
    if (!qpHighlightId) return
    if (appliedHighlightRef.current === qpHighlightId) return

    const id = Number(qpHighlightId)
    const arrival = allArrivals.find((a) => a.id === id)
    if (!arrival) return

    appliedHighlightRef.current = qpHighlightId

    setSearchQuery("")
    clearAllFacetFilters()
    setArrivalDateFilter("")
    setProbationPresets([])
    setProbationDayRange(EMPTY_DAY_RANGE)

    const variant = qpHighlightStatus ?? arrivalStatus(arrival)
    setActiveTab(variant)
    expandVariant(variant)

    setHighlightedArrivalVariant(variant)
    setHighlightedArrivalId(id)
  }, [
    qpHighlightId,
    qpHighlightStatus,
    allArrivals,
    expandVariant,
    clearAllFacetFilters,
    setSearchQuery,
  ])

  useEffect(() => {
    if (!highlightedArrivalId) return

    let cancelled = false
    let attempts = 0
    const targetId = `arrival-row-${highlightedArrivalId}`

    const tryScroll = () => {
      if (cancelled) return

      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      if (highlightedArrivalVariant) {
        setActiveTab(highlightedArrivalVariant)
        expandVariant(highlightedArrivalVariant)
      }

      attempts += 1
      if (attempts < 40) {
        setTimeout(() => requestAnimationFrame(tryScroll), 50)
      }
    }

    const initial = setTimeout(() => requestAnimationFrame(tryScroll), 50)

    return () => {
      cancelled = true
      clearTimeout(initial)
    }
  }, [
    highlightedArrivalId,
    isCombinedStatusMode,
    activeTab,
    highlightedArrivalVariant,
    expandVariant,
  ])

  const clearArrivalRing = React.useCallback(
    () => setHighlightedArrivalId(null),
    []
  )
  useDismissableHighlight(highlightedArrivalId, clearArrivalRing)

  const togglePlannedYear = (year: string) => {
    setExpandedPlannedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    )
  }
  const togglePlannedMonth = (month: string) => {
    setExpandedPlannedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    )
  }

  const toggleActualYear = (year: string) => {
    setExpandedActualYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    )
  }
  const toggleActualMonth = (month: string) => {
    setExpandedActualMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    )
  }

  const toggleCancelledYear = (year: string) => {
    setExpandedCancelledYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    )
  }
  const toggleCancelledMonth = (month: string) => {
    setExpandedCancelledMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    )
  }

  async function openStartDialogFromPlanned(row: Arrival) {
    setActiveRow(row)
    setActualStartInput(row.plannedStart.slice(0, 10))
    setOpenStart(true)
  }

  async function confirmStartWithInput() {
    if (!activeRow || !actualStartInput) return

    try {
      const extensions = activeRow.probationExtensions ?? []
      const hasExtensionCalculation = extensions.length > 0

      const nextProbationEnd = computeProbationEndForStart(
        activeRow,
        actualStartInput
      )

      const payload: {
        actualStart: string
        status: "COMPLETED"
        probationEnd?: string
        hasCustomDates: boolean
        probationExtensions: ProbationExtension[]
        probationExtensionSummary?: string | null
      } = {
        actualStart: actualStartInput,
        status: "COMPLETED",
        hasCustomDates: Boolean(
          activeRow.hasCustomDates || hasExtensionCalculation
        ),
        probationExtensions: extensions,
        probationExtensionSummary: hasExtensionCalculation
          ? (activeRow.probationExtensionSummary ?? null)
          : null,
      }

      if (nextProbationEnd) {
        payload.probationEnd = nextProbationEnd
      }

      const res = await fetch(`/api/nastupy/${activeRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Potvrzení se nezdařilo")
      }

      const name = `${activeRow.name} ${activeRow.surname}`

      setOpenStart(false)
      setActiveRow(null)
      setActualStartInput("")

      showSuccess(
        "Nástup potvrzen",
        `Skutečný nástup pro ${name} byl zaznamenán.`
      )

      await reload()
    } catch (error) {
      showError(
        "Chyba při potvrzování",
        error instanceof Error ? error.message : "Potvrzení se nezdařilo"
      )
    }
  }

  async function handleRevert() {
    const arrival = revertDialog.arrival
    if (!arrival) return

    setRevertDialog((prev) => ({ ...prev, loading: true }))

    try {
      const response = await fetch(`/api/nastupy/${arrival.id}/revert`, {
        method: "POST",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message ?? "Vrácení se nezdařilo")
      }

      setRevertDialog({ open: false, arrival: null, loading: false })
      showSuccess(
        "Nástup vrácen",
        `Záznam "${arrival.name} ${arrival.surname}" byl vrácen do plánovaných.`
      )
      await reload()
    } catch (error) {
      console.error("Error reverting arrival:", error)
      showError(
        "Chyba při vracení",
        error instanceof Error ? error.message : "Vrácení se nezdařilo"
      )
      setRevertDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  async function handleCancel() {
    const arrival = cancelDialog.arrival
    const reason = cancelDialog.reason.trim()

    if (!arrival) return
    if (!reason) {
      showError("Chybějící údaj", "Vyplňte prosím důvod zrušení.")
      return
    }

    setCancelDialog((prev) => ({ ...prev, loading: true }))

    try {
      const response = await fetch(`/api/nastupy/${arrival.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message ?? "Zrušení se nezdařilo")
      }

      setCancelDialog({
        open: false,
        arrival: null,
        loading: false,
        reason: "",
      })
      showSuccess(
        "Nástup zrušen",
        `Záznam "${arrival.name} ${arrival.surname}" byl přesunut do neuskutečněných.`
      )
      await reload()
    } catch (error) {
      console.error("Error cancelling arrival:", error)
      showError(
        "Chyba při rušení",
        error instanceof Error ? error.message : "Zrušení se nezdařilo"
      )
      setCancelDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  async function handleRestoreCancelled() {
    const arrival = restoreCancelledDialog.arrival

    if (!arrival) return

    setRestoreCancelledDialog((prev) => ({ ...prev, loading: true }))

    try {
      const response = await fetch(
        `/api/nastupy/${arrival.id}/restore-cancelled`,
        {
          method: "POST",
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message ?? "Obnovení se nezdařilo")
      }

      setRestoreCancelledDialog({
        open: false,
        arrival: null,
        loading: false,
        targetType: null,
      })

      const wasActual = Boolean(arrival.actualStart)
      showSuccess(
        "Nástup obnoven",
        `Záznam "${arrival.name} ${arrival.surname}" byl obnoven do ${wasActual ? "skutečných" : "plánovaných"}.`
      )
      await reload()
    } catch (error) {
      console.error("Error restoring cancelled arrival:", error)
      showError(
        "Chyba při obnovování",
        error instanceof Error ? error.message : "Obnovení se nezdařilo"
      )
      setRestoreCancelledDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  async function handleEdit(arrival: Arrival, context: "planned" | "actual") {
    try {
      const response = await fetch(`/api/nastupy/${arrival.id}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Nepodařilo se načíst data záznamu")

      const json = await response.json()
      const currentData = json?.data as Arrival
      if (!currentData) throw new Error("Nepodařilo se načíst data záznamu")

      setEditData({
        id: arrival.id,
        initial: arrivalToInitial(currentData),
        context,
      })
      setOpenEdit(true)
    } catch (error) {
      console.error("Error loading edit data:", error)
      showError("Chyba při načítání", "Nepodařilo se načíst data pro editaci")
    }
  }

  async function handleDelete() {
    const arrival = deleteDialog.arrival
    if (!arrival) return

    setDeleteDialog((prev) => ({ ...prev, loading: true }))

    try {
      const response = await fetch(`/api/nastupy/${arrival.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message ?? "Smazání se nezdařilo")
      }

      setDeleteDialog({
        open: false,
        arrival: null,
        relatedChanges: [],
        loading: false,
      })
      showSuccess(
        "Záznam smazán",
        `Záznam "${arrival.name} ${arrival.surname}" byl úspěšně smazán`
      )

      window.dispatchEvent(new CustomEvent("onboarding:deleted"))
      await reload()
    } catch (error) {
      console.error("Error deleting arrival:", error)
      showError(
        "Chyba při mazání",
        error instanceof Error ? error.message : "Smazání se nezdařilo"
      )
      setDeleteDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  const ArrivalTableRow = ({
    arrival,
    variant,
  }: {
    arrival: Arrival
    variant: "planned" | "actual" | "cancelled"
  }) => {
    const startLabelDate =
      variant === "planned"
        ? arrival.plannedStart
        : arrival.actualStart || arrival.plannedStart

    const showStartTime =
      Boolean(arrival.startTime) && arrival.startTime!.trim() !== ""

    const hasProbation =
      Boolean(arrival.probationEnd) &&
      Boolean(variant === "actual" ? startLabelDate : arrival.plannedStart)

    const fullName = [
      arrival.titleBefore,
      arrival.name,
      arrival.surname,
      arrival.titleAfter,
    ]
      .filter(Boolean)
      .join(" ")

    const relatedChanges = arrival.personalNumber?.trim()
      ? (employeeChangesByPersonalNumber.get(arrival.personalNumber.trim()) ??
        [])
      : []

    const isHighlighted = arrival.id === highlightedArrivalId

    if (variant === "cancelled") {
      return (
        <TableRow
          id={`arrival-row-${arrival.id}`}
          className={
            isHighlighted
              ? "bg-amber-50 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/30"
              : undefined
          }
        >
          <TableCell className="w-[220px] min-w-[220px]">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate py-0.5 text-sm font-medium leading-normal">
                  {fullName}
                </div>
                {arrival.personalNumber && (
                  <div className="font-mono text-xs text-muted-foreground">
                    #{arrival.personalNumber}
                  </div>
                )}
              </div>
            </div>
          </TableCell>

          <TableCell className="w-[220px] min-w-[220px]">
            <div className="flex flex-col">
              <span className="truncate text-sm font-medium">
                {arrival.positionName}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {arrival.positionNum}
              </span>
            </div>
          </TableCell>

          <TableCell className="w-[220px] min-w-[220px]">
            <div className="flex flex-col">
              <span className="truncate text-sm font-medium">
                {arrival.department}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {arrival.unitName}
              </span>
            </div>
          </TableCell>

          <TableCell className="w-[200px] min-w-[200px]">
            <span className="text-sm italic text-muted-foreground">
              {arrival.cancelReason || "–"}
            </span>
          </TableCell>

          <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap">
            {arrival.cancelledAt && (
              <div className="flex flex-col">
                <span className="text-sm">
                  {format(new Date(arrival.cancelledAt), "d.M.yyyy")}
                </span>
                {arrival.cancelledBy && (
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={arrival.cancelledBy}
                  >
                    {arrival.cancelledBy}
                  </span>
                )}
              </div>
            )}
          </TableCell>

          <TableCell className="w-[220px] min-w-[220px] whitespace-nowrap">
            <div className="flex items-center gap-1">
              <Mail className="size-4 text-muted-foreground" />
              <span className="truncate text-sm">{arrival.email}</span>
            </div>
          </TableCell>

          <TableCell className="w-[280px] min-w-[280px] whitespace-nowrap text-right">
            <div className="flex justify-end gap-1">
              <EmployeeChangeInfoButton
                changes={relatedChanges}
                employeeName={fullName}
              />

              <LinkedRecordInfoButton
                employeeName={fullName}
                offboarding={arrival.linkedOffboarding}
                sourceCancelled
              />

              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  setRestoreCancelledDialog({
                    open: true,
                    arrival,
                    loading: false,
                    targetType: arrival.actualStart ? "actual" : "planned",
                  })
                }
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
              >
                <RotateCcw className="size-4" />
                <span className="hidden sm:inline">
                  Vrátit do {arrival.actualStart ? "skutečných" : "plánovaných"}
                </span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDeleteDialog({
                    open: true,
                    arrival,
                    relatedChanges,
                    loading: false,
                  })
                }
                className="inline-flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Smazat</span>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )
    }

    return (
      <TableRow
        id={`arrival-row-${arrival.id}`}
        className={
          isHighlighted
            ? "bg-amber-50 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/30"
            : undefined
        }
      >
        <TableCell className="w-[220px] min-w-[220px]">
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate py-0.5 text-sm font-medium leading-normal">
                {fullName}
              </div>
              {arrival.personalNumber && (
                <div className="font-mono text-xs text-muted-foreground">
                  #{arrival.personalNumber}
                </div>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell className="w-[220px] min-w-[220px]">
          <div className="flex flex-col">
            <span
              className="truncate text-sm font-medium"
              title={arrival.positionName}
            >
              {arrival.positionName}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {arrival.positionNum}
            </span>
          </div>
        </TableCell>

        <TableCell className="w-[220px] min-w-[220px]">
          <div className="flex flex-col">
            <span
              className="truncate text-sm font-medium"
              title={arrival.department}
            >
              {arrival.department}
            </span>
            <span
              className="truncate text-xs text-muted-foreground"
              title={arrival.unitName}
            >
              {arrival.unitName}
            </span>
          </div>
        </TableCell>

        <TableCell className="w-[180px] min-w-[180px]">
          {arrival.supervisorName ? (
            <div className="flex items-start gap-2">
              <UserCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <div
                  className="truncate py-0.5 text-sm font-medium leading-normal"
                  title={arrival.supervisorName}
                >
                  {arrival.supervisorName}
                </div>
                {arrival.supervisorEmail && (
                  <div
                    className="truncate text-xs text-muted-foreground"
                    title={arrival.supervisorEmail}
                  >
                    {arrival.supervisorEmail}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[180px] min-w-[180px]">
          {arrival.mentorName ? (
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 shrink-0 text-purple-600" />
              <div className="min-w-0">
                <div
                  className="truncate py-0.5 text-sm font-medium leading-normal"
                  title={arrival.mentorName}
                >
                  {arrival.mentorName}
                </div>
                {arrival.mentorEmail && (
                  <div
                    className="truncate text-xs text-muted-foreground"
                    title={arrival.mentorEmail}
                  >
                    {arrival.mentorEmail}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm">
                {format(new Date(startLabelDate), "d.M.yyyy")}
              </span>
              {showStartTime && (
                <span className="font-mono text-xs text-muted-foreground">
                  {arrival.startTime}
                </span>
              )}
            </div>
          </div>
        </TableCell>

        <TableCell className="w-[250px] min-w-[250px]">
          {hasProbation ? (
            <div className="space-y-1.5">
              <ProbationProgressBar
                startDate={
                  variant === "planned"
                    ? arrival.plannedStart
                    : (arrival.actualStart as string)
                }
                probationEndDate={arrival.probationEnd as string}
                variant={variant === "planned" ? "planned" : "actual"}
                size="sm"
                label=""
                frozenAt={
                  arrival.linkedOffboarding?.probationShouldBeStopped
                    ? arrival.linkedOffboarding.exitDate
                    : null
                }
              />
              <div className="space-y-0.5">
                <div className="text-[11px] font-medium text-foreground">
                  Konec {formatOptionalDate(arrival.probationEnd)}
                </div>
                {(() => {
                  const remaining = formatProbationRemaining(
                    arrival.probationEnd,
                    arrival.linkedOffboarding?.probationShouldBeStopped
                      ? arrival.linkedOffboarding.exitDate
                      : null
                  )
                  if (!remaining) return null

                  return (
                    <div
                      className={
                        remaining.isPast
                          ? "text-[11px] font-medium text-muted-foreground"
                          : "text-[11px] font-semibold text-[#00847C] dark:text-[#4fd1c5]"
                      }
                    >
                      {remaining.text}
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[220px] min-w-[220px] whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Mail className="size-4 text-muted-foreground" />
            <span className="truncate text-sm" title={arrival.email}>
              {arrival.email}
            </span>
          </div>
        </TableCell>

        <TableCell className="w-[300px] min-w-[300px] whitespace-nowrap text-right">
          <div className="flex justify-end gap-1">
            <EmployeeChangeInfoButton
              changes={relatedChanges}
              employeeName={fullName}
            />

            <LinkedRecordInfoButton
              employeeName={fullName}
              offboarding={arrival.linkedOffboarding}
            />

            <HistoryDialog
              id={arrival.id}
              kind="onboarding"
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  title="Historie změn"
                  className="inline-flex items-center justify-center gap-1"
                >
                  <HistoryIcon className="size-4" />
                  <span className="sr-only">Historie</span>
                </Button>
              }
            />

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEdit(arrival, variant)}
              title="Upravit záznam"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap"
            >
              <Edit className="size-4" />
              <span className="hidden sm:inline">Upravit</span>
            </Button>

            {variant === "planned" ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => openStartDialogFromPlanned(arrival)}
                title="Potvrdit skutečný nástup"
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
              >
                <Check className="size-4" />
                <span className="hidden sm:inline">Nastoupil</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setRevertDialog({
                    open: true,
                    arrival,
                    loading: false,
                  })
                }
                title="Vrátit zpět do plánovaných"
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950"
              >
                <RotateCcw className="size-4" />
                <span className="hidden sm:inline">Vrátit do plánovaných</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setCancelDialog({
                  open: true,
                  arrival,
                  loading: false,
                  reason: "",
                })
              }
              title="Zaměstnanec nenastoupil"
              className="inline-flex items-center justify-center gap-1 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950"
            >
              <XCircle className="size-4" />
              <span className="hidden sm:inline">Nenastoupil</span>
            </Button>

            <EmployeeDocumentsDialog
              onboardingId={arrival.id}
              email={arrival.email}
              employeeName={fullName}
              supervisorName={arrival.supervisorName}
              supervisorEmail={arrival.supervisorEmail}
              probationEvaluationSentAt={
                arrival.probationEvaluationSentAt ?? null
              }
              probationEvaluationSentBy={
                arrival.probationEvaluationSentBy ?? null
              }
              onSent={() => {
                showSuccess(
                  "E-mail odeslán",
                  "Odkazy na vybrané dokumenty byly odeslány zaměstnanci."
                )
                void reload()
              }}
              readOnly={isReadonly}
            />

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDeleteDialog({
                  open: true,
                  arrival,
                  relatedChanges,
                  loading: false,
                })
              }
              title="Smazat záznam"
              className="inline-flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Smazat</span>
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  const plannedSectionContent = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Dialog
          open={openNewPlanned}
          onOpenChange={(open) => {
            setOpenNewPlanned(open)
            if (open && positions.length === 0) {
              void loadPositions()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="inline-flex w-full items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] sm:w-auto">
              Přidat plánovaný nástup
            </Button>
          </DialogTrigger>

          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
            <DialogTitle className="px-6 pt-6">
              Nový plánovaný nástup
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
                <OnboardingFormClient
                  positions={positions}
                  mode="create-planned"
                  prefillDate={qpDate}
                  personalNumberMeta={personalMeta}
                  onSuccess={async () => {
                    setOpenNewPlanned(false)
                    showSuccess(
                      "Záznam vytvořen",
                      "Plánovaný nástup byl úspěšně přidán."
                    )
                    await reload()
                  }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        <DeletedRecordsDialog
          kind="onboarding"
          title="Smazané nástupy"
          triggerLabel="Smazané záznamy"
          successEvent="onboarding:deleted"
          onRestore={() => void reload()}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
            <span className="ml-2 text-muted-foreground">Načítám data...</span>
          </div>
        ) : Object.keys(plannedGrouped).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarDays className="mb-4 size-12 text-muted-foreground" />
              <p className="text-lg font-medium text-muted-foreground">
                Žádné plánované nástupy
              </p>
              <p className="text-sm text-muted-foreground">
                Přidejte první záznam pomocí tlačítka výše
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="min-w-0 space-y-4 pb-2">
            {Object.keys(plannedGrouped)
              .sort((a, b) => parseInt(b) - parseInt(a))
              .map((year) => {
                const yearData = plannedGrouped[year]
                const isYearExpanded = expandedPlannedYears.includes(year)
                const yearTotal = Object.values(yearData).reduce(
                  (sum, arr) => sum + arr.length,
                  0
                )
                const yearMonthKeys = Object.keys(yearData)
                const allMonthsExpanded = yearMonthKeys.every((month) =>
                  expandedPlannedMonths.includes(month)
                )

                return (
                  <Collapsible key={year} open={isYearExpanded}>
                    <div className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                      <CollapsibleTrigger
                        onClick={() => togglePlannedYear(year)}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        {isYearExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                        <span className="text-lg font-semibold">{year}</span>
                      </CollapsibleTrigger>

                      <Badge variant="secondary">{yearTotal}</Badge>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setExpandedPlannedMonths((prev) =>
                            allMonthsExpanded
                              ? prev.filter(
                                  (month) => !yearMonthKeys.includes(month)
                                )
                              : Array.from(new Set([...prev, ...yearMonthKeys]))
                          )

                          if (!allMonthsExpanded) {
                            setExpandedPlannedYears((prev) =>
                              prev.includes(year) ? prev : [...prev, year]
                            )
                          }
                        }}
                      >
                        {allMonthsExpanded ? "Sbalit vše" : "Zobrazit vše"}
                      </Button>
                    </div>

                    <CollapsibleContent className="mt-2 space-y-3">
                      {Object.keys(yearData)
                        .sort((a, b) => b.localeCompare(a))
                        .map((month) => {
                          const monthData = yearData[month]
                          const isMonthExpanded =
                            expandedPlannedMonths.includes(month)

                          return (
                            <Collapsible key={month} open={isMonthExpanded}>
                              <CollapsibleTrigger
                                onClick={() => togglePlannedMonth(month)}
                                className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-blue-50 p-2 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
                              >
                                {isMonthExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                                <CalendarDays className="size-4 text-blue-600" />
                                <span className="font-medium">
                                  {format(
                                    new Date(month + "-01"),
                                    "LLLL yyyy",
                                    {
                                      locale: cs,
                                    }
                                  )}
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
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Pozice
                                            </TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Odbor / Oddělení
                                            </TableHead>
                                            <TableHead className="w-[180px] min-w-[180px]">
                                              Vedoucí
                                            </TableHead>
                                            <TableHead className="w-[180px] min-w-[180px]">
                                              Mentor
                                            </TableHead>
                                            <TableHead className="w-[160px] min-w-[160px]">
                                              Plánovaný nástup
                                            </TableHead>
                                            <TableHead className="w-[250px] min-w-[250px]">
                                              Zkušební doba
                                            </TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Kontakt
                                            </TableHead>
                                            <TableHead className="w-[300px] min-w-[300px] text-right">
                                              Akce
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                          {monthData.map((e) => (
                                            <ArrivalTableRow
                                              key={e.id}
                                              arrival={e}
                                              variant="planned"
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
      </div>

      <div className="mt-2 flex justify-end">
        <MonthlyReportLauncher
          initialType="nastupy"
          kind="planned"
          defaultMonth={currentMonth}
        />
      </div>
    </>
  )

  const actualSectionContent = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Dialog
          open={openNewActual}
          onOpenChange={(open) => {
            setOpenNewActual(open)
            if (open && positions.length === 0) {
              void loadPositions()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="inline-flex w-full items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] sm:w-auto">
              Přidat skutečný nástup
            </Button>
          </DialogTrigger>

          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
            <DialogTitle className="px-6 pt-6">Skutečný nástup</DialogTitle>
            <div className="p-6">
              {loadingPositions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                  <span className="ml-2 text-muted-foreground">
                    Načítám pozice...
                  </span>
                </div>
              ) : (
                <OnboardingFormClient
                  positions={positions}
                  mode="create-actual"
                  prefillDate={qpDate}
                  personalNumberMeta={personalMeta}
                  onSuccess={async () => {
                    setOpenNewActual(false)
                    showSuccess(
                      "Záznam vytvořen",
                      "Skutečný nástup byl úspěšně přidán."
                    )
                    await reload()
                  }}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        <DeletedRecordsDialog
          kind="onboarding"
          title="Smazané nástupy"
          triggerLabel="Smazané záznamy"
          successEvent="onboarding:deleted"
          onRestore={() => void reload()}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
            <span className="ml-2 text-muted-foreground">Načítám data...</span>
          </div>
        ) : Object.keys(actualGrouped).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <User className="mb-4 size-12 text-muted-foreground" />
              <p className="text-lg font-medium text-muted-foreground">
                Žádné skutečné nástupy
              </p>
              <p className="text-sm text-muted-foreground">
                Přidejte první záznam pomocí tlačítka výše
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="min-w-0 space-y-4 pb-2">
            {Object.keys(actualGrouped)
              .sort((a, b) => parseInt(b) - parseInt(a))
              .map((year) => {
                const yearData = actualGrouped[year]
                const isYearExpanded = expandedActualYears.includes(year)
                const yearTotal = Object.values(yearData).reduce(
                  (sum, arr) => sum + arr.length,
                  0
                )
                const yearMonthKeys = Object.keys(yearData)
                const allMonthsExpanded = yearMonthKeys.every((month) =>
                  expandedActualMonths.includes(month)
                )

                return (
                  <Collapsible key={year} open={isYearExpanded}>
                    <div className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                      <CollapsibleTrigger
                        onClick={() => toggleActualYear(year)}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        {isYearExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                        <span className="text-lg font-semibold">{year}</span>
                      </CollapsibleTrigger>

                      <Badge variant="secondary">{yearTotal}</Badge>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setExpandedActualMonths((prev) =>
                            allMonthsExpanded
                              ? prev.filter(
                                  (month) => !yearMonthKeys.includes(month)
                                )
                              : Array.from(new Set([...prev, ...yearMonthKeys]))
                          )

                          if (!allMonthsExpanded) {
                            setExpandedActualYears((prev) =>
                              prev.includes(year) ? prev : [...prev, year]
                            )
                          }
                        }}
                      >
                        {allMonthsExpanded ? "Sbalit vše" : "Zobrazit vše"}
                      </Button>
                    </div>

                    <CollapsibleContent className="mt-2 space-y-3">
                      {Object.keys(yearData)
                        .sort((a, b) => b.localeCompare(a))
                        .map((month) => {
                          const monthData = yearData[month]
                          const isMonthExpanded =
                            expandedActualMonths.includes(month)

                          return (
                            <Collapsible key={month} open={isMonthExpanded}>
                              <CollapsibleTrigger
                                onClick={() => toggleActualMonth(month)}
                                className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-green-50 p-2 transition-colors hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30"
                              >
                                {isMonthExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                                <User className="size-4 text-green-600" />
                                <span className="font-medium">
                                  {format(
                                    new Date(month + "-01"),
                                    "LLLL yyyy",
                                    {
                                      locale: cs,
                                    }
                                  )}
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
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Pozice
                                            </TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Odbor / Oddělení
                                            </TableHead>
                                            <TableHead className="w-[180px] min-w-[180px]">
                                              Vedoucí
                                            </TableHead>
                                            <TableHead className="w-[180px] min-w-[180px]">
                                              Mentor
                                            </TableHead>
                                            <TableHead className="w-[160px] min-w-[160px]">
                                              Skutečný nástup
                                            </TableHead>
                                            <TableHead className="w-[250px] min-w-[250px]">
                                              Zkušební doba
                                            </TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Kontakt
                                            </TableHead>
                                            <TableHead className="w-[300px] min-w-[300px] text-right">
                                              Akce
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                          {monthData.map((e) => (
                                            <ArrivalTableRow
                                              key={e.id}
                                              arrival={e}
                                              variant="actual"
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
      </div>

      <div className="mt-2 flex justify-end">
        <MonthlyReportLauncher
          initialType="nastupy"
          kind="actual"
          defaultMonth={currentMonth}
        />
      </div>
    </>
  )

  const cancelledSectionContent = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
            <span className="ml-2 text-muted-foreground">Načítám data...</span>
          </div>
        ) : Object.keys(cancelledGrouped).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <XCircle className="mb-4 size-12 text-muted-foreground" />
              <p className="text-lg font-medium text-muted-foreground">
                Žádné neuskutečněné nástupy
              </p>
              <p className="text-sm text-muted-foreground">
                Všichni zaměstnanci nastoupili podle plánu
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="min-w-0 space-y-4 pb-2">
            {Object.keys(cancelledGrouped)
              .sort((a, b) => parseInt(b) - parseInt(a))
              .map((year) => {
                const yearData = cancelledGrouped[year]
                const isYearExpanded = expandedCancelledYears.includes(year)
                const yearTotal = Object.values(yearData).reduce(
                  (sum, arr) => sum + arr.length,
                  0
                )
                const yearMonthKeys = Object.keys(yearData)
                const allMonthsExpanded = yearMonthKeys.every((month) =>
                  expandedCancelledMonths.includes(month)
                )

                return (
                  <Collapsible key={year} open={isYearExpanded}>
                    <div className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                      <CollapsibleTrigger
                        onClick={() => toggleCancelledYear(year)}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        {isYearExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                        <span className="text-lg font-semibold">{year}</span>
                      </CollapsibleTrigger>

                      <Badge variant="secondary">{yearTotal}</Badge>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setExpandedCancelledMonths((prev) =>
                            allMonthsExpanded
                              ? prev.filter(
                                  (month) => !yearMonthKeys.includes(month)
                                )
                              : Array.from(new Set([...prev, ...yearMonthKeys]))
                          )

                          if (!allMonthsExpanded) {
                            setExpandedCancelledYears((prev) =>
                              prev.includes(year) ? prev : [...prev, year]
                            )
                          }
                        }}
                      >
                        {allMonthsExpanded ? "Sbalit vše" : "Zobrazit vše"}
                      </Button>
                    </div>

                    <CollapsibleContent className="mt-2 space-y-3">
                      {Object.keys(yearData)
                        .sort((a, b) => b.localeCompare(a))
                        .map((month) => {
                          const monthData = yearData[month]
                          const isMonthExpanded =
                            expandedCancelledMonths.includes(month)

                          return (
                            <Collapsible key={month} open={isMonthExpanded}>
                              <CollapsibleTrigger
                                onClick={() => toggleCancelledMonth(month)}
                                className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-gray-100 p-2 transition-colors hover:bg-gray-200 dark:bg-gray-800/50 dark:hover:bg-gray-800/70"
                              >
                                {isMonthExpanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                                <XCircle className="size-4 text-gray-600" />
                                <span className="font-medium">
                                  {format(
                                    new Date(month + "-01"),
                                    "LLLL yyyy",
                                    {
                                      locale: cs,
                                    }
                                  )}
                                </span>
                                <Badge variant="outline" className="ml-auto">
                                  {monthData.length}
                                </Badge>
                              </CollapsibleTrigger>

                              <CollapsibleContent className="mt-2">
                                <Card className="max-w-full opacity-60">
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
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Pozice
                                            </TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Odbor / Oddělení
                                            </TableHead>
                                            <TableHead className="w-[200px] min-w-[200px]">
                                              Důvod zrušení
                                            </TableHead>
                                            <TableHead className="w-[160px] min-w-[160px]">
                                              Zrušeno
                                            </TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">
                                              Kontakt
                                            </TableHead>
                                            <TableHead className="w-[280px] min-w-[280px] text-right">
                                              Akce
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>

                                        <TableBody>
                                          {monthData.map((e) => (
                                            <ArrivalTableRow
                                              key={e.id}
                                              arrival={e}
                                              variant="cancelled"
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
      </div>
    </>
  )

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden px-3 pb-8 sm:px-4 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">
          Nástupy zaměstnanců
        </h1>
        <p className="text-muted-foreground">
          Správa plánovaných a skutečných nástupů zaměstnanců
        </p>
      </div>

      {!hasLoadedOnce ? (
        <ListPageSkeleton />
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Hledat podle jména, osobního čísla, pozice, odboru…"
              />

              <MultiSelectFilter
                label="Stav"
                options={statusOptions}
                selected={facetFilters.status}
                onChange={handleStatusFilterChange}
                searchPlaceholder="Hledat stav…"
                emptyText="Žádný stav nenalezen."
              />
              <MultiSelectFilter
                label="Odbor"
                options={departmentOptions}
                selected={facetFilters.department}
                onChange={(values) => setFacetFilter("department", values)}
                searchPlaceholder="Hledat odbor…"
                emptyText="Žádný odbor nenalezen."
              />
              <MultiSelectFilter
                label="Oddělení"
                options={unitOptions}
                selected={facetFilters.unitName}
                onChange={(values) => setFacetFilter("unitName", values)}
                searchPlaceholder="Hledat oddělení…"
                emptyText="Žádné oddělení nenalezeno."
              />
              <MultiSelectFilter
                label="Pozice"
                options={positionOptions}
                selected={facetFilters.position}
                onChange={(values) => setFacetFilter("position", values)}
                searchPlaceholder="Hledat pozici…"
                emptyText="Žádná pozice nenalezena."
              />
              <MultiSelectFilter
                label="Typ pozice"
                options={positionTypeOptions}
                selected={facetFilters.positionType}
                onChange={(values) => setFacetFilter("positionType", values)}
                searchPlaceholder="Hledat typ pozice…"
                emptyText="Žádný typ nenalezen."
              />
              <MultiSelectFilter
                label="Vedoucí"
                options={supervisorOptions}
                selected={facetFilters.supervisor}
                onChange={(values) => setFacetFilter("supervisor", values)}
                searchPlaceholder="Hledat vedoucího…"
                emptyText="Žádný vedoucí nenalezen."
              />
              <MultiSelectFilter
                label="Mentor"
                options={mentorOptions}
                selected={facetFilters.mentor}
                onChange={(values) => setFacetFilter("mentor", values)}
                searchPlaceholder="Hledat mentora…"
                emptyText="Žádný mentor nenalezen."
              />
              <RangeFacetFilter
                label="Zkušební doba"
                options={PROBATION_PROGRESS_OPTIONS}
                selected={probationPresets}
                onSelectedChange={setProbationPresets}
                range={probationDayRange}
                onRangeChange={setProbationDayRange}
              />

              <MonthFilter
                label="Datum nástupu"
                value={arrivalDateFilter}
                onChange={setArrivalDateFilter}
              />
            </div>

            <ActiveFilterChips
              groups={[
                {
                  key: "status",
                  label: "Stav",
                  values: facetFilters.status.map((value) => ({
                    value,
                    label:
                      STATUS_OPTIONS.find((o) => o.value === value)?.label ??
                      value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "status",
                      facetFilters.status.filter((v) => v !== value)
                    ),
                },
                {
                  key: "department",
                  label: "Odbor",
                  values: facetFilters.department.map((value) => ({
                    value,
                    label: value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "department",
                      facetFilters.department.filter((v) => v !== value)
                    ),
                },
                {
                  key: "unitName",
                  label: "Oddělení",
                  values: facetFilters.unitName.map((value) => ({
                    value,
                    label: value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "unitName",
                      facetFilters.unitName.filter((v) => v !== value)
                    ),
                },
                {
                  key: "position",
                  label: "Pozice",
                  values: facetFilters.position.map((value) => ({
                    value,
                    label: value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "position",
                      facetFilters.position.filter((v) => v !== value)
                    ),
                },
                {
                  key: "positionType",
                  label: "Typ pozice",
                  values: facetFilters.positionType.map((value) => ({
                    value,
                    label:
                      POSITION_TYPE_OPTIONS.find((o) => o.value === value)
                        ?.label ?? value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "positionType",
                      facetFilters.positionType.filter((v) => v !== value)
                    ),
                },
                {
                  key: "supervisor",
                  label: "Vedoucí",
                  values: facetFilters.supervisor.map((value) => ({
                    value,
                    label:
                      supervisorOptions.find((o) => o.value === value)?.label ??
                      value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "supervisor",
                      facetFilters.supervisor.filter((v) => v !== value)
                    ),
                },
                {
                  key: "mentor",
                  label: "Mentor",
                  values: facetFilters.mentor.map((value) => ({
                    value,
                    label:
                      mentorOptions.find((o) => o.value === value)?.label ??
                      value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "mentor",
                      facetFilters.mentor.filter((v) => v !== value)
                    ),
                },
                {
                  key: "probation",
                  label: "Zkušební doba",
                  values: [
                    ...probationPresets.map((value) => ({
                      value,
                      label:
                        PROBATION_PROGRESS_OPTIONS.find(
                          (o) => o.value === value
                        )?.label ?? value,
                    })),
                    ...(isDayRangeActive(probationDayRange)
                      ? [
                          {
                            value: "range",
                            label:
                              [
                                probationDayRange.min != null
                                  ? `od ${probationDayRange.min}`
                                  : null,
                                probationDayRange.max != null
                                  ? `do ${probationDayRange.max}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" ") + " dní",
                          },
                        ]
                      : []),
                  ],
                  onRemove: (value) => {
                    if (value === "range") {
                      setProbationDayRange(EMPTY_DAY_RANGE)
                      return
                    }
                    setProbationPresets((prev) =>
                      prev.filter((v) => v !== value)
                    )
                  },
                },
              ]}
              onClearAll={() => {
                clearAllFacetFilters()
                setArrivalDateFilter("")
                setProbationPresets([])
                setProbationDayRange(EMPTY_DAY_RANGE)
              }}
            />
          </div>

          {isCombinedStatusMode ? (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
              {displayStatuses.includes("planned") && (
                <section className="flex min-h-0 flex-col gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <CalendarDays className="size-4" />
                    Plánované
                  </h2>
                  {plannedSectionContent}
                </section>
              )}

              {displayStatuses.includes("actual") && (
                <section className="flex min-h-0 flex-col gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <User className="size-4" />
                    Skutečné
                  </h2>
                  {actualSectionContent}
                </section>
              )}

              {displayStatuses.includes("cancelled") && (
                <section className="flex min-h-0 flex-col gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <XCircle className="size-4" />
                    Neuskutečněné
                  </h2>
                  {cancelledSectionContent}
                </section>
              )}
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as "planned" | "actual" | "cancelled")
              }
              className="flex min-h-0 flex-1 flex-col gap-4"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger
                  value="planned"
                  className="flex items-center gap-2"
                >
                  <CalendarDays className="size-4" />
                  Plánované
                </TabsTrigger>
                <TabsTrigger value="actual" className="flex items-center gap-2">
                  <User className="size-4" />
                  Skutečné
                </TabsTrigger>
                <TabsTrigger
                  value="cancelled"
                  className="flex items-center gap-2"
                >
                  <XCircle className="size-4" />
                  Neuskutečněné
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="planned"
                className="min-h-0 flex-1 space-y-4 overflow-hidden"
              >
                {plannedSectionContent}
              </TabsContent>

              <TabsContent
                value="actual"
                className="min-h-0 flex-1 space-y-4 overflow-hidden"
              >
                {actualSectionContent}
              </TabsContent>

              <TabsContent
                value="cancelled"
                className="min-h-0 flex-1 space-y-4 overflow-hidden"
              >
                {cancelledSectionContent}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      <Dialog
        open={openStart}
        onOpenChange={(o) => {
          setOpenStart(o)
          if (!o) {
            setActiveRow(null)
            setActualStartInput("")
          }
        }}
      >
        <DialogContent className="max-w-3xl p-0">
          <DialogTitle className="px-6 pt-6">
            Potvrdit skutečný nástup
          </DialogTitle>
          <div className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
            {activeRow && (
              <>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 font-medium">
                      <User className="size-4" />
                      Informace o zaměstnanci
                    </h4>
                  </div>

                  <div className="mb-4 grid gap-y-2 text-sm md:grid-cols-2">
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Jméno:
                      </span>{" "}
                      {[
                        activeRow.titleBefore,
                        activeRow.name,
                        activeRow.surname,
                        activeRow.titleAfter,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        E-mail:
                      </span>{" "}
                      {activeRow.email}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Pozice:
                      </span>{" "}
                      {activeRow.positionName}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Odbor:
                      </span>{" "}
                      {activeRow.department}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Oddělení:
                      </span>{" "}
                      {activeRow.unitName}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Plánovaný nástup:
                      </span>{" "}
                      {format(parseISO(activeRow.plannedStart), "d.M.yyyy")}{" "}
                      {activeRow.startTime || ""}
                    </div>
                    {activeRow.personalNumber && (
                      <div>
                        <span className="font-medium text-muted-foreground">
                          Osobní číslo:
                        </span>{" "}
                        <span className="font-mono">
                          {activeRow.personalNumber}
                        </span>
                      </div>
                    )}
                    {activeRow.notes && (
                      <div className="md:col-span-2">
                        <span className="font-medium text-muted-foreground">
                          Poznámka:
                        </span>{" "}
                        {activeRow.notes}
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="inline-flex items-center justify-center gap-2"
                    title="Otevřít formulář k úpravě"
                    onClick={() => {
                      setOpenStart(false)
                      void handleEdit(activeRow, "planned")
                    }}
                  >
                    <Edit className="size-4" />
                    Upravit údaje
                  </Button>
                </div>

                <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                  <CardContent className="p-4">
                    <h4 className="mb-3 flex items-center gap-2 font-medium">
                      <CalendarDays className="size-4" />
                      Datum skutečného nástupu
                    </h4>
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <Input
                          type="date"
                          value={actualStartInput}
                          onChange={(e) => setActualStartInput(e.target.value)}
                          className="max-w-[200px]"
                        />
                        <Button
                          size="sm"
                          className="inline-flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700"
                          title="Potvrdit skutečný nástup"
                          onClick={() => void confirmStartWithInput()}
                          disabled={!actualStartInput || isReadonly}
                        >
                          <Check className="size-4" />
                          Potvrdit nástup
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revertDialog.open}
        onOpenChange={(open) => setRevertDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/20">
                <RotateCcw className="size-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <DialogTitle>Vrátit nástup do plánovaných</DialogTitle>
                {revertDialog.arrival && (
                  <DialogDescription className="font-medium">
                    {[
                      revertDialog.arrival.titleBefore,
                      revertDialog.arrival.name,
                      revertDialog.arrival.surname,
                      revertDialog.arrival.titleAfter,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Opravdu chcete vrátit tento nástup zpět do plánovaných? Skutečný
              datum nástupu bude odstraněno a záznam se přesune zpět do
              plánovaných.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setRevertDialog({
                  open: false,
                  arrival: null,
                  loading: false,
                })
              }
              disabled={revertDialog.loading}
            >
              Zrušit
            </Button>
            <Button
              variant="default"
              onClick={handleRevert}
              disabled={revertDialog.loading || isReadonly}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
            >
              {revertDialog.loading && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Vrátit zpět
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelDialog.open}
        onOpenChange={(open) => setCancelDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/20">
                <XCircle className="size-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <DialogTitle>Zaměstnanec nenastoupil</DialogTitle>
                {cancelDialog.arrival && (
                  <DialogDescription className="font-medium">
                    {[
                      cancelDialog.arrival.titleBefore,
                      cancelDialog.arrival.name,
                      cancelDialog.arrival.surname,
                      cancelDialog.arrival.titleAfter,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label
                htmlFor="cancel-reason"
                className="mb-2 block text-sm font-medium"
              >
                Důvod zrušení nástupu
              </label>
              <Textarea
                id="cancel-reason"
                value={cancelDialog.reason}
                onChange={(e) =>
                  setCancelDialog((prev) => ({
                    ...prev,
                    reason: e.target.value,
                  }))
                }
                placeholder="např. Zaměstnanec odmítl nabídku, Nenastoupil bez omluvy..."
                rows={3}
                className="w-full"
              />
            </div>

            {cancelDialog.arrival?.linkedOffboarding && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {cancelDialog.arrival.linkedOffboarding.label}
                </p>
                <p className="mt-0.5">
                  Propojení s tímto odchodem zůstane jen jako informační
                  poznámka, dokud bude nástup mezi neuskutečněnými.
                </p>
              </div>
            )}

            {(() => {
              const count = cancelDialog.arrival?.personalNumber?.trim()
                ? (employeeChangesByPersonalNumber.get(
                    cancelDialog.arrival.personalNumber.trim()
                  )?.length ?? 0)
                : 0

              return count > 0 ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Propojené změny ({count})
                  </p>
                  <p className="mt-0.5">
                    K tomuto osobnímu číslu existují zaměstnanecké změny – jde
                    jen o informační vazbu.
                  </p>
                </div>
              ) : null
            })()}

            <p className="text-sm text-muted-foreground">
              Tento záznam bude přesunut do sekce &quot;Neuskutečněné
              nástupy&quot;.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setCancelDialog({
                  open: false,
                  arrival: null,
                  loading: false,
                  reason: "",
                })
              }
              disabled={cancelDialog.loading}
            >
              Zrušit
            </Button>
            <Button
              variant="default"
              onClick={handleCancel}
              disabled={
                cancelDialog.loading ||
                !cancelDialog.reason.trim() ||
                isReadonly
              }
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
            >
              {cancelDialog.loading && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Přesunout do neuskutečněných
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={restoreCancelledDialog.open}
        onOpenChange={(open) =>
          setRestoreCancelledDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <RotateCcw className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <DialogTitle>Obnovit nástup</DialogTitle>
                {restoreCancelledDialog.arrival && (
                  <DialogDescription className="font-medium">
                    {[
                      restoreCancelledDialog.arrival.titleBefore,
                      restoreCancelledDialog.arrival.name,
                      restoreCancelledDialog.arrival.surname,
                      restoreCancelledDialog.arrival.titleAfter,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Chcete obnovit tento nástup zpět do{" "}
              {restoreCancelledDialog.targetType === "actual"
                ? "skutečných"
                : "plánovaných"}{" "}
              nástupů?
            </p>

            {restoreCancelledDialog.arrival?.linkedOffboarding && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {restoreCancelledDialog.arrival.linkedOffboarding.label}
                </p>
                <p className="mt-0.5">
                  Propojení s tímto odchodem se znovu aktivuje.
                </p>
              </div>
            )}

            {(() => {
              const count =
                restoreCancelledDialog.arrival?.personalNumber?.trim()
                  ? (employeeChangesByPersonalNumber.get(
                      restoreCancelledDialog.arrival.personalNumber.trim()
                    )?.length ?? 0)
                  : 0

              return count > 0 ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Propojené změny ({count})
                  </p>
                  <p className="mt-0.5">
                    K tomuto osobnímu číslu existují zaměstnanecké změny – jde
                    jen o informační vazbu.
                  </p>
                </div>
              ) : null
            })()}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setRestoreCancelledDialog({
                  open: false,
                  arrival: null,
                  loading: false,
                  targetType: null,
                })
              }
              disabled={restoreCancelledDialog.loading}
            >
              Zrušit
            </Button>
            <Button
              variant="default"
              onClick={handleRestoreCancelled}
              disabled={restoreCancelledDialog.loading || isReadonly}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              {restoreCancelledDialog.loading && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Obnovit
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
                <DialogTitle>Smazat záznam</DialogTitle>
                {deleteDialog.arrival && (
                  <DialogDescription className="font-medium">
                    {[
                      deleteDialog.arrival.titleBefore,
                      deleteDialog.arrival.name,
                      deleteDialog.arrival.surname,
                      deleteDialog.arrival.titleAfter,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Opravdu chcete smazat tento záznam?
            </p>

            {deleteDialog.arrival?.linkedOffboarding && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {deleteDialog.arrival.linkedOffboarding.label}
                </p>
                <p className="mt-0.5">
                  {deleteDialog.arrival.linkedOffboarding.description}
                </p>
              </div>
            )}

            {deleteDialog.relatedChanges.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Propojené změny ({deleteDialog.relatedChanges.length})
                </p>
                <p className="mt-0.5">
                  K tomuto osobnímu číslu existují zaměstnanecké změny – jde jen
                  o informační vazbu, smazáním nástupu se nijak nezmění.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Záznam zůstane uložený a půjde ho kdykoliv obnovit v sekci
              „Smazané záznamy“.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialog({
                  open: false,
                  arrival: null,
                  relatedChanges: [],
                  loading: false,
                })
              }
              disabled={deleteDialog.loading}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDialog.loading || isReadonly}
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
        open={openEdit}
        onOpenChange={(open) => {
          setOpenEdit(open)
          if (open && positions.length === 0) {
            void loadPositions()
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogTitle className="px-6 pt-6">Upravit záznam</DialogTitle>
          <div className="p-6">
            {loadingPositions ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                <span className="ml-2 text-muted-foreground">
                  Načítám pozice...
                </span>
              </div>
            ) : editData ? (
              <OnboardingFormClient
                key={`edit-${editData.id}-${editData.context}`}
                positions={positions}
                id={editData.id}
                initial={editData.initial}
                mode="edit"
                editContext={editData.context}
                personalNumberMeta={personalMeta}
                onSuccess={async () => {
                  setOpenEdit(false)
                  setEditData(null)
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

      <SuccessModal
        open={successModal.open}
        onOpenChange={(open) => setSuccessModal((prev) => ({ ...prev, open }))}
        title={successModal.title}
        message={successModal.message}
      />

      <ErrorModal
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  )
}
