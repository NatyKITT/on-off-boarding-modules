"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
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
  Mail,
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
import { EmployeeDocumentsDialog } from "@/components/common/employee-documents-dialog"
import { MonthlyReportLauncher } from "@/components/emails/monthly-report-launcher"
import { SendEmailButton } from "@/components/emails/send-email-button"
import type {
  FormValues,
  PersonalNumberMeta,
} from "@/components/forms/onboarding-form"
import { OnboardingFormClient } from "@/components/forms/onboarding-form-client"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

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
  userEmail?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
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
    userEmail: d.userEmail ?? "",
    userName: d.userName ?? "",
    personalNumber: d.personalNumber ?? "",
    notes: d.notes ?? "",
    status: d.status,
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

  return raw.map((v) => ({
    id: String((v.id as string | number | undefined) ?? v.num),
    num: String(v.num as string | number),
    name: typeof v.name === "string" ? v.name : "",
    dept_name: typeof v.dept_name === "string" ? v.dept_name : "",
    unit_name: typeof v.unit_name === "string" ? v.unit_name : "",
  }))
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

  const year = dateStr.slice(0, 4)
  const month = dateStr.slice(0, 7)
  return { year, month }
}

export default function OnboardingPage() {
  const sp = useSearchParams()

  const [planned, setPlanned] = useState<Arrival[]>([])
  const [actual, setActual] = useState<Arrival[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

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

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    loading: boolean
  }>({ open: false, arrival: null, loading: false })

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

  const [personalMeta, setPersonalMeta] = useState<
    PersonalNumberMeta | undefined
  >()

  const qpMode = sp.get("new") as "create-planned" | "create-actual" | null
  const qpDate = sp.get("date") || undefined

  const currentMonth = format(new Date(), "yyyy-MM")

  const showSuccess = React.useCallback((title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }, [])

  const showError = React.useCallback((title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }, [])

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const [posRes, onbRes, metaRes] = await Promise.all([
        fetch("/api/systematizace", { cache: "no-store" }),
        fetch("/api/nastupy", { cache: "no-store" }),
        fetch("/api/osobni-cislo/meta", { cache: "no-store" }),
      ])

      const posJson = await posRes.json().catch(() => null)
      const onbJson = await onbRes.json().catch(() => null)
      const metaJson = await metaRes.json().catch(() => null)

      setPositions(normalizePositions(posJson))

      if (onbJson?.status === "success" && Array.isArray(onbJson.data)) {
        const rows = onbJson.data as Arrival[]
        setPlanned(rows.filter((e) => !e.actualStart))
        setActual(rows.filter((e) => e.actualStart))
      } else {
        setPlanned([])
        setActual([])
      }

      if (metaJson?.status === "success") {
        setPersonalMeta(metaJson.data as PersonalNumberMeta)
      } else {
        setPersonalMeta(undefined)
      }
    } catch (error) {
      console.error("Error loading data:", error)
      showError("Chyba při načítání", "Nepodařilo se načíst data")
      setPlanned([])
      setActual([])
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const { year, month } = getLatestYearAndMonth(planned, "plannedStart")
    setExpandedPlannedYears(year ? [year] : [])
    setExpandedPlannedMonths(month ? [month] : [])
  }, [planned])

  useEffect(() => {
    const { year, month } = getLatestYearAndMonth(actual, "actualStart")
    setExpandedActualYears(year ? [year] : [])
    setExpandedActualMonths(month ? [month] : [])
  }, [actual])

  useEffect(() => {
    if (!qpMode) return
    if (qpMode === "create-actual") setOpenNewActual(true)
    else setOpenNewPlanned(true)
  }, [qpMode])

  useEffect(() => {
    const handler = () => {
      void reload()
    }
    window.addEventListener("onboarding:deleted", handler)
    return () => window.removeEventListener("onboarding:deleted", handler)
  }, [reload])

  const plannedGrouped = useMemo(
    () => groupByYearAndMonth(planned, "plannedStart"),
    [planned]
  )

  const actualGrouped = useMemo(
    () => groupByYearAndMonth(actual, "actualStart"),
    [actual]
  )

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

  async function openStartDialogFromPlanned(row: Arrival) {
    setActiveRow(row)
    setActualStartInput(row.plannedStart.slice(0, 10))
    setOpenStart(true)
  }

  async function confirmStartWithInput() {
    if (!activeRow || !actualStartInput) return
    try {
      const res = await fetch(`/api/nastupy/${activeRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStart: actualStartInput,
          status: "COMPLETED",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Potvrzení se nezdařilo")
      }
      setOpenStart(false)
      setActiveRow(null)
      setActualStartInput("")
      showSuccess(
        "Nástup potvrzen",
        `Skutečný nástup pro ${activeRow.name} ${activeRow.surname} byl zaznamenán.`
      )
      await reload()
    } catch (e) {
      showError(
        "Chyba při potvrzování",
        e instanceof Error ? e.message : "Potvrzení se nezdařilo"
      )
    }
  }

  async function handleEdit(arrival: Arrival, context: "planned" | "actual") {
    try {
      const response = await fetch(`/api/nastupy/${arrival.id}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error("Nepodařilo se načíst data záznamu")
      }

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

      setDeleteDialog({ open: false, arrival: null, loading: false })
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
    variant: "planned" | "actual"
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

    return (
      <TableRow>
        <TableCell className="w-[220px]">
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium leading-tight">
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

        <TableCell className="w-[220px]">
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

        <TableCell className="w-[220px]">
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

        <TableCell className="w-[160px] whitespace-nowrap">
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

        <TableCell className="w-[220px]">
          {hasProbation ? (
            <ProbationProgressBar
              startDate={
                variant === "planned"
                  ? arrival.plannedStart
                  : (arrival.actualStart as string)
              }
              probationEndDate={arrival.probationEnd as string}
              variant={variant === "planned" ? "planned" : "actual"}
              size="sm"
              label="Zkušební doba"
            />
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          )}
        </TableCell>

        <TableCell className="w-[220px] whitespace-nowrap">
          <div className="flex items-center gap-1">
            <Mail className="size-4 text-muted-foreground" />
            <span className="truncate text-sm" title={arrival.email}>
              {arrival.email}
            </span>
          </div>
        </TableCell>

        <TableCell className="w-[260px] whitespace-nowrap text-right">
          <div className="flex justify-end gap-1">
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

            <SendEmailButton
              id={arrival.id}
              kind="onboarding"
              email={arrival.email}
              onDone={() => void reload()}
              onEditRequest={() => handleEdit(arrival, variant)}
              className="inline-flex items-center justify-center gap-1"
            />

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEdit(arrival, variant)}
              title="Upravit záznam"
              className="inline-flex items-center justify-center gap-1"
            >
              <Edit className="size-4" />
              <span className="hidden pt-1.5 sm:inline">Upravit</span>
            </Button>

            {variant === "planned" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => openStartDialogFromPlanned(arrival)}
                title="Potvrdit skutečný nástup"
                className="inline-flex items-center justify-center gap-1 bg-green-600 text-white hover:bg-green-700"
              >
                <Check className="size-4" />
                <span className="hidden pt-1.5 sm:inline">Nastoupil</span>
              </Button>
            )}

            <EmployeeDocumentsDialog
              onboardingId={arrival.id}
              email={arrival.email}
              employeeName={fullName}
              onSent={() => {
                showSuccess(
                  "E-mail odeslán",
                  "Odkazy na vybrané dokumenty byly odeslány zaměstnanci."
                )
                void reload()
              }}
            />

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDeleteDialog({
                  open: true,
                  arrival,
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Nástupy zaměstnanců
        </h1>
        <p className="text-muted-foreground">
          Správa plánovaných a skutečných nástupů zaměstnanců
        </p>
      </div>

      <Tabs defaultValue="planned" className="flex flex-col gap-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="planned" className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            Plánované
          </TabsTrigger>
          <TabsTrigger value="actual" className="flex items-center gap-2">
            <User className="size-4" />
            Skutečné
          </TabsTrigger>
        </TabsList>

        {/* PLANNED TAB */}
        <TabsContent value="planned" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
              <DialogTrigger asChild>
                <Button className="inline-flex items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]">
                  Přidat plánovaný nástup
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
                <DialogTitle className="px-6 pt-6">
                  Nový plánovaný nástup
                </DialogTitle>
                <div className="p-6">
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

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
              <span className="ml-2 text-muted-foreground">
                Načítám data...
              </span>
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
            <div className="space-y-4 pb-2">
              {Object.keys(plannedGrouped)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .map((year) => {
                  const yearData = plannedGrouped[year]
                  const isYearExpanded = expandedPlannedYears.includes(year)
                  const yearTotal = Object.values(yearData).reduce(
                    (sum, arr) => sum + arr.length,
                    0
                  )

                  return (
                    <Collapsible key={year} open={isYearExpanded}>
                      <CollapsibleTrigger
                        onClick={() => togglePlannedYear(year)}
                        className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
                      >
                        {isYearExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                        <span className="text-lg font-semibold">{year}</span>
                        <Badge variant="secondary" className="ml-auto">
                          {yearTotal}
                        </Badge>
                      </CollapsibleTrigger>

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
                                  className="flex w-full items-center gap-2 rounded-lg bg-blue-50 p-2 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
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
                                      { locale: cs }
                                    )}
                                  </span>
                                  <Badge variant="outline" className="ml-auto">
                                    {monthData.length}
                                  </Badge>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="mt-2">
                                  <Card className="w-full overflow-hidden">
                                    <CardContent className="p-0">
                                      <div className="w-full overflow-x-auto">
                                        <Table className="w-max min-w-[1200px]">
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[220px]">
                                                Zaměstnanec
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Pozice
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Odbor / Oddělení
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Plánovaný nástup
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Zkušební doba
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Kontakt
                                              </TableHead>
                                              <TableHead className="w-[220px] text-right">
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

          <div className="mt-2 flex justify-end">
            <MonthlyReportLauncher
              initialType="nastupy"
              kind="planned"
              defaultMonth={currentMonth}
            />
          </div>
        </TabsContent>

        {/* ACTUAL TAB */}
        <TabsContent value="actual" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Dialog open={openNewActual} onOpenChange={setOpenNewActual}>
              <DialogTrigger asChild>
                <Button className="inline-flex items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]">
                  Přidat skutečný nástup
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
                <DialogTitle className="px-6 pt-6">Skutečný nástup</DialogTitle>
                <div className="p-6">
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

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
              <span className="ml-2 text-muted-foreground">
                Načítám data...
              </span>
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
            <div className="space-y-4 pb-2">
              {Object.keys(actualGrouped)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .map((year) => {
                  const yearData = actualGrouped[year]
                  const isYearExpanded = expandedActualYears.includes(year)
                  const yearTotal = Object.values(yearData).reduce(
                    (sum, arr) => sum + arr.length,
                    0
                  )

                  return (
                    <Collapsible key={year} open={isYearExpanded}>
                      <CollapsibleTrigger
                        onClick={() => toggleActualYear(year)}
                        className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
                      >
                        {isYearExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                        <span className="text-lg font-semibold">{year}</span>
                        <Badge variant="secondary" className="ml-auto">
                          {yearTotal}
                        </Badge>
                      </CollapsibleTrigger>

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
                                  className="flex w-full items-center gap-2 rounded-lg bg-green-50 p-2 transition-colors hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30"
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
                                      { locale: cs }
                                    )}
                                  </span>
                                  <Badge variant="outline" className="ml-auto">
                                    {monthData.length}
                                  </Badge>
                                </CollapsibleTrigger>

                                <CollapsibleContent className="mt-2">
                                  <Card className="w-full overflow-hidden">
                                    <CardContent className="p-0">
                                      <div className="w-full overflow-x-auto">
                                        <Table className="w-max min-w-[1200px]">
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[220px]">
                                                Zaměstnanec
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Pozice
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Odbor / Oddělení
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Skutečný nástup
                                              </TableHead>
                                              <TableHead className="w-[220px]">
                                                Zkušební doba
                                              </TableHead>
                                              <TableHead className="whitespace-nowrap">
                                                Kontakt
                                              </TableHead>
                                              <TableHead className="w-[220px] text-right">
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

          <div className="mt-2 flex justify-end">
            <MonthlyReportLauncher
              initialType="nastupy"
              kind="actual"
              defaultMonth={currentMonth}
            />
          </div>
        </TabsContent>
      </Tabs>

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
                          disabled={!actualStartInput}
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

          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Opravdu chcete smazat tento záznam? Tato akce je nevratná.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialog({
                  open: false,
                  arrival: null,
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogTitle className="px-6 pt-6">Upravit záznam</DialogTitle>
          <div className="p-6">
            {editData ? (
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
