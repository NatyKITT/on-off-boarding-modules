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
  FileText,
  History as HistoryIcon,
  RotateCcw,
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
import { ExitChecklistDialog } from "@/components/common/exit-checklist-dialog"
import { MonthlyReportLauncher } from "@/components/emails/monthly-report-launcher"
import { SendEmailButton } from "@/components/emails/send-email-button"
import {
  FormValues,
  OffboardingFormUnified,
} from "@/components/forms/offboarding-form"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

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

interface DepartureTableRowProps {
  departure: Departure
  variant: "planned" | "actual"
  onEdit: () => void
  onConfirm?: () => void
  onRevert?: () => void
  onDelete: () => void
  onReload: () => Promise<void>
  onOpenExitChecklist: () => void
}

const DepartureTableRow: React.FC<DepartureTableRowProps> = ({
  departure,
  variant,
  onEdit,
  onConfirm,
  onDelete,
  onRevert,
  onReload,
  onOpenExitChecklist,
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
    <TableRow>
      <TableCell className="w-[200px]">
        <div className="flex items-center gap-2">
          <User className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-medium">{fullName}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {departure.personalNumber}
            </span>
          </div>
        </div>
      </TableCell>

      <TableCell className="w-[180px]">
        <div className="flex flex-col">
          <span className="text-sm font-medium" title={departure.positionName}>
            {departure.positionName}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {departure.positionNum}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-[150px]">
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

      <TableCell className="w-[180px]">
        <DepartureProgressBar
          targetDate={
            variant === "planned"
              ? departure.plannedEnd
              : (departure.actualEnd as string)
          }
          variant={variant}
          label={
            variant === "planned"
              ? "Do plánovaného odchodu"
              : "Od skutečného odchodu"
          }
        />
      </TableCell>

      <TableCell className="w-[180px]">
        <div className="flex flex-col">
          <span
            className="truncate text-sm"
            title={departure.userEmail || undefined}
          >
            {departure.userEmail ?? "–"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {departure.userName ?? "–"}
          </span>
        </div>
      </TableCell>

      <TableCell className="w-[420px] whitespace-nowrap text-right">
        <div className="flex justify-end gap-1">
          <HistoryDialog
            id={departure.id}
            kind="offboarding"
            trigger={
              <Button size="sm" variant="outline" title="Historie změn">
                <HistoryIcon className="size-4" />
              </Button>
            }
          />

          <Button
            size="sm"
            variant="outline"
            onClick={onOpenExitChecklist}
            title="Výstupní list"
          >
            <FileText className="size-4" />
          </Button>

          <SendEmailButton
            id={departure.id}
            kind="offboarding"
            email={departure.userEmail ?? undefined}
            onDone={onReload}
            onEditRequest={onEdit}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            title="Upravit záznam"
          >
            <Edit className="size-4" />
            <span className="ml-1 hidden sm:inline">Upravit</span>
          </Button>

          {variant === "planned" && onConfirm ? (
            <Button
              size="sm"
              variant="default"
              onClick={onConfirm}
              title="Potvrdit skutečný odchod"
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Check className="size-4" />
              <span className="ml-1 hidden sm:inline">Odešel</span>
            </Button>
          ) : variant === "actual" && onRevert ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRevert}
              title="Vrátit zpět do plánovaných"
              className="text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950"
            >
              <RotateCcw className="size-4" />
              <span className="ml-1 hidden whitespace-nowrap sm:inline">
                Vrátit zpět do plánovaných
              </span>
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
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

export default function OffboardingPage() {
  const sp = useSearchParams()

  const [planned, setPlanned] = useState<Departure[]>([])
  const [actual, setActual] = useState<Departure[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
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
    loading: boolean
  }>({ open: false, departure: null, loading: false })

  const [expandedPlannedYears, setExpandedPlannedYears] = useState<string[]>([])
  const [expandedPlannedMonths, setExpandedPlannedMonths] = useState<string[]>(
    []
  )
  const [expandedActualYears, setExpandedActualYears] = useState<string[]>([])
  const [expandedActualMonths, setExpandedActualMonths] = useState<string[]>([])

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

  const currentMonth = format(new Date(), "yyyy-MM")

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

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const [posRes, offRes] = await Promise.all([
        fetch("/api/systematizace", { cache: "no-store" }),
        fetch("/api/odchody", { cache: "no-store" }),
      ])
      const posJson = await posRes.json().catch(() => null)
      const offJson = await offRes.json().catch(() => null)

      setPositions(normalizePositions(posJson))

      if (offJson?.status === "success" && Array.isArray(offJson.data)) {
        const rows = offJson.data as Departure[]
        setPlanned(rows.filter((e) => !e.actualEnd))
        setActual(rows.filter((e) => e.actualEnd))
      } else {
        setPlanned([])
        setActual([])
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
    const { year, month } = getLatestYearAndMonth(planned, "plannedEnd")
    setExpandedPlannedYears(year ? [year] : [])
    setExpandedPlannedMonths(month ? [month] : [])
  }, [planned])

  useEffect(() => {
    const { year, month } = getLatestYearAndMonth(actual, "actualEnd")
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

  const plannedGrouped = useMemo(
    () => groupByYearAndMonth(planned, "plannedEnd"),
    [planned]
  )

  const actualGrouped = useMemo(
    () => groupByYearAndMonth(actual, "actualEnd"),
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

  function openActualDialogFromPlanned(row: Departure) {
    setActiveRow(row)
    setActualEndInput(row.plannedEnd.slice(0, 10))
    setOpenActual(true)
  }

  async function confirmDepartureWithInput() {
    if (!activeRow || !actualEndInput) return
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
    if (!departure) return

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
    setEditContext(context)
    setEditId(row.id)
    setEditLoading(true)

    if (!positions.length) {
      try {
        const posRes = await fetch("/api/systematizace", { cache: "no-store" })
        const posJson = await posRes.json().catch(() => null)
        setPositions(normalizePositions(posJson))
      } catch (error) {
        console.error("Error loading positions:", error)
      }
    }

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
    setDeleteDialog({
      open: true,
      departure,
      loading: false,
    })
  }

  async function confirmDelete() {
    const departure = deleteDialog.departure
    if (!departure) return

    setDeleteDialog((prev) => ({ ...prev, loading: true }))

    try {
      const res = await fetch(`/api/odchody/${departure.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Smazání se nezdařilo.")
      }

      setDeleteDialog({ open: false, departure: null, loading: false })
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
          Odchody zaměstnanců
        </h1>
        <p className="text-muted-foreground">
          Správa plánovaných a skutečných odchodů zaměstnanců
        </p>
      </div>

      <Tabs defaultValue="planned">
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

        <TabsContent value="planned" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
              <DialogTrigger asChild>
                <Button className="w-full justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] sm:w-auto">
                  Přidat plánovaný odchod
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
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

            <div className="w-full sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">
              <DeletedRecordsDialog
                kind="offboarding"
                title="Smazané odchody"
                triggerLabel="Smazané záznamy"
                successEvent="offboarding:deleted"
                onRestore={() => void reload()}
              />
            </div>
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
                  Žádné plánované odchody
                </p>
                <p className="text-sm text-muted-foreground">
                  Přidejte první záznam pomocí tlačítka výše
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
                                  className="flex w-full items-center gap-2 rounded-lg bg-orange-50 p-2 transition-colors hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30"
                                >
                                  {isMonthExpanded ? (
                                    <ChevronDown className="size-4" />
                                  ) : (
                                    <ChevronRight className="size-4" />
                                  )}
                                  <CalendarDays className="size-4 text-orange-600" />
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
                                  <Card className="w-full min-w-0 overflow-hidden">
                                    <CardContent className="min-w-0 p-0">
                                      <div
                                        className="w-full max-w-full overflow-x-auto overflow-y-hidden
                                          [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain]
                                          [touch-action:pan-x]
                                        "
                                      >
                                        <div className="inline-block min-w-full pr-6">
                                          <Table className="w-max min-w-[1320px]">
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="w-[200px]">
                                                  Zaměstnanec
                                                </TableHead>
                                                <TableHead className="w-[180px]">
                                                  Pozice
                                                </TableHead>
                                                <TableHead className="w-[150px]">
                                                  Odbor / Oddělení
                                                </TableHead>
                                                <TableHead className="w-[140px]">
                                                  Plánovaný odchod
                                                </TableHead>
                                                <TableHead className="w-[180px]">
                                                  Průběh
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
                                                  onEdit={() =>
                                                    void openEditDialog(
                                                      e,
                                                      "planned"
                                                    )
                                                  }
                                                  onConfirm={() =>
                                                    openActualDialogFromPlanned(
                                                      e
                                                    )
                                                  }
                                                  onDelete={() =>
                                                    void handleDelete(e)
                                                  }
                                                  onReload={reload}
                                                  onOpenExitChecklist={() =>
                                                    setOpenExitChecklistId(e.id)
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

          <div className="mt-2 flex justify-end">
            <MonthlyReportLauncher
              initialType="odchody"
              kind="planned"
              defaultMonth={currentMonth}
            />
          </div>
        </TabsContent>

        <TabsContent value="actual" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Dialog open={openNewActual} onOpenChange={setOpenNewActual}>
              <DialogTrigger asChild>
                <Button className="w-full justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] sm:w-auto">
                  Přidat skutečný odchod
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
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

            <div className="w-full sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">
              <DeletedRecordsDialog
                kind="offboarding"
                title="Smazané odchody"
                triggerLabel="Smazané záznamy"
                successEvent="offboarding:deleted"
                onRestore={() => void reload()}
              />
            </div>
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
                  Žádné skutečné odchody
                </p>
                <p className="text-sm text-muted-foreground">
                  Přidejte první záznam pomocí tlačítka výše
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
                                  className="flex w-full items-center gap-2 rounded-lg bg-red-50 p-2 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30"
                                >
                                  {isMonthExpanded ? (
                                    <ChevronDown className="size-4" />
                                  ) : (
                                    <ChevronRight className="size-4" />
                                  )}
                                  <User className="size-4 text-red-600" />
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
                                  <Card className="w-full min-w-0 overflow-hidden">
                                    <CardContent className="min-w-0 p-0">
                                      <div
                                        className="w-full max-w-full overflow-x-auto overflow-y-hidden
                                          [-webkit-overflow-scrolling:touch] [overscroll-behavior-x:contain]
                                          [touch-action:pan-x]
                                        "
                                      >
                                        <div className="inline-block min-w-full pr-6">
                                          <Table className="w-max min-w-[1320px]">
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="w-[200px]">
                                                  Zaměstnanec
                                                </TableHead>
                                                <TableHead className="w-[180px]">
                                                  Pozice
                                                </TableHead>
                                                <TableHead className="w-[150px]">
                                                  Odbor / Oddělení
                                                </TableHead>
                                                <TableHead className="w-[140px]">
                                                  Skutečný odchod
                                                </TableHead>
                                                <TableHead className="w-[180px]">
                                                  Průběh
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
                                                  onEdit={() =>
                                                    void openEditDialog(
                                                      e,
                                                      "actual"
                                                    )
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
                                                  onReload={reload}
                                                  onOpenExitChecklist={() =>
                                                    setOpenExitChecklistId(e.id)
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

          <div className="mt-2 flex justify-end">
            <MonthlyReportLauncher
              initialType="odchody"
              kind="actual"
              defaultMonth={currentMonth}
            />
          </div>
        </TabsContent>
      </Tabs>

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
                  departure: null,
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
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
        <ExitChecklistDialog offboardingId={openExitChecklistId} open={true} />
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
