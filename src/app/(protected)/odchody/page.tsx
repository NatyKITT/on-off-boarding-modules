"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, parseISO, subMonths } from "date-fns"
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
  FileText,
  History as HistoryIcon,
  Info,
  RotateCcw,
  Trash2,
  User,
  XCircle,
} from "lucide-react"
import { useSession } from "next-auth/react"

import { useDismissableHighlight } from "@/hooks/use-dismissable-highlight"
import { useFacetedFilter } from "@/hooks/use-faceted-filter"
import { useSessionStorageState } from "@/hooks/use-session-storage-state"
import { useTextFilter } from "@/hooks/use-text-filter"
import {
  EMPTY_DAY_RANGE,
  getDateProgressBucket,
  getDaysRemaining,
  isDayRangeActive,
  matchesDayRange,
  type DayRangeValue,
} from "@/lib/dates"
import {
  buildDistinctOptions,
  filterAvailableOptions,
} from "@/lib/filter-options"
import {
  canReadOffboarding as hasOffboardingReadAccess,
  canWriteOffboarding as hasOffboardingWriteAccess,
  isReadonlyRole,
} from "@/lib/rbac"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { DepartureProgressBar } from "@/components/ui/departure-progress-bar"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActiveFilterChips } from "@/components/common/active-filter-chips"
import { ExitChecklistDialog } from "@/components/common/exit-checklist-dialog"
import { LinkedRecordInfoButton } from "@/components/common/linked-record-info-button"
import { ListPageSkeleton } from "@/components/common/list-page-skeleton"
import { MonthFilter } from "@/components/common/month-filter"
import {
  MultiSelectFilter,
  type MultiSelectOption,
} from "@/components/common/multi-select-filter"
import { RangeFacetFilter } from "@/components/common/range-facet-filter"
import { SearchInput } from "@/components/common/search-input"
import { CombinedReportLauncher } from "@/components/emails/combined-report-launcher"
import {
  FormValues,
  OffboardingFormUnified,
} from "@/components/forms/offboarding-form"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

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

type LinkedOnboardingInfo = {
  id: number
  plannedStart: string | null
  actualStart: string | null
  probationEnd: string | null
  positionName: string | null
  exitDuringProbation: boolean
  isCancelled: boolean
  label: string
  description: string
}

