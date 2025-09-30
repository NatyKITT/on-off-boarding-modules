"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle,
  Clock,
  Edit,
  History as HistoryIcon,
  Mail,
  Trash2,
  User,
  XCircle,
} from "lucide-react"

import { type Position } from "@/types/position"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
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
import { MonthlySummaryButton } from "@/components/emails/monthly-summary-button"
import { SendEmailButton } from "@/components/emails/send-email-button"
import {
  FormValues,
  OnboardingFormUnified,
} from "@/components/forms/onboarding-form"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

/* ------------------------------ types ------------------------------- */
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

/* ----------------------- Modal Components ----------------------- */
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

/* ----------------------- Position Normalizer ----------------------- */
type RawPos =
  | {
      id?: string | number
      num?: unknown
      name?: unknown
      dept_name?: unknown
      unit_name?: unknown
    }
  | null
  | undefined

function isRawPos(v: unknown): v is RawPos {
  if (v == null || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return "num" in o
}

function toPosition(v: RawPos): Position | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const num = o.num
  if (typeof num !== "string" && typeof num !== "number") return null
  const id = o.id
  const name = o.name
  const dept = o.dept_name
  const unit = o.unit_name
  return {
    id: String(id ?? num),
    num: String(num),
    name: typeof name === "string" ? name : "",
    dept_name: typeof dept === "string" ? dept : "",
    unit_name: typeof unit === "string" ? unit : "",
  }
}

function normalizePositions(payload: unknown): Position[] {
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []

  return arr
    .filter(isRawPos)
    .map(toPosition)
    .filter((x): x is Position => Boolean(x))
}