type Departure = {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  department: string
  unitName: string
  positionName: string
  positionNum?: string | null
  personalNumber?: string | null
  plannedEnd: string
  actualEnd?: string | null
  noticeFiled?: string | null
  noticeEnd?: string | null
  noticeMonths?: number | null
  hasCustomDates?: boolean
  userEmail?: string | null
  userName?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
  probationStopDecision?: "STOP" | "KEEP" | null

  linkedOnboarding?: LinkedOnboardingInfo | null
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

// Výpovědní doba nemá v appce vlastní datum začátku - dopočítá se zpětně
// od data odchodu podle délky výpovědní doby (noticeMonths).
function computeNoticeStart(
  targetDate?: string | null,
  noticeMonths?: number | null
): Date | null {
  if (!targetDate) return null

  const target = new Date(`${targetDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null

  return subMonths(target, noticeMonths ?? 2)
}

type DepartureFacetKey = "status" | "department" | "unitName" | "position"

const DEPARTURE_STATUS_OPTIONS: MultiSelectOption[] = [
  { value: "planned", label: "Plánované" },
  { value: "actual", label: "Skutečné" },
  { value: "both", label: "Obojí" },
]

const DEPARTURE_PROGRESS_OPTIONS: MultiSelectOption[] = [
  { value: "ACTIVE", label: "Aktivní / běžící" },
  { value: "OVERDUE", label: "Již odešel / po termínu" },
  { value: "TODAY", label: "Dnes (0 dní)" },
  { value: "WITHIN_7", label: "Do 7 dnů" },
  { value: "WITHIN_30", label: "Do 30 dnů" },
  { value: "WITHIN_60", label: "Do 2 měsíců" },
  { value: "WITHIN_120", label: "Do 4 měsíců" },
  { value: "LATER", label: "Více než 4 měsíce" },
]

function departureStatus(departure: Departure): "planned" | "actual" {
  return departure.actualEnd ? "actual" : "planned"
}

function departureTargetDate(departure: Departure): string | null | undefined {
  return departureStatus(departure) === "planned"
    ? departure.plannedEnd
    : departure.actualEnd
}

function departureProgressTags(departure: Departure): string[] {
  const bucket = getDateProgressBucket(departureTargetDate(departure))
  if (!bucket) return []

  if (bucket === "OVERDUE") return ["OVERDUE"]

  return [bucket, "ACTIVE"]
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

function departureToInitial(d: Departure): Partial<FormValues> {
  return {
    titleBefore: d.titleBefore ?? "",
    name: d.name ?? "",
    surname: d.surname ?? "",
    titleAfter: d.titleAfter ?? "",
    personalNumber: d.personalNumber ?? "",
    positionNum: d.positionNum ?? "",
    positionName: d.positionName ?? "",
    department: d.department ?? "",
    unitName: d.unitName ?? "",
    userEmail: d.userEmail ?? "",
    noticeFiled: d.noticeFiled ? d.noticeFiled.slice(0, 10) : "",
    noticeEnd: d.noticeEnd ? d.noticeEnd.slice(0, 10) : undefined,
    noticeMonths: d.noticeMonths ?? undefined,
    hasCustomDates: d.hasCustomDates ?? false,
    plannedEnd: d.plannedEnd ? d.plannedEnd.slice(0, 10) : "",
    actualEnd: d.actualEnd ? d.actualEnd.slice(0, 10) : "",
    notes: d.notes ?? "",
    status: d.status,
  }
}

type GroupedData = {
  [year: string]: {
    [month: string]: Departure[]
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

const groupByYearAndMonth = (
  data: Departure[],
  dateField: "plannedEnd" | "actualEnd"
): GroupedData => {
  const grouped: GroupedData = {}

  data.forEach((item) => {
    const dateStr = item[dateField] || item.plannedEnd
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
  data: Departure[],
  dateField: "plannedEnd" | "actualEnd"
): { year?: string; month?: string } {
  if (!data.length) return {}

  const sorted = [...data].sort((a, b) => {
    const aDate = new Date((a[dateField] || a.plannedEnd) ?? "").getTime()
    const bDate = new Date((b[dateField] || b.plannedEnd) ?? "").getTime()
    return bDate - aDate
  })

  const latest = sorted[0]
  const dateStr = (latest[dateField] || latest.plannedEnd) ?? ""
  if (!dateStr) return {}

  const year = dateStr.slice(0, 4)
  const month = dateStr.slice(0, 7)
  return { year, month }
}

function getAllYearsAndMonths(grouped: GroupedData): {
  years: string[]
  months: string[]
} {
  const years = Object.keys(grouped)
  const months = years.flatMap((year) => Object.keys(grouped[year]))

  return { years, months }
}

interface DepartureTableRowProps {
  departure: Departure
  variant: "planned" | "actual"
  canManage: boolean
  canOpenExitChecklist: boolean
  isReadonly: boolean
  onEdit: () => void
  onConfirm?: () => void
  onRevert?: () => void
  onDelete: () => void
  onOpenExitChecklist: () => void
  relatedChanges: EmployeeChangeInfo[]
  highlighted?: boolean
}

const DepartureTableRow: React.FC<DepartureTableRowProps> = ({
  departure,
  variant,
  canManage,
  canOpenExitChecklist,
  isReadonly,
  onEdit,
  onConfirm,
  onDelete,
  onRevert,
  onOpenExitChecklist,
  relatedChanges,
  highlighted,
}) => {
  const fullName = [
    departure.titleBefore,
    departure.name,
    departure.surname,
    departure.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <TableRow
      id={`departure-row-${departure.id}`}
      className={
        highlighted
          ? "bg-amber-50 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/30"
          : undefined
      }
    >
      <TableCell className="sticky left-0 z-10 w-[240px] border-r bg-background">
        <div className="flex items-center gap-2">
          <User className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">{fullName}</span>
            {departure.personalNumber && (
              <span className="font-mono text-xs text-muted-foreground">
                #{departure.personalNumber}
              </span>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="w-[240px]">
        <div className="flex flex-col">
          <span className="text-sm font-medium" title={departure.positionName}>
            {departure.positionName}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {departure.positionNum}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-[240px]">
        <div className="flex flex-col">
          <span className="text-sm font-medium" title={departure.department}>
            {departure.department}
          </span>
          <span
            className="text-xs text-muted-foreground"
            title={departure.unitName}
          >
            {departure.unitName}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-[140px] whitespace-nowrap">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm">
            {variant === "planned"
              ? format(parseISO(departure.plannedEnd), "d.M.yyyy")
              : departure.actualEnd
                ? format(parseISO(departure.actualEnd), "d.M.yyyy")
                : "–"}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-[230px]">
        <div className="space-y-1.5">
          {(() => {
            const targetDate =
              variant === "planned"
                ? departure.plannedEnd
                : (departure.actualEnd as string)
            const noticeStart = computeNoticeStart(
              targetDate,
              departure.noticeMonths
            )

            return (
              <>
                <DepartureProgressBar
                  targetDate={targetDate}
                  startDate={
                    noticeStart ? format(noticeStart, "yyyy-MM-dd") : null
                  }
                  variant={variant}
                  label=""
                />
                {noticeStart && (
                  <div className="text-[11px] font-medium text-foreground">
                    Běží od dne {format(noticeStart, "d.M.yyyy")}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </TableCell>

      <TableCell className="w-[180px]">
        <div className="flex flex-col">
          <span
            className="truncate text-sm"
            title={departure.userEmail || undefined}
          >
            {departure.userEmail ?? "–"}
          </span>
          {departure.userName && (
            <span className="font-mono text-xs text-muted-foreground">
              {departure.userName}
            </span>
          )}
        </div>
      </TableCell>

      <TableCell className="w-[420px] whitespace-nowrap text-right">
        <div className="flex justify-end gap-1">
          <EmployeeChangeInfoButton
            changes={relatedChanges}
            employeeName={fullName}
          />

          <LinkedRecordInfoButton
            employeeName={fullName}
            onboarding={departure.linkedOnboarding}
            probationStopDecision={departure.probationStopDecision}
          />

          {canOpenExitChecklist && (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenExitChecklist}
              title="Výstupní list"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap"
            >
              <FileText className="size-4" />
              <span className="hidden sm:inline">Výstupní list</span>
            </Button>
          )}

          {!isReadonly && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              title="Upravit záznam"
            >
              <Edit className="size-4" />
              <span className="ml-1 hidden sm:inline">Upravit</span>
            </Button>
          )}

          {!isReadonly && variant === "planned" && onConfirm ? (
            <Button
              size="sm"
              variant="default"
              onClick={onConfirm}
              disabled={!canManage}
              title="Potvrdit skutečný odchod"
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Check className="size-4" />
              <span className="ml-1 hidden sm:inline">Odešel</span>
            </Button>
          ) : !isReadonly && variant === "actual" && onRevert ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRevert}
              disabled={!canManage}
              title="Vrátit zpět do plánovaných"
              className="text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950"
            >
              <RotateCcw className="size-4" />
              <span className="ml-1 hidden whitespace-nowrap sm:inline">
                Vrátit zpět
              </span>
            </Button>
          ) : null}

          <HistoryDialog
            id={departure.id}
            kind="offboarding"
            trigger={
              <Button size="sm" variant="outline" title="Historie změn">
                <HistoryIcon className="size-4" />
              </Button>
            }
          />

          {!isReadonly && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={!canManage}
              title="Smazat záznam"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function OffboardingPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const { data: session, status } = useSession()

  const [planned, setPlanned] = useState<Departure[]>([])
  const [actual, setActual] = useState<Departure[]>([])
  const [employeeChanges, setEmployeeChanges] = useState<EmployeeChangeInfo[]>(
    []
  )
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [openNewPlanned, setOpenNewPlanned] = useState(false)
  const [openNewActual, setOpenNewActual] = useState(false)
  const [openActual, setOpenActual] = useState(false)
  const [activeRow, setActiveRow] = useState<Departure | null>(null)
  const [actualEndInput, setActualEndInput] = useState<string>("")
  const [openEdit, setOpenEdit] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editInitial, setEditInitial] = useState<Partial<FormValues> | null>(
    null
  )
  const [editLoading, setEditLoading] = useState(false)
  const [editContext, setEditContext] = useState<"planned" | "actual">(
    "planned"
  )

  const [revertDialog, setRevertDialog] = useState<{
    open: boolean
    departure: Departure | null
    loading: boolean
  }>({ open: false, departure: null, loading: false })

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    departure: Departure | null
    relatedChanges: EmployeeChangeInfo[]
    loading: boolean
  }>({ open: false, departure: null, relatedChanges: [], loading: false })

  const [expandedPlannedYears, setExpandedPlannedYears] =
    useSessionStorageState<string[]>("odchody:expandedPlannedYears", [])
  const [expandedPlannedMonths, setExpandedPlannedMonths] =
    useSessionStorageState<string[]>("odchody:expandedPlannedMonths", [])
  const [expandedActualYears, setExpandedActualYears] = useSessionStorageState<
    string[]
  >("odchody:expandedActualYears", [])
  const [expandedActualMonths, setExpandedActualMonths] =
    useSessionStorageState<string[]>("odchody:expandedActualMonths", [])

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

  const [openExitChecklistId, setOpenExitChecklistId] = useState<number | null>(
    null
  )

  const qpMode = sp.get("new") as "create-planned" | "create-actual" | null
  const qpDate = sp.get("date") || undefined
  const qpHighlightId = sp.get("highlight")
  const qpHighlightStatus = sp.get("status") as "planned" | "actual" | null

  const [highlightedDepartureId, setHighlightedDepartureId] = useState<
    number | null
  >(null)
  const [highlightedDepartureVariant, setHighlightedDepartureVariant] =
    useState<"planned" | "actual" | null>(null)

  const currentMonth = format(new Date(), "yyyy-MM")

  const role = session?.user?.role ?? "USER"
  const canManageOffboarding = hasOffboardingWriteAccess(role)
  const canReadOffboarding = hasOffboardingReadAccess(role)
  const isReadonly = isReadonlyRole(role)

  const showSuccess = React.useCallback((title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }, [])

  const showError = React.useCallback((title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }, [])

  const allPersonalNumbers = useMemo(
    () =>
      [...planned, ...actual]
        .map((d) => d.personalNumber)
        .filter(Boolean) as string[],
    [planned, actual]
  )

  const [departureDateFilter, setDepartureDateFilter] = useSessionStorageState(
    "odchody:dateFilter",
    ""
  )
  const [departurePresets, setDeparturePresets] = useState<string[]>([])
  const [departureDayRange, setDepartureDayRange] =
    useState<DayRangeValue>(EMPTY_DAY_RANGE)

  const allDepartures = useMemo(
    () => [...planned, ...actual],
    [planned, actual]
  )

  const reload = React.useCallback(async () => {
    if (!canReadOffboarding) {
      setLoading(false)
      setHasLoadedOnce(true)
      return
    }

    setLoading(true)
    try {
      const [offRes, changesRes] = await Promise.all([
        fetch("/api/odchody", { cache: "no-store" }),
        fetch("/api/zmeny", { cache: "no-store" }),
      ])
      const offJson = await offRes.json().catch(() => null)
      const changesJson = await changesRes.json().catch(() => null)

      if (offJson?.status === "success" && Array.isArray(offJson.data)) {
        const rows = offJson.data as Departure[]
        setPlanned(rows.filter((e) => !e.actualEnd))
        setActual(rows.filter((e) => e.actualEnd))
      } else {
        setPlanned([])
        setActual([])
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
      setEmployeeChanges([])
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [canReadOffboarding, showError])

  useEffect(() => {
    if (status === "loading") return

    if (role === "USER") {
      router.replace("/no-access")
      return
    }

    if (!canReadOffboarding) {
      router.replace("/no-access")
      return
    }

    void reload()
  }, [status, role, canReadOffboarding, reload, router])

  useEffect(() => {
    if (!qpMode || !canManageOffboarding) return
    if (qpMode === "create-actual") setOpenNewActual(true)
    else setOpenNewPlanned(true)
  }, [qpMode, canManageOffboarding])

  useEffect(() => {
    const handler = () => {
      setOpenExitChecklistId(null)
    }

    window.addEventListener("exit-checklist:close", handler)
    return () => {
      window.removeEventListener("exit-checklist:close", handler)
    }
  }, [])

  useEffect(() => {
    const handler = () => void reload()
    window.addEventListener("offboarding:deleted", handler)
    window.addEventListener("offboarding:updated", handler)
    window.addEventListener("offboarding:created", handler)
    return () => {
      window.removeEventListener("offboarding:deleted", handler)
      window.removeEventListener("offboarding:updated", handler)
      window.removeEventListener("offboarding:created", handler)
    }
  }, [reload])

  const employeeChangesByPersonalNumber = useMemo(
    () => groupChangesByPersonalNumber(employeeChanges),
    [employeeChanges]
  )

  const getDepartureSearchableText = React.useCallback(
    (departure: Departure) => [
      departure.name,
      departure.surname,
      departure.titleBefore,
      departure.titleAfter,
      departure.personalNumber,
      departure.positionName,
      departure.positionNum,
      departure.department,
      departure.unitName,
      departure.userEmail,
      departure.userName,
    ],
    []
  )

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    filterRows,
  } = useTextFilter(getDepartureSearchableText, {
    persistKey: "odchody:searchQuery",
  })

  const dateFilteredDepartures = useMemo(() => {
    const hasProgressFilter =
      departurePresets.length > 0 || isDayRangeActive(departureDayRange)

    if (!departureDateFilter && !hasProgressFilter) return allDepartures

    return allDepartures.filter((departure) => {
      const targetDate = departureTargetDate(departure)

      if (
        departureDateFilter &&
        targetDate?.slice(0, 7) !== departureDateFilter
      ) {
        return false
      }

      if (hasProgressFilter) {
        const tags = departureProgressTags(departure)
        const presetMatch =
          departurePresets.length > 0 &&
          departurePresets.some((preset) => tags.includes(preset))
        const rangeMatch =
          isDayRangeActive(departureDayRange) &&
          matchesDayRange(getDaysRemaining(targetDate), departureDayRange)

        if (!presetMatch && !rangeMatch) return false
      }

      return true
    })
  }, [allDepartures, departureDateFilter, departurePresets, departureDayRange])

  const searchedDepartures = useMemo(
    () => filterRows(dateFilteredDepartures),
    [dateFilteredDepartures, filterRows]
  )

  const departureFacets = useMemo(
    () => ({
      status: (departure: Departure) => [departureStatus(departure), "both"],
      department: (departure: Departure) => [departure.department],
      unitName: (departure: Departure) => [departure.unitName],
      position: (departure: Departure) => [departure.positionName],
    }),
    []
  )

  const {
    filters: facetFilters,
    setFacetValues: setFacetFilter,
    clearAll: clearAllFacetFilters,
    filteredRows: facetedDepartures,
    availableValues,
  } = useFacetedFilter<Departure, DepartureFacetKey>(
    searchedDepartures,
    departureFacets,
    { persistKey: "odchody:facetFilters" }
  )

  const handleStatusFilterChange = React.useCallback(
    (nextValues: string[]) => {
      const prevSet = new Set(facetFilters.status)
      const addedValue = nextValues.find((value) => !prevSet.has(value))

      if (addedValue === "both") {
        setFacetFilter("status", ["both"])
        return
      }

      setFacetFilter(
        "status",
        nextValues.filter((value) => value !== "both")
      )
    },
    [facetFilters.status, setFacetFilter]
  )

  const filteredPlanned = useMemo(
    () => facetedDepartures.filter((d) => departureStatus(d) === "planned"),
    [facetedDepartures]
  )

  const filteredActual = useMemo(
    () => facetedDepartures.filter((d) => departureStatus(d) === "actual"),
    [facetedDepartures]
  )

  const isAnyNonStatusFilterActive =
    searchQuery.trim() !== "" ||
    departureDateFilter !== "" ||
    departurePresets.length > 0 ||
    isDayRangeActive(departureDayRange) ||
    facetFilters.department.length > 0 ||
    facetFilters.unitName.length > 0 ||
    facetFilters.position.length > 0

  const isAnyFilterActive =
    isAnyNonStatusFilterActive || facetFilters.status.length > 0

  // With no explicit status chosen, an active filter still narrows which
  // tab(s) actually contain matches — so the page can jump straight there
  // (or show them combined) instead of silently sitting on an empty tab.
  const displayStatuses = useMemo(() => {
    if (facetFilters.status.length > 0) {
      return facetFilters.status.includes("both")
        ? (["planned", "actual"] as const)
        : (facetFilters.status as Array<"planned" | "actual">)
    }

    if (!isAnyNonStatusFilterActive) return []

    const nonEmpty: Array<"planned" | "actual"> = []
    if (filteredPlanned.length > 0) nonEmpty.push("planned")
    if (filteredActual.length > 0) nonEmpty.push("actual")

    return nonEmpty
  }, [
    facetFilters.status,
    isAnyNonStatusFilterActive,
    filteredPlanned,
    filteredActual,
  ])

  const isCombinedStatusMode = displayStatuses.length >= 2

  const [activeTab, setActiveTab] = useState<"planned" | "actual">("planned")

  useEffect(() => {
    if (displayStatuses.length === 1) {
      setActiveTab(displayStatuses[0])
    }
  }, [displayStatuses])

  const departmentOptionsAll = useMemo(
    () => buildDistinctOptions(allDepartures.map((d) => d.department)),
    [allDepartures]
  )
  const departmentOptions = useMemo(
    () =>
      filterAvailableOptions(departmentOptionsAll, availableValues.department),
    [departmentOptionsAll, availableValues.department]
  )

  const unitOptionsAll = useMemo(
    () => buildDistinctOptions(allDepartures.map((d) => d.unitName)),
    [allDepartures]
  )
  const unitOptions = useMemo(
    () => filterAvailableOptions(unitOptionsAll, availableValues.unitName),
    [unitOptionsAll, availableValues.unitName]
  )

  const positionOptionsAll = useMemo(
    () => buildDistinctOptions(allDepartures.map((d) => d.positionName)),
    [allDepartures]
  )
  const positionOptions = useMemo(
    () => filterAvailableOptions(positionOptionsAll, availableValues.position),
    [positionOptionsAll, availableValues.position]
  )

  const statusOptions = useMemo(
    () =>
      filterAvailableOptions(DEPARTURE_STATUS_OPTIONS, availableValues.status),
    [availableValues.status]
  )

  const plannedGrouped = useMemo(
    () => groupByYearAndMonth(filteredPlanned, "plannedEnd"),
    [filteredPlanned]
  )

  const actualGrouped = useMemo(
    () => groupByYearAndMonth(filteredActual, "actualEnd"),
    [filteredActual]
  )

  const plannedExpandInitRef = React.useRef(false)
  const actualExpandInitRef = React.useRef(false)

  useEffect(() => {
    if (!plannedExpandInitRef.current) {
      plannedExpandInitRef.current = true
      if (expandedPlannedYears.length > 0 || expandedPlannedMonths.length > 0) {
        return
      }
    }

    if (isAnyFilterActive) {
      const { years, months } = getAllYearsAndMonths(plannedGrouped)
      setExpandedPlannedYears(years)
      setExpandedPlannedMonths(months)
      return
    }

    const { year, month } = getLatestYearAndMonth(filteredPlanned, "plannedEnd")
    setExpandedPlannedYears(year ? [year] : [])
    setExpandedPlannedMonths(month ? [month] : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredPlanned,
    plannedGrouped,
    isAnyFilterActive,
    setExpandedPlannedYears,
    setExpandedPlannedMonths,
  ])

  useEffect(() => {
    if (!actualExpandInitRef.current) {
      actualExpandInitRef.current = true
      if (expandedActualYears.length > 0 || expandedActualMonths.length > 0) {
        return
      }
    }

    if (isAnyFilterActive) {
      const { years, months } = getAllYearsAndMonths(actualGrouped)
      setExpandedActualYears(years)
      setExpandedActualMonths(months)
      return
    }

    const { year, month } = getLatestYearAndMonth(filteredActual, "actualEnd")
    setExpandedActualYears(year ? [year] : [])
    setExpandedActualMonths(month ? [month] : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredActual,
    actualGrouped,
    isAnyFilterActive,
    setExpandedActualYears,
    setExpandedActualMonths,
  ])

  const appliedHighlightRef = React.useRef<string | null>(null)
  const previousHighlightIdRef = React.useRef<string | null>(null)

  useEffect(() => {
    const previous = previousHighlightIdRef.current
    previousHighlightIdRef.current = qpHighlightId

    if (!previous || qpHighlightId) return

    if (!isAnyFilterActive) {
      if (highlightedDepartureVariant === "planned") {
        const { year, month } = getLatestYearAndMonth(planned, "plannedEnd")
        setExpandedPlannedYears(year ? [year] : [])
        setExpandedPlannedMonths(month ? [month] : [])
      } else if (highlightedDepartureVariant === "actual") {
        const { year, month } = getLatestYearAndMonth(actual, "actualEnd")
        setExpandedActualYears(year ? [year] : [])
        setExpandedActualMonths(month ? [month] : [])
      }
    }

    appliedHighlightRef.current = null
    setHighlightedDepartureId(null)
    setHighlightedDepartureVariant(null)
  }, [
    qpHighlightId,
    isAnyFilterActive,
    highlightedDepartureVariant,
    planned,
    actual,
    setExpandedPlannedYears,
    setExpandedPlannedMonths,
    setExpandedActualYears,
    setExpandedActualMonths,
  ])

  useEffect(() => {
    if (!qpHighlightId) return

    const hasLocalFilters =
      searchQuery.trim() !== "" ||
      departureDateFilter !== "" ||
      departurePresets.length > 0 ||
      isDayRangeActive(departureDayRange) ||
      facetFilters.department.length > 0 ||
      facetFilters.unitName.length > 0 ||
      facetFilters.position.length > 0 ||
      facetFilters.status.length > 0

    if (hasLocalFilters) {
      router.replace("/odchody")
    }
  }, [
    qpHighlightId,
    searchQuery,
    departureDateFilter,
    departurePresets,
    departureDayRange,
    facetFilters,
    router,
  ])

  const expandVariant = React.useCallback(
    (variant: "planned" | "actual") => {
      if (variant === "planned") {
        const { years, months } = getAllYearsAndMonths(
          groupByYearAndMonth(planned, "plannedEnd")
        )
        setExpandedPlannedYears(years)
        setExpandedPlannedMonths(months)
      } else {
        const { years, months } = getAllYearsAndMonths(
          groupByYearAndMonth(actual, "actualEnd")
        )
        setExpandedActualYears(years)
        setExpandedActualMonths(months)
      }
    },
    [
      planned,
      actual,
      setExpandedPlannedYears,
      setExpandedPlannedMonths,
      setExpandedActualYears,
      setExpandedActualMonths,
    ]
  )

  useEffect(() => {
    if (!qpHighlightId) return
    if (appliedHighlightRef.current === qpHighlightId) return

    const id = Number(qpHighlightId)
    const departure = allDepartures.find((d) => d.id === id)
    if (!departure) return

    appliedHighlightRef.current = qpHighlightId

    setSearchQuery("")
    clearAllFacetFilters()
    setDepartureDateFilter("")
    setDeparturePresets([])
    setDepartureDayRange(EMPTY_DAY_RANGE)

    const variant = qpHighlightStatus ?? departureStatus(departure)
    setActiveTab(variant)
    expandVariant(variant)

    setHighlightedDepartureVariant(variant)
    setHighlightedDepartureId(id)
  }, [
    qpHighlightId,
    qpHighlightStatus,
    allDepartures,
    expandVariant,
    clearAllFacetFilters,
    setSearchQuery,
    setDepartureDateFilter,
  ])

  useEffect(() => {
    if (!highlightedDepartureId) return

    let cancelled = false
    let attempts = 0
    const targetId = `departure-row-${highlightedDepartureId}`

    const tryScroll = () => {
      if (cancelled) return

      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      if (highlightedDepartureVariant) {
        setActiveTab(highlightedDepartureVariant)
        expandVariant(highlightedDepartureVariant)
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
    highlightedDepartureId,
    isCombinedStatusMode,
    activeTab,
    highlightedDepartureVariant,
    expandVariant,
  ])

  const clearDepartureRing = React.useCallback(
    () => setHighlightedDepartureId(null),
    []
  )
  useDismissableHighlight(highlightedDepartureId, clearDepartureRing)

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

  function openActualDialogFromPlanned(row: Departure) {
    if (!canManageOffboarding) return
    setActiveRow(row)
    setActualEndInput(row.plannedEnd.slice(0, 10))
    setOpenActual(true)
  }

  async function confirmDepartureWithInput() {
    if (!activeRow || !actualEndInput || !canManageOffboarding) return

    try {
      const actualDate = new Date(actualEndInput)
      const noticePeriodEnd = new Date(actualDate)
      noticePeriodEnd.setMonth(noticePeriodEnd.getMonth() + 2)

      const res = await fetch(`/api/odchody/${activeRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualEnd: actualEndInput,
          noticePeriodEnd: format(noticePeriodEnd, "yyyy-MM-dd"),
          status: "COMPLETED",
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => null)
        showError(
          "Chyba při potvrzování",
          j?.message ?? "Potvrzení se nezdařilo."
        )
        return
      }

      setOpenActual(false)
      setActiveRow(null)
      setActualEndInput("")

      showSuccess(
        "Odchod potvrzen",
        `Skutečný odchod pro ${activeRow.name} ${activeRow.surname} byl úspěšně zaznamenán.`
      )

      await reload()
    } catch (error) {
      console.error("Error confirming departure:", error)
      showError(
        "Chyba při potvrzování",
        error instanceof Error ? error.message : "Potvrzení se nezdařilo."
      )
    }
  }

  async function handleRevert() {
    const departure = revertDialog.departure
    if (!departure || !canManageOffboarding) return

    setRevertDialog((prev) => ({ ...prev, loading: true }))

    try {
      const response = await fetch(`/api/odchody/${departure.id}/revert`, {
        method: "POST",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message ?? "Vrácení se nezdařilo")
      }

      setRevertDialog({ open: false, departure: null, loading: false })
      showSuccess(
        "Odchod vrácen",
        `Záznam "${departure.name} ${departure.surname}" byl vrácen do plánovaných.`
      )
      await reload()
    } catch (error) {
      console.error("Error reverting departure:", error)
      showError(
        "Chyba při vracení",
        error instanceof Error ? error.message : "Vrácení se nezdařilo"
      )
      setRevertDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  async function openEditDialog(row: Departure, context: "planned" | "actual") {
    if (!canManageOffboarding) return

    setEditContext(context)
    setEditId(row.id)
    setEditLoading(true)

    try {
      const res = await fetch(`/api/odchody/${row.id}`, { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        const d = json?.data as Departure
        setEditInitial(departureToInitial(d))
        setOpenEdit(true)
      } else {
        showError("Chyba při načítání", "Nepodařilo se načíst data záznamu.")
      }
    } catch (error) {
      console.error("Error loading edit data:", error)
      showError("Chyba při načítání", "Nepodařilo se načíst data záznamu.")
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDelete(departure: Departure) {
    if (!canManageOffboarding) return

    const personalNumber = departure.personalNumber?.trim()

    setDeleteDialog({
      open: true,
      departure,
      relatedChanges: personalNumber
        ? (employeeChangesByPersonalNumber.get(personalNumber) ?? [])
        : [],
      loading: false,
    })
  }

  async function confirmDelete() {
    const departure = deleteDialog.departure
    if (!departure || !canManageOffboarding) return

    setDeleteDialog((prev) => ({ ...prev, loading: true }))

    const willReactivateProbation = Boolean(
      departure.linkedOnboarding?.exitDuringProbation &&
        departure.probationStopDecision === "STOP"
    )

    try {
      let res = await fetch(
        `/api/odchody/${departure.id}${willReactivateProbation ? "?confirmReactivate=true" : ""}`,
        { method: "DELETE" }
      )
      let json = await res.json().catch(() => null)

      if (res.ok && json?.status === "confirm_required") {
        res = await fetch(
          `/api/odchody/${departure.id}?confirmReactivate=true`,
          { method: "DELETE" }
        )
        json = await res.json().catch(() => null)
      }

      if (!res.ok) {
        throw new Error(json?.message ?? "Smazání se nezdařilo.")
      }

      setDeleteDialog({
        open: false,
        departure: null,
        relatedChanges: [],
        loading: false,
      })
      window.dispatchEvent(new Event("offboarding:deleted"))
      showSuccess(
        "Záznam smazán",
        `Odchod pro ${departure.name} ${departure.surname} byl úspěšně smazán.`
      )
      await reload()
    } catch (err) {
      showError(
        "Chyba při mazání",
        err instanceof Error ? err.message : "Smazání se nezdařilo."
      )
      setDeleteDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  if (status === "loading") {
    return (
      <div
        className="
        mx-auto
        flex w-full max-w-[1400px] flex-col
        gap-4 px-3 pb-8
        sm:px-4
        lg:px-8
      "
      >
        <p className="text-sm text-muted-foreground">Načítám…</p>
      </div>
    )
  }

  if (role === "USER" || !canReadOffboarding) {
    return null
  }

  const plannedSectionContent = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {canManageOffboarding ? (
          <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
            <DialogTrigger asChild>
              <Button className="w-full justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] sm:w-auto">
                Přidat plánovaný odchod
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-h-[90vh] max-w-5xl overflow-y-auto p-0"
              onInteractOutside={(event) => event.preventDefault()}
            >
              <DialogTitle className="px-6 pt-6">
                Nový plánovaný odchod
              </DialogTitle>
              <div className="p-6">
                <OffboardingFormUnified
                  mode="create-planned"
                  prefillDate={qpDate}
                  excludePersonalNumbers={allPersonalNumbers}
                  onSuccess={async () => {
                    setOpenNewPlanned(false)
                    showSuccess(
                      "Záznam vytvořen",
                      "Plánovaný odchod byl úspěšně přidán."
                    )
                    await reload()
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div />
        )}

        {canManageOffboarding && (
          <div className="w-full sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">
            <DeletedRecordsDialog
              kind="offboarding"
              title="Smazané odchody"
              triggerLabel="Smazané záznamy"
              successEvent="offboarding:deleted"
              onRestore={() => void reload()}
            />
          </div>
        )}
      </div>

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
              Žádné plánované odchody
            </p>
            <p className="text-sm text-muted-foreground">
              {canManageOffboarding
                ? "Přidejte první záznam pomocí tlačítka výše"
                : "Momentálně zde nejsou žádné záznamy"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 pb-6">
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
                  <div className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                    <CollapsibleTrigger
                      onClick={() => togglePlannedYear(year)}
                      className="flex flex-1 items-center gap-2"
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
                              className="flex w-full items-center gap-2 rounded-lg bg-orange-50 p-2 transition-colors hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30"
                            >
                              {isMonthExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                              <CalendarDays className="size-4 text-orange-600" />
                              <span className="font-medium">
                                {format(new Date(month + "-01"), "LLLL yyyy", {
                                  locale: cs,
                                })}
                              </span>
                              <Badge variant="outline" className="ml-auto">
                                {monthData.length}
                              </Badge>
                            </CollapsibleTrigger>

                            <CollapsibleContent className="mt-2">
                              <Card className="w-full min-w-0 overflow-hidden">
                                <CardContent className="min-w-0 p-0">
                                  <div className="w-full max-w-full overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain] [touch-action:pan-x]">
                                    <div className="inline-block min-w-full pr-6">
                                      <Table className="w-max min-w-[1440px]">
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="sticky left-0 z-10 w-[240px] border-r bg-background">
                                              Zaměstnanec
                                            </TableHead>
                                            <TableHead className="w-[240px]">
                                              Pozice
                                            </TableHead>
                                            <TableHead className="w-[240px]">
                                              Odbor / Oddělení
                                            </TableHead>
                                            <TableHead className="w-[140px]">
                                              Plánovaný odchod
                                            </TableHead>
                                            <TableHead className="w-[230px]">
                                              Výpovědní doba
                                            </TableHead>
                                            <TableHead className="w-[180px]">
                                              Kontakt
                                            </TableHead>
                                            <TableHead className="w-[420px] whitespace-nowrap text-right">
                                              Akce
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {monthData.map((e) => (
                                            <DepartureTableRow
                                              key={e.id}
                                              departure={e}
                                              variant="planned"
                                              canManage={canManageOffboarding}
                                              canOpenExitChecklist={
                                                canReadOffboarding
                                              }
                                              isReadonly={isReadonly}
                                              onEdit={() =>
                                                void openEditDialog(
                                                  e,
                                                  "planned"
                                                )
                                              }
                                              onConfirm={() =>
                                                openActualDialogFromPlanned(e)
                                              }
                                              onDelete={() =>
                                                void handleDelete(e)
                                              }
                                              onOpenExitChecklist={() =>
                                                setOpenExitChecklistId(e.id)
                                              }
                                              relatedChanges={
                                                e.personalNumber?.trim()
                                                  ? (employeeChangesByPersonalNumber.get(
                                                      e.personalNumber.trim()
                                                    ) ?? [])
                                                  : []
                                              }
                                              highlighted={
                                                e.id === highlightedDepartureId
                                              }
                                            />
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
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

      {canManageOffboarding && (
        <div className="mt-2 flex justify-end">
          <CombinedReportLauncher
            defaultAudience="ONBOARDING_GROUP"
            defaultKind="planned"
            context="odchody"
            defaultMonth={currentMonth}
          />
        </div>
      )}
    </>
  )

  const actualSectionContent = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {canManageOffboarding ? (
          <Dialog open={openNewActual} onOpenChange={setOpenNewActual}>
            <DialogTrigger asChild>
              <Button className="w-full justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] sm:w-auto">
                Přidat skutečný odchod
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-h-[90vh] max-w-5xl overflow-y-auto p-0"
              onInteractOutside={(event) => event.preventDefault()}
            >
              <DialogTitle className="px-6 pt-6">Skutečný odchod</DialogTitle>
              <div className="p-6">
                <OffboardingFormUnified
                  mode="create-actual"
                  prefillDate={qpDate}
                  excludePersonalNumbers={allPersonalNumbers}
                  onSuccess={async () => {
                    setOpenNewActual(false)
                    showSuccess(
                      "Záznam vytvořen",
                      "Skutečný odchod byl úspěšně přidán."
                    )
                    await reload()
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div />
        )}

        {canManageOffboarding && (
          <div className="w-full sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">
            <DeletedRecordsDialog
              kind="offboarding"
              title="Smazané odchody"
              triggerLabel="Smazané záznamy"
              successEvent="offboarding:deleted"
              onRestore={() => void reload()}
            />
          </div>
        )}
      </div>

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
              Žádné skutečné odchody
            </p>
            <p className="text-sm text-muted-foreground">
              {canManageOffboarding
                ? "Přidejte první záznam pomocí tlačítka výše"
                : "Momentálně zde nejsou žádné záznamy"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 pb-6">
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
                  <div className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                    <CollapsibleTrigger
                      onClick={() => toggleActualYear(year)}
                      className="flex flex-1 items-center gap-2"
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
                              className="flex w-full items-center gap-2 rounded-lg bg-red-50 p-2 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30"
                            >
                              {isMonthExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                              <User className="size-4 text-red-600" />
                              <span className="font-medium">
                                {format(new Date(month + "-01"), "LLLL yyyy", {
                                  locale: cs,
                                })}
                              </span>
                              <Badge variant="outline" className="ml-auto">
                                {monthData.length}
                              </Badge>
                            </CollapsibleTrigger>

                            <CollapsibleContent className="mt-2">
                              <Card className="w-full min-w-0 overflow-hidden">
                                <CardContent className="min-w-0 p-0">
                                  <div className="w-full max-w-full overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain] [touch-action:pan-x]">
                                    <div className="inline-block min-w-full pr-6">
                                      <Table className="w-max min-w-[1440px]">
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="sticky left-0 z-10 w-[240px] border-r bg-background">
                                              Zaměstnanec
                                            </TableHead>
                                            <TableHead className="w-[240px]">
                                              Pozice
                                            </TableHead>
                                            <TableHead className="w-[240px]">
                                              Odbor / Oddělení
                                            </TableHead>
                                            <TableHead className="w-[140px]">
                                              Skutečný odchod
                                            </TableHead>
                                            <TableHead className="w-[230px]">
                                              Výpovědní doba
                                            </TableHead>
                                            <TableHead className="w-[180px]">
                                              Kontakt
                                            </TableHead>
                                            <TableHead className="w-[420px] whitespace-nowrap text-right">
                                              Akce
                                            </TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {monthData.map((e) => (
                                            <DepartureTableRow
                                              key={e.id}
                                              departure={e}
                                              variant="actual"
                                              canManage={canManageOffboarding}
                                              canOpenExitChecklist={
                                                canReadOffboarding
                                              }
                                              isReadonly={isReadonly}
                                              onEdit={() =>
                                                void openEditDialog(e, "actual")
                                              }
                                              onRevert={() =>
                                                setRevertDialog({
                                                  open: true,
                                                  departure: e,
                                                  loading: false,
                                                })
                                              }
                                              onDelete={() =>
                                                void handleDelete(e)
                                              }
                                              onOpenExitChecklist={() =>
                                                setOpenExitChecklistId(e.id)
                                              }
                                              relatedChanges={
                                                e.personalNumber?.trim()
                                                  ? (employeeChangesByPersonalNumber.get(
                                                      e.personalNumber.trim()
                                                    ) ?? [])
                                                  : []
                                              }
                                              highlighted={
                                                e.id === highlightedDepartureId
                                              }
                                            />
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
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

      {canManageOffboarding && (
        <div className="mt-2 flex justify-end">
          <CombinedReportLauncher
            defaultAudience="ALL_EMPLOYEES"
            defaultKind="actual"
            context="odchody"
            defaultMonth={currentMonth}
          />
        </div>
      )}
    </>
  )

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-3 pb-8 sm:px-4 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Odchody zaměstnanců
        </h1>
        <p className="text-muted-foreground">
          Správa plánovaných a skutečných odchodů zaměstnanců
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
              <RangeFacetFilter
                label="Výpovědní doba"
                options={DEPARTURE_PROGRESS_OPTIONS}
                selected={departurePresets}
                onSelectedChange={setDeparturePresets}
                range={departureDayRange}
                onRangeChange={setDepartureDayRange}
              />

              <MonthFilter
                label="Datum odchodu"
                value={departureDateFilter}
                onChange={setDepartureDateFilter}
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
                      DEPARTURE_STATUS_OPTIONS.find((o) => o.value === value)
                        ?.label ?? value,
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
                  key: "progress",
                  label: "Výpovědní doba",
                  values: [
                    ...departurePresets.map((value) => ({
                      value,
                      label:
                        DEPARTURE_PROGRESS_OPTIONS.find(
                          (o) => o.value === value
                        )?.label ?? value,
                    })),
                    ...(isDayRangeActive(departureDayRange)
                      ? [
                          {
                            value: "range",
                            label:
                              [
                                departureDayRange.min != null
                                  ? `od ${departureDayRange.min}`
                                  : null,
                                departureDayRange.max != null
                                  ? `do ${departureDayRange.max}`
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
                      setDepartureDayRange(EMPTY_DAY_RANGE)
                      return
                    }
                    setDeparturePresets((prev) =>
                      prev.filter((v) => v !== value)
                    )
                  },
                },
              ]}
              onClearAll={() => {
                clearAllFacetFilters()
                setDepartureDateFilter("")
                setDeparturePresets([])
                setDepartureDayRange(EMPTY_DAY_RANGE)
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
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as "planned" | "actual")
              }
            >
              <TabsList className="grid w-full grid-cols-2">
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
              </TabsList>

              <TabsContent value="planned" className="mt-4 space-y-4">
                {plannedSectionContent}
              </TabsContent>

              <TabsContent value="actual" className="mt-4 space-y-4">
                {actualSectionContent}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      <Dialog
        open={openActual}
        onOpenChange={(o) => {
          setOpenActual(o)
          if (!o) {
            setActiveRow(null)
            setActualEndInput("")
          }
        }}
      >
        <DialogContent className="max-w-3xl p-0">
          <DialogTitle className="px-6 pt-6">
            Potvrdit skutečný odchod
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
                        Plánovaný odchod:
                      </span>{" "}
                      {format(parseISO(activeRow.plannedEnd), "d.M.yyyy")}
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
                  </div>

                  <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      ✓ Souhlasíte s těmito údaji?
                    </p>
                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                      Před potvrzením odchodu zkontrolujte, zda jsou všechny
                      informace správné. Pokud ne, klikněte na tlačítko
                      &#34;Upravit údaje&#34;.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="inline-flex items-center justify-center gap-2"
                    title="Otevřít formulář k úpravě"
                    onClick={() => {
                      setOpenActual(false)
                      void openEditDialog(activeRow, "planned")
                    }}
                  >
                    <Edit className="size-4" />
                    Upravit údaje
                  </Button>
                </div>

                <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
                  <CardContent className="p-4">
                    <h4 className="mb-3 flex items-center gap-2 font-medium">
                      <CalendarDays className="size-4" />
                      Datum skutečného odchodu
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Input
                          type="date"
                          value={actualEndInput}
                          onChange={(e) => setActualEndInput(e.target.value)}
                          className="max-w-[200px]"
                        />
                        <Button
                          size="sm"
                          className="inline-flex items-center justify-center gap-2 bg-orange-600 text-white hover:bg-orange-700"
                          title="Potvrdit skutečný odchod"
                          onClick={() => void confirmDepartureWithInput()}
                          disabled={!actualEndInput}
                        >
                          <Check className="size-4" />
                          Potvrdit odchod
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
                <DialogTitle>Vrátit odchod do plánovaných</DialogTitle>
                {revertDialog.departure && (
                  <DialogDescription className="font-medium">
                    {[
                      revertDialog.departure.titleBefore,
                      revertDialog.departure.name,
                      revertDialog.departure.surname,
                      revertDialog.departure.titleAfter,
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
              Opravdu chcete vrátit tento odchod zpět do plánovaných? Skutečné
              datum odchodu bude odstraněno a status se změní na Plánovaný a
              přesune se zpět do plánovaných odchodů.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setRevertDialog({
                  open: false,
                  departure: null,
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
              disabled={revertDialog.loading}
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
                {deleteDialog.departure && (
                  <DialogDescription className="font-medium">
                    {[
                      deleteDialog.departure.titleBefore,
                      deleteDialog.departure.name,
                      deleteDialog.departure.surname,
                      deleteDialog.departure.titleAfter,
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

            {deleteDialog.departure?.linkedOnboarding?.exitDuringProbation &&
              deleteDialog.departure?.probationStopDecision === "STOP" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <p className="font-medium">
                    Tento odchod aktuálně pozastavuje zkušební dobu propojeného
                    nástupu
                    {deleteDialog.departure.linkedOnboarding.positionName
                      ? ` (${deleteDialog.departure.linkedOnboarding.positionName})`
                      : ""}
                    . Smazáním záznamu se zkušební doba znovu aktivuje.
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
                  o informační vazbu, smazáním odchodu se nijak nezmění.
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
                  departure: null,
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
              onClick={confirmDelete}
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

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent
          className="max-h-[90vh] max-w-5xl overflow-y-auto p-0"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle className="px-6 pt-6">Upravit záznam</DialogTitle>
          <div className="p-6">
            {editLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                <span className="ml-2 text-muted-foreground">
                  Načítám data...
                </span>
              </div>
            ) : editId != null && editInitial ? (
              <OffboardingFormUnified
                key={`edit-${editId}-${editContext}`}
                id={editId}
                initial={editInitial}
                mode="edit"
                editContext={editContext}
                excludePersonalNumbers={allPersonalNumbers}
                onSuccess={async () => {
                  setOpenEdit(false)
                  setEditId(null)
                  setEditInitial(null)
                  showSuccess("Změny uloženy", "Záznam byl úspěšně upraven.")
                  await reload()
                }}
              />
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Chyba při načítání dat
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {openExitChecklistId != null && (
        <ExitChecklistDialog
          key={openExitChecklistId}
          offboardingId={openExitChecklistId}
          open={true}
        />
      )}

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