/* ----------------------------- Main Page ----------------------------- */
export default function OnboardingPage() {
  const sp = useSearchParams()

  const [planned, setPlanned] = useState<Arrival[]>([])
  const [actual, setActual] = useState<Arrival[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  // dialogy pro formuláře
  const [openNewPlanned, setOpenNewPlanned] = useState(false)
  const [openNewActual, setOpenNewActual] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [editData, setEditData] = useState<{
    id: number
    initial: Partial<FormValues>
    context: "planned" | "actual"
  } | null>(null)

  // dialogy pro akce
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    loading: boolean
  }>({ open: false, arrival: null, loading: false })

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    arrival: Arrival | null
    loading: boolean
  }>({ open: false, arrival: null, loading: false })

  // Stavy pro modaly
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

  const qpMode = sp.get("new") as "create-planned" | "create-actual" | null
  const qpDate = sp.get("date") || undefined

  // Callbacks pro modaly
  const showSuccess = (title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }

  const showError = (title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      const [posRes, onbRes] = await Promise.all([
        fetch("/api/systematizace", { cache: "no-store" }),
        fetch("/api/nastupy", { cache: "no-store" }),
      ])
      const posJson = await posRes.json().catch(() => null)
      const onbJson = await onbRes.json().catch(() => null)

      setPositions(normalizePositions(posJson))

      if (onbJson?.status === "success" && Array.isArray(onbJson.data)) {
        const rows = onbJson.data as Arrival[]
        setPlanned(rows.filter((e) => !e.actualStart))
        setActual(rows.filter((e) => e.actualStart))
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
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

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

  const thisMonth = format(new Date(), "yyyy-MM")

  const defaultPlannedMonth = useMemo(() => {
    const has = planned.find((e) => e.plannedStart?.slice(0, 7) === thisMonth)
    return (
      has?.plannedStart?.slice(0, 7) ??
      planned[0]?.plannedStart?.slice(0, 7) ??
      ""
    )
  }, [planned, thisMonth])

  const plannedMonths = useMemo(
    () => Array.from(new Set(planned.map((e) => e.plannedStart.slice(0, 7)))),
    [planned]
  )

  const actualMonths = useMemo(
    () =>
      Array.from(
        new Set(
          actual
            .map((e) => e.actualStart?.slice(0, 7))
            .filter(Boolean) as string[]
        )
      ),
    [actual]
  )

  const defaultActualMonth = useMemo(() => {
    const has = actual.find((e) => e.actualStart?.slice(0, 7) === thisMonth)
    return has?.actualStart?.slice(0, 7) ?? actualMonths[0] ?? ""
  }, [actual, actualMonths, thisMonth])

  // editace záznamu
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

  // potvrzení nástupu (přesun z plánovaného do skutečného)
  async function handleConfirmArrival(actualStartDate: string) {
    const arrival = confirmDialog.arrival
    if (!arrival) return

    setConfirmDialog((prev) => ({ ...prev, loading: true }))

    try {
      const response = await fetch(`/api/nastupy/${arrival.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStart: actualStartDate,
          status: "COMPLETED",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message ?? "Potvrzení se nezdařilo")
      }

      setConfirmDialog({ open: false, arrival: null, loading: false })
      showSuccess(
        "Nástup potvrzen",
        `Skutečný nástup pro ${arrival.name} ${arrival.surname} byl úspěšně zaznamenán a přesunut do skutečných nástupů.`
      )
      await reload()
    } catch (error) {
      console.error("Error confirming arrival:", error)
      showError(
        "Chyba při potvrzování",
        error instanceof Error ? error.message : "Potvrzení se nezdařilo"
      )
      setConfirmDialog((prev) => ({ ...prev, loading: false }))
    }
  }

  // smazání záznamu
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

  // sort podle data + času
  const sortByStart = (a: Arrival, b: Arrival) => {
    const dateA = new Date(a.actualStart || a.plannedStart).getTime()
    const dateB = new Date(b.actualStart || b.plannedStart).getTime()
    if (dateA !== dateB) return dateA - dateB
    const tA = a.startTime || "00:00"
    const tB = b.startTime || "00:00"
    return tA.localeCompare(tB)
  }

  // řádek tabulky
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
      <TableRow key={arrival.id}>
        {/* Zaměstnanec */}
        <TableCell className="w-[220px]">
          <div className="flex items-start gap-2">
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight">
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

        {/* Pozice */}
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

        {/* Odbor / Oddělení */}
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

        {/* (Plánovaný/Skutečný) nástup + čas */}
        <TableCell className="w-[160px]">
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

        {/* Zkušební doba */}
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

        {/* Kontakt */}
        <TableCell className="w-[220px]">
          <div className="flex items-center gap-1">
            <Mail className="size-4 text-muted-foreground" />
            <span className="truncate text-sm" title={arrival.email}>
              {arrival.email}
            </span>
          </div>
        </TableCell>

        {/* Firemní údaje */}
        <TableCell className="w-[220px]">
          <div className="flex flex-col space-y-0.5">
            {arrival.personalNumber && (
              <span className="font-mono text-xs text-muted-foreground">
                #{arrival.personalNumber}
              </span>
            )}
            {arrival.userName && (
              <span className="truncate text-xs" title={arrival.userName}>
                {arrival.userName}
              </span>
            )}
            {arrival.userEmail && (
              <span
                className="truncate text-xs text-muted-foreground"
                title={arrival.userEmail}
              >
                {arrival.userEmail}
              </span>
            )}
          </div>
        </TableCell>

        {/* Akce */}
        <TableCell className="w-[200px] text-right">
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
                onClick={() =>
                  setConfirmDialog({
                    open: true,
                    arrival,
                    loading: false,
                  })
                }
                title="Potvrdit skutečný nástup"
                className="inline-flex items-center justify-center gap-1 bg-green-600 text-white hover:bg-green-700"
              >
                <Check className="size-4" />
                <span className="hidden pt-1.5 sm:inline">Nastoupil</span>
              </Button>
            )}

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
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Nástupy zaměstnanců
        </h1>
        <p className="text-muted-foreground">
          Správa plánovaných a skutečných nástupů zaměstnanců
        </p>
      </div>

      <Tabs
        defaultValue="planned"
        className="flex h-[calc(100vh-160px)] flex-col"
      >
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

        <div className="min-h-0 flex-1 overflow-auto">
          {/* ---------- PLANNED TAB ---------- */}
          <TabsContent value="planned" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
                <DialogTrigger asChild>
                  <Button className="inline-flex items-center justify-center gap-2">
                    Přidat plánovaný nástup
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
                  <DialogTitle className="px-6 pt-6">
                    Nový plánovaný nástup
                  </DialogTitle>
                  <div className="p-6">
                    <OnboardingFormUnified
                      positions={positions}
                      mode="create-planned"
                      prefillDate={qpDate}
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

              {/* 🔵 Jedno tlačítko: smazané záznamy (plánované i skutečné) */}
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
            ) : planned.length === 0 ? (
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
              <div className="space-y-4">
                <Accordion
                  type="multiple"
                  defaultValue={
                    defaultPlannedMonth ? [defaultPlannedMonth] : []
                  }
                >
                  {[
                    ...new Set(planned.map((e) => e.plannedStart.slice(0, 7))),
                  ].map((month) => (
                    <AccordionItem
                      key={month}
                      value={month}
                      className="rounded-xl border"
                      style={{ backgroundColor: "#3b82f61A" }}
                    >
                      <AccordionTrigger className="rounded-xl px-4 hover:no-underline data-[state=open]:bg-white/60 dark:data-[state=open]:bg-black/20">
                        <div className="flex items-center gap-3">
                          <CalendarDays className="size-5" />
                          <span className="font-semibold">
                            {format(new Date(`${month}-01`), "LLLL yyyy", {
                              locale: cs,
                            })}
                          </span>
                          <Badge variant="secondary" className="ml-auto">
                            {
                              planned.filter((e) =>
                                e.plannedStart.startsWith(month)
                              ).length
                            }
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Card className="border-muted shadow-sm">
                          <CardContent className="px-0">
                            <div className="overflow-x-auto">
                              <Table className="min-w-[1600px]">
                                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                  <TableRow>
                                    <TableHead className="w-[240px]">
                                      Zaměstnanec
                                    </TableHead>
                                    <TableHead className="w-[180px]">
                                      Pozice
                                    </TableHead>
                                    <TableHead className="w-[150px]">
                                      Odbor / Oddělení
                                    </TableHead>
                                    <TableHead className="w-[120px]">
                                      Plánovaný nástup
                                    </TableHead>
                                    <TableHead className="w-[100px]">
                                      Zkušební doba
                                    </TableHead>
                                    <TableHead className="w-[140px]">
                                      Kontakt
                                    </TableHead>
                                    <TableHead className="w-[140px]">
                                      Firemní údaje
                                    </TableHead>
                                    <TableHead className="w-[200px]">
                                      Akce
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {planned
                                    .filter((e) =>
                                      e.plannedStart.startsWith(month)
                                    )
                                    .sort(sortByStart)
                                    .map((e) => (
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
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            {/* 🔵 Report plánovaných – dole vpravo (modré) */}
            <div className="mt-6 flex justify-end">
              <MonthlySummaryButton
                candidateMonths={useMemo(() => plannedMonths, [plannedMonths])}
                defaultMonth={defaultPlannedMonth || thisMonth}
                label="Zaslat měsíční report"
                className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
                onDone={() => {
                  showSuccess(
                    "Report odeslán",
                    "Měsíční report plánovaných nástupů byl odeslán."
                  )
                  void reload()
                }}
              />
            </div>
          </TabsContent>

          {/* ---------- ACTUAL TAB ---------- */}
          <TabsContent value="actual" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Dialog open={openNewActual} onOpenChange={setOpenNewActual}>
                <DialogTrigger asChild>
                  <Button className="inline-flex items-center justify-center gap-2">
                    Přidat skutečný nástup
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
                  <DialogTitle className="px-6 pt-6">
                    Skutečný nástup
                  </DialogTitle>
                  <div className="p-6">
                    <OnboardingFormUnified
                      positions={positions}
                      mode="create-actual"
                      prefillDate={qpDate}
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

              {/* 🟢 Stejné jediné tlačítko: smazané záznamy (plánované i skutečné) */}
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
            ) : actual.length === 0 ? (
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
              <div className="space-y-4">
                <Accordion
                  type="multiple"
                  defaultValue={defaultActualMonth ? [defaultActualMonth] : []}
                >
                  {actualMonths.map((month) => (
                    <AccordionItem
                      key={month}
                      value={month}
                      className="rounded-xl border"
                      style={{ backgroundColor: "#22c55e1A" }}
                    >
                      <AccordionTrigger className="rounded-xl px-4 hover:no-underline data-[state=open]:bg-white/60 dark:data-[state=open]:bg-black/20">
                        <div className="flex items-center gap-3">
                          <User className="size-5" />
                          <span className="font-semibold">
                            {format(new Date(`${month}-01`), "LLLL yyyy", {
                              locale: cs,
                            })}
                          </span>
                          <Badge variant="secondary" className="ml-auto">
                            {
                              actual.filter((e) =>
                                e.actualStart?.startsWith(month)
                              ).length
                            }
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Card className="border-muted shadow-sm">
                          <CardContent className="px-0">
                            <div className="overflow-x-auto">
                              <Table className="min-w-[1600px]">
                                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                  <TableRow>
                                    <TableHead className="w-[240px]">
                                      Zaměstnanec
                                    </TableHead>
                                    <TableHead className="w-[180px]">
                                      Pozice
                                    </TableHead>
                                    <TableHead className="w-[150px]">
                                      Odbor / Oddělení
                                    </TableHead>
                                    <TableHead className="w-[120px]">
                                      Skutečný nástup
                                    </TableHead>
                                    <TableHead className="w-[100px]">
                                      Zkušební doba
                                    </TableHead>
                                    <TableHead className="w-[140px]">
                                      Kontakt
                                    </TableHead>
                                    <TableHead className="w-[140px]">
                                      Firemní údaje
                                    </TableHead>
                                    <TableHead className="w-[200px]">
                                      Akce
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {actual
                                    .filter((e) =>
                                      e.actualStart?.startsWith(month)
                                    )
                                    .sort((a, b) => {
                                      const da = new Date(
                                        a.actualStart || ""
                                      ).getTime()
                                      const db = new Date(
                                        b.actualStart || ""
                                      ).getTime()
                                      return db - da
                                    })
                                    .map((e) => (
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
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <MonthlySummaryButton
                candidateMonths={useMemo(() => actualMonths, [actualMonths])}
                defaultMonth={defaultActualMonth || thisMonth}
                label="Zaslat měsíční report"
                className="inline-flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700"
                onDone={() => {
                  showSuccess(
                    "Report odeslán",
                    "Měsíční report skutečných nástupů byl odeslán."
                  )
                  void reload()
                }}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* ---------- Dialog pro potvrzení nástupu ---------- */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <Check className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <DialogTitle>Potvrdit skutečný nástup</DialogTitle>
                <DialogDescription>
                  Přenést z plánovaných do skutečných nástupů
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {confirmDialog.arrival && (
            <div className="space-y-4">
              {/* Informace o zaměstnanci */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-medium">
                  <User className="size-4" />
                  Informace o zaměstnanci
                </h4>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Jméno:
                    </span>{" "}
                    {[
                      confirmDialog.arrival.titleBefore,
                      confirmDialog.arrival.name,
                      confirmDialog.arrival.surname,
                      confirmDialog.arrival.titleAfter,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      E-mail:
                    </span>{" "}
                    {confirmDialog.arrival.email}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Pozice:
                    </span>{" "}
                    {confirmDialog.arrival.positionName}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Odbor:
                    </span>{" "}
                    {confirmDialog.arrival.department}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Oddělení:
                    </span>{" "}
                    {confirmDialog.arrival.unitName}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Plánovaný nástup:
                    </span>{" "}
                    {format(
                      new Date(confirmDialog.arrival.plannedStart),
                      "d.M.yyyy"
                    )}{" "}
                    {confirmDialog.arrival.startTime || ""}
                  </div>
                  {confirmDialog.arrival.notes && (
                    <div className="md:col-span-2">
                      <span className="font-medium text-muted-foreground">
                        Poznámka:
                      </span>{" "}
                      {confirmDialog.arrival.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* Datum skutečného nástupu */}
              <div className="space-y-3">
                <Label htmlFor="actualStartDate">
                  Datum skutečného nástupu
                </Label>
                <Input
                  id="actualStartDate"
                  type="date"
                  defaultValue={confirmDialog.arrival.plannedStart.slice(0, 10)}
                  className="max-w-[200px]"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog({ open: false, arrival: null, loading: false })
              }
              disabled={confirmDialog.loading}
            >
              Zrušit
            </Button>
            <Button
              onClick={() => {
                const input = document.getElementById(
                  "actualStartDate"
                ) as HTMLInputElement
                const actualStartDate = input?.value
                if (actualStartDate) {
                  handleConfirmArrival(actualStartDate)
                }
              }}
              disabled={confirmDialog.loading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              {confirmDialog.loading && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              <Check className="size-4" />
              Potvrdit nástup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog pro smazání ---------- */}
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
                setDeleteDialog({ open: false, arrival: null, loading: false })
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

      {/* ---------- Dialog pro editaci ---------- */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogTitle className="px-6 pt-6">Upravit záznam</DialogTitle>
          <div className="p-6">
            {editData ? (
              <OnboardingFormUnified
                key={`edit-${editData.id}-${editData.context}`}
                positions={positions}
                id={editData.id}
                initial={editData.initial}
                mode="edit"
                editContext={editData.context}
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

      {/* Success Modal */}
      <SuccessModal
        open={successModal.open}
        onOpenChange={(open) => setSuccessModal((prev) => ({ ...prev, open }))}
        title={successModal.title}
        message={successModal.message}
      />

      {/* Error Modal */}
      <ErrorModal
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  )
}
