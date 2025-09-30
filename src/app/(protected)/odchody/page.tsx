"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  CalendarDays,
  Check,
  CheckCircle,
  Clock,
  Edit,
  History as HistoryIcon,
  Printer,
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
import { DepartureProgressBar } from "@/components/ui/departure-progress-bar"
import {
  Dialog,
  DialogContent,
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
import { MonthlySummaryButton } from "@/components/emails/monthly-summary-button"
import { SendEmailButton } from "@/components/emails/send-email-button"
import {
  FormValues,
  OffboardingFormUnified,
} from "@/components/forms/offboarding-form"
import { DeletedRecordsDialog } from "@/components/history/deleted-records-dialog"
import { HistoryDialog } from "@/components/history/history-dialog" /* ------------------------------ types ------------------------------- */

/* ------------------------------ types ------------------------------- */
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
    noticeFiled: d.noticeEnd ? d.noticeEnd.slice(0, 10) : "",
    noticeEnd: d.noticeEnd ? d.noticeEnd.slice(0, 10) : undefined,
    noticeMonths: d.noticeMonths ?? undefined,
    hasCustomDates: d.hasCustomDates ?? false,
    plannedEnd: d.plannedEnd ? d.plannedEnd.slice(0, 10) : "",
    actualEnd: d.actualEnd ? d.actualEnd.slice(0, 10) : "",
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

/* ----------------------- Confirm Delete Modal ----------------------- */
interface ConfirmDeleteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departure: Departure
  onConfirm: () => Promise<void>
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  open,
  onOpenChange,
  departure,
  onConfirm,
}) => {
  const [deleting, setDeleting] = useState(false)

  const handleConfirm = async () => {
    setDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      console.error("Delete error:", error)
    } finally {
      setDeleting(false)
    }
  }

  const fullName = [
    departure.titleBefore,
    departure.name,
    departure.surname,
    departure.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="size-6 text-red-600" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-lg font-semibold">
              Potvrdit smazání
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Opravdu chcete smazat záznam odchodu pro{" "}
              <span className="font-medium">{fullName}</span>?
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Zrušit
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-current" />
                Mazání...
              </>
            ) : (
              "Smazat"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------- Print Form Component ----------------------- */
/* ----------------------- Print Form Component ----------------------- */
interface PrintSingleFormProps {
  departure: Departure
  onPrintComplete?: () => void
}

const PrintSingleForm: React.FC<PrintSingleFormProps> = ({
  departure,
  onPrintComplete,
}) => {
  const [printing, setPrinting] = useState(false)

  const handlePrint = async () => {
    setPrinting(true)

    try {
      await fetch(`/api/odchody/${departure.id}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printedAt: new Date().toISOString(),
          printedBy: "current-user",
          documentType: "offboarding-form",
        }),
      })
    } catch (error) {
      console.error("Chyba při zaznamenání tisku:", error)
    }

    const fullName = [
      departure.titleBefore,
      departure.name,
      departure.surname,
      departure.titleAfter,
    ]
      .filter(Boolean)
      .join(" ")

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Výstupní formulář - ${departure.name} ${departure.surname}</title>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              padding: 20mm;
              font-size: 11pt;
              line-height: 1.5;
              color: #000;
            }
            .container { max-width: 800px; margin: 0 auto; }
            
            .header { 
              text-align: center; 
              border-bottom: 3px solid #000; 
              padding-bottom: 15px; 
              margin-bottom: 30px;
            }
            .header h1 { 
              font-size: 20pt; 
              font-weight: bold;
              margin-bottom: 5px;
            }
            .header h2 {
              font-size: 14pt;
              font-weight: normal;
              color: #333;
            }
            
            .section { 
              margin: 25px 0; 
              page-break-inside: avoid;
            }
            .section-title {
              font-size: 13pt;
              font-weight: bold;
              margin-bottom: 12px;
              padding-bottom: 5px;
              border-bottom: 2px solid #666;
            }
            
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px 30px;
              margin-bottom: 20px;
            }
            
            .info-row { 
              display: flex;
              flex-direction: column;
              gap: 3px;
            }
            .info-label { 
              font-size: 9pt;
              font-weight: 600; 
              color: #666;
              text-transform: uppercase;
            }
            .info-value { 
              border-bottom: 1px solid #333; 
              min-height: 22px; 
              padding: 3px 5px;
              font-size: 11pt;
            }
            
            .signature-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 40px 30px;
              margin-top: 40px;
            }
            
            .signature-box {
              page-break-inside: avoid;
            }
            .signature-label {
              font-size: 10pt;
              font-weight: 600;
              margin-bottom: 30px;
              color: #333;
            }
            .signature-line {
              border-top: 1px solid #000;
              padding-top: 5px;
              display: flex;
              justify-content: space-between;
              font-size: 9pt;
              color: #666;
            }
            
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #ccc;
              text-align: center;
              font-size: 9pt;
              color: #666;
            }
            
            @media print {
              body { margin: 0; padding: 15mm; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <!-- Hlavička -->
            <div class="header">
              <h1>VÝSTUPNÍ FORMULÁŘ</h1>
              <h2>Ukončení pracovního poměru</h2>
            </div>

            <!-- Informace o zaměstnanci -->
            <div class="section">
              <div class="section-title">Údaje o zaměstnanci</div>
              <div class="info-grid">
                <div class="info-row">
                  <div class="info-label">Jméno a příjmení</div>
                  <div class="info-value">${fullName}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Osobní číslo</div>
                  <div class="info-value">${departure.personalNumber || "–"}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Pozice</div>
                  <div class="info-value">${departure.positionName}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Číslo pozice</div>
                  <div class="info-value">${departure.positionNum || "–"}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Odbor</div>
                  <div class="info-value">${departure.department}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Oddělení</div>
                  <div class="info-value">${departure.unitName}</div>
                </div>
              </div>
            </div>

            <!-- Termíny -->
            <div class="section">
              <div class="section-title">Termíny odchodu</div>
              <div class="info-grid">
                <div class="info-row">
                  <div class="info-label">Datum podání výpovědi</div>
                  <div class="info-value">${departure.noticeEnd ? format(new Date(departure.noticeEnd), "d.M.yyyy") : "–"}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Délka výpovědní lhůty</div>
                  <div class="info-value">${departure.noticeMonths || 2} měsíce</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Plánovaný odchod</div>
                  <div class="info-value">${format(new Date(departure.plannedEnd), "d.M.yyyy")}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Skutečný odchod</div>
                  <div class="info-value">${departure.actualEnd ? format(new Date(departure.actualEnd), "d.M.yyyy") : "–"}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Firemní e-mail</div>
                  <div class="info-value">${departure.userEmail || "–"}</div>
                </div>
              </div>
            </div>

            <!-- Poznámky -->
            ${
              departure.notes
                ? `
            <div class="section">
              <div class="section-title">Poznámky</div>
              <div class="info-value" style="min-height: 60px; border: 1px solid #333; padding: 10px;">
                ${departure.notes}
              </div>
            </div>
            `
                : ""
            }

            <!-- Podpisy -->
            <div class="section">
              <div class="section-title">Potvrzení a podpisy</div>
              <div class="signature-grid">
                <div class="signature-box">
                  <div class="signature-label">HR oddělení</div>
                  <div class="signature-line">
                    <span>Podpis:</span>
                    <span>Datum:</span>
                  </div>
                </div>
                
                <div class="signature-box">
                  <div class="signature-label">KITT6 (IT systémy)</div>
                  <div class="signature-line">
                    <span>Podpis:</span>
                    <span>Datum:</span>
                  </div>
                </div>
                
                <div class="signature-box">
                  <div class="signature-label">Odbor bezpečnosti (kartička)</div>
                  <div class="signature-line">
                    <span>Podpis:</span>
                    <span>Datum:</span>
                  </div>
                </div>
                
                <div class="signature-box">
                  <div class="signature-label">Ředitel odboru</div>
                  <div class="signature-line">
                    <span>Podpis:</span>
                    <span>Datum:</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Patička -->
            <div class="footer">
              Vytištěno: ${format(new Date(), "d.M.yyyy HH:mm")}
            </div>
          </div>
        </body>
      </html>
    `

    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 250)
      onPrintComplete?.()
    }

    setPrinting(false)
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handlePrint}
      disabled={printing}
      title="Vytisknout výstupní formulář"
      className="inline-flex items-center justify-center gap-1"
    >
      <Printer className="size-4" />
    </Button>
  )
}

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

/* ------------------------- Table Row Component ------------------------ */
interface DepartureTableRowProps {
  departure: Departure
  variant: "planned" | "actual"
  onEdit: () => void
  onConfirm?: () => void
  onReload: () => Promise<void>
  onSuccessMessage: (title: string, message: string) => void
  onErrorMessage: (title: string, message: string) => void
}

const DepartureTableRow: React.FC<DepartureTableRowProps> = ({
  departure,
  variant,
  onEdit,
  onConfirm,
  onReload,
  onSuccessMessage,
  onErrorMessage,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/odchody/${departure.id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Smazání se nezdařilo.")
      }

      // Dispatch event pro refresh
      window.dispatchEvent(new Event("offboarding:deleted"))

      onSuccessMessage(
        "Záznam smazán",
        `Odchod pro ${departure.name} ${departure.surname} byl úspěšně smazán.`
      )

      await onReload()
    } catch (err) {
      onErrorMessage(
        "Chyba při mazání",
        err instanceof Error ? err.message : "Smazání se nezdařilo."
      )
    }
  }

  return (
    <>
      <TableRow>
        <TableCell className="w-[200px]">
          <div className="flex items-center gap-2">
            <User className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="font-medium">
                {[
                  departure.titleBefore,
                  departure.name,
                  departure.surname,
                  departure.titleAfter,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {departure.personalNumber}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell className="w-[180px]">
          <div className="flex flex-col">
            <span
              className="text-sm font-medium"
              title={departure.positionName}
            >
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
        <TableCell className="w-[120px]">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-sm">
              {variant === "planned"
                ? format(new Date(departure.plannedEnd), "d.M.yyyy")
                : departure.actualEnd
                  ? format(new Date(departure.actualEnd), "d.M.yyyy")
                  : "–"}
            </span>
          </div>
        </TableCell>
        <TableCell className="w-[100px]">
          <DepartureProgressBar
            targetDate={
              variant === "planned"
                ? departure.plannedEnd
                : departure.actualEnd!
            }
            variant={variant}
            label={
              variant === "planned"
                ? "Do plánovaného odchodu"
                : "Od skutečného odchodu"
            }
          />
        </TableCell>
        <TableCell className="w-[150px]">
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
        <TableCell className="w-[200px] text-right">
          <div className="flex justify-end gap-1">
            <HistoryDialog
              id={departure.id}
              kind="offboarding"
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  title="Historie změn"
                  className="inline-flex items-center justify-center gap-1"
                >
                  <HistoryIcon className="size-4" />
                </Button>
              }
            />

            <PrintSingleForm
              departure={departure}
              onPrintComplete={() => void onReload()}
            />

            <SendEmailButton
              id={departure.id}
              kind="offboarding"
              email={departure.userEmail ?? undefined}
              onDone={onReload}
              onEditRequest={onEdit}
              className="inline-flex items-center justify-center gap-1"
            />

            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              title="Upravit záznam"
              className="inline-flex items-center justify-center gap-1"
            >
              <Edit className="size-4" />
              <span className="hidden pt-1.5 sm:inline">Upravit</span>
            </Button>

            {variant === "planned" && onConfirm && (
              <Button
                size="sm"
                variant="default"
                onClick={onConfirm}
                title="Potvrdit skutečný odchod"
                className="inline-flex items-center justify-center gap-1 bg-orange-500 text-white hover:bg-orange-600"
              >
                <Check className="size-4" />
                <span className="hidden pt-1.5 sm:inline">Odešel</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteModal(true)}
              title="Smazat záznam"
              className="inline-flex items-center justify-center gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <ConfirmDeleteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        departure={departure}
        onConfirm={handleDelete}
      />
    </>
  )
}

/* ----------------------------- Main Page ----------------------------- */
export default function OffboardingPage() {
  const sp = useSearchParams()

  const [planned, setPlanned] = useState<Departure[]>([])
  const [actual, setActual] = useState<Departure[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  // Stavy pro dialogy
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

  const showSuccess = React.useCallback((title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }, [])

  const showError = React.useCallback((title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }, [])

  const allPersonalNumbers = useMemo(() => {
    return [...planned, ...actual]
      .map((d) => d.personalNumber)
      .filter(Boolean) as string[]
  }, [planned, actual])

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
    if (!qpMode) return
    if (qpMode === "create-actual") setOpenNewActual(true)
    else setOpenNewPlanned(true)
  }, [qpMode])

  useEffect(() => {
    const handler = () => {
      void reload()
    }

    window.addEventListener("offboarding:deleted", handler)
    window.addEventListener("offboarding:updated", handler)
    window.addEventListener("offboarding:created", handler)

    return () => {
      window.removeEventListener("offboarding:deleted", handler)
      window.removeEventListener("offboarding:updated", handler)
      window.removeEventListener("offboarding:created", handler)
    }
  }, [reload])

  const thisMonth = format(new Date(), "yyyy-MM")
  const defaultPlannedMonth = useMemo(() => {
    const has = planned.find((e) => e.plannedEnd?.slice(0, 7) === thisMonth)
    return (
      has?.plannedEnd?.slice(0, 7) ?? planned[0]?.plannedEnd?.slice(0, 7) ?? ""
    )
  }, [planned, thisMonth])

  const actualMonths = useMemo(
    () =>
      Array.from(
        new Set(
          actual
            .map((e) => e.actualEnd?.slice(0, 7))
            .filter(Boolean) as string[]
        )
      ),
    [actual]
  )

  const plannedMonths = useMemo(
    () =>
      Array.from(
        new Set(
          planned
            .map((e) => e.plannedEnd?.slice(0, 7))
            .filter(Boolean) as string[]
        )
      ),
    [planned]
  )

  const defaultActualMonth = useMemo(() => {
    const has = actual.find((e) => e.actualEnd?.slice(0, 7) === thisMonth)
    return has?.actualEnd?.slice(0, 7) ?? actualMonths[0] ?? ""
  }, [actual, actualMonths, thisMonth])

  // Funkce pro potvrzení skutečného odchodu
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
        `Skutečný odchod pro ${activeRow.name} ${activeRow.surname} byl úspěšně zaznamenán a přesunut do skutečných odchodů.`
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

  // Funkce pro editaci záznamu
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

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Odchody zaměstnanců
        </h1>
        <p className="text-muted-foreground">
          Správa plánovaných a skutečných odchodů zaměstnanců
        </p>
      </div>

      <Tabs
        defaultValue="planned"
        className="flex h-[calc(100vh-160px)] flex-col"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="planned" className="flex items-center gap-2">
            <CalendarDays className="size-4" />
            Předpokládané
          </TabsTrigger>
          <TabsTrigger value="actual" className="flex items-center gap-2">
            <User className="size-4" />
            Skutečné
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto">
          {/* ---------- PLANNED TAB ---------- */}
          <TabsContent value="planned" className="mt-4 space-y-4">
            <div className="mb-4">
              <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
                <DialogTrigger asChild>
                  <Button className="inline-flex items-center justify-center gap-2">
                    Přidat předpokládaný odchod
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
                  <DialogTitle className="px-6 pt-6">
                    Nový předpokládaný odchod
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
                          "Předpokládaný odchod byl úspěšně přidán."
                        )
                        await reload()
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current"></div>
                <span className="ml-2 text-muted-foreground">
                  Načítám data...
                </span>
              </div>
            ) : planned.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CalendarDays className="mb-4 size-12 text-muted-foreground" />
                  <p className="text-lg font-medium text-muted-foreground">
                    Žádné předpokládané odchody
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Přidejte první záznam pomocí tlačítka výše
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <DeletedRecordsDialog
                    kind="offboarding"
                    title="Smazané odchody"
                    triggerLabel="Smazané záznamy"
                    successEvent="offboarding:deleted"
                    onRestore={() => void reload()}
                  />
                </div>
                <Accordion
                  type="multiple"
                  defaultValue={
                    defaultPlannedMonth ? [defaultPlannedMonth] : []
                  }
                >
                  {[
                    ...new Set(planned.map((e) => e.plannedEnd.slice(0, 7))),
                  ].map((month) => (
                    <AccordionItem
                      key={month}
                      value={month}
                      className="rounded-xl border"
                      style={{ backgroundColor: "#f973161A" }}
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
                                e.plannedEnd.startsWith(month)
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
                                    <TableHead className="w-[220px]">
                                      Zaměstnanec
                                    </TableHead>
                                    <TableHead className="w-[180px]">
                                      Pozice
                                    </TableHead>
                                    <TableHead className="w-[160px]">
                                      Odbor / Oddělení
                                    </TableHead>
                                    <TableHead className="w-[120px]">
                                      Plánovaný odchod
                                    </TableHead>
                                    <TableHead className="w-[100px]">
                                      Výpovědní lhůta
                                    </TableHead>
                                    <TableHead className="w-[150px]">
                                      Kontakt
                                    </TableHead>
                                    <TableHead className="w-[200px]">
                                      Akce
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {planned
                                    .filter((e) =>
                                      e.plannedEnd.startsWith(month)
                                    )
                                    .sort(
                                      (a, b) =>
                                        new Date(a.plannedEnd).getTime() -
                                        new Date(b.plannedEnd).getTime()
                                    )
                                    .map((e) => (
                                      <DepartureTableRow
                                        key={e.id}
                                        departure={e}
                                        variant="planned"
                                        onEdit={() =>
                                          void openEditDialog(e, "planned")
                                        }
                                        onConfirm={() =>
                                          openActualDialogFromPlanned(e)
                                        }
                                        onReload={reload}
                                        onSuccessMessage={showSuccess}
                                        onErrorMessage={showError}
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

            {/* Měsíční reporty dole napravo */}
            <div className="mt-6 flex justify-end">
              <MonthlySummaryButton
                candidateMonths={plannedMonths}
                defaultMonth={defaultPlannedMonth || thisMonth}
                label="Zaslat měsíční report"
                className="inline-flex items-center justify-center gap-2 bg-orange-600 text-white hover:bg-orange-700"
                onDone={() => {
                  showSuccess(
                    "Report odeslán",
                    "Měsíční report předpokládaných odchodů byl odeslán."
                  )
                  void reload()
                }}
              />
            </div>
          </TabsContent>

          {/* ---------- ACTUAL TAB ---------- */}
          <TabsContent value="actual" className="mt-4 space-y-4">
            <div className="mb-4">
              <Dialog open={openNewActual} onOpenChange={setOpenNewActual}>
                <DialogTrigger asChild>
                  <Button className="inline-flex items-center justify-center gap-2">
                    Přidat skutečný odchod
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
                  <DialogTitle className="px-6 pt-6">
                    Skutečný odchod
                  </DialogTitle>
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
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current"></div>
                <span className="ml-2 text-muted-foreground">
                  Načítám data...
                </span>
              </div>
            ) : actual.length === 0 ? (
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
              <div className="space-y-4">
                <div className="flex justify-end">
                  <DeletedRecordsDialog
                    kind="offboarding"
                    title="Smazané odchody"
                    triggerLabel="Smazané záznamy"
                    successEvent="offboarding:deleted"
                    onRestore={() => void reload()}
                  />
                </div>
                <Accordion
                  type="multiple"
                  defaultValue={defaultActualMonth ? [defaultActualMonth] : []}
                >
                  {actualMonths.map((month) => (
                    <AccordionItem
                      key={month}
                      value={month}
                      className="rounded-xl border"
                      style={{ backgroundColor: "#ef44441A" }}
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
                                e.actualEnd?.startsWith(month)
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
                                    <TableHead className="w-[220px]">
                                      Zaměstnanec
                                    </TableHead>
                                    <TableHead className="w-[180px]">
                                      Pozice
                                    </TableHead>
                                    <TableHead className="w-[160px]">
                                      Odbor / Oddělení
                                    </TableHead>
                                    <TableHead className="w-[120px]">
                                      Skutečný odchod
                                    </TableHead>
                                    <TableHead className="w-[100px]">
                                      Výpovědní lhůta
                                    </TableHead>
                                    <TableHead className="w-[150px]">
                                      Kontakt
                                    </TableHead>
                                    <TableHead className="w-[200px]">
                                      Akce
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {actual
                                    .filter((e) =>
                                      e.actualEnd?.startsWith(month)
                                    )
                                    .sort((a, b) => {
                                      const dateA = new Date(a.actualEnd || "")
                                      const dateB = new Date(b.actualEnd || "")
                                      return dateB.getTime() - dateA.getTime()
                                    })
                                    .map((e) => (
                                      <DepartureTableRow
                                        key={e.id}
                                        departure={e}
                                        variant="actual"
                                        onEdit={() =>
                                          void openEditDialog(e, "actual")
                                        }
                                        onReload={reload}
                                        onSuccessMessage={showSuccess}
                                        onErrorMessage={showError}
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

            {/* Měsíční reporty dole napravo */}
            <div className="mt-6 flex justify-end">
              <MonthlySummaryButton
                candidateMonths={actualMonths}
                defaultMonth={defaultActualMonth || thisMonth}
                label="Zaslat měsíční report"
                className="inline-flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700"
                onDone={() => {
                  showSuccess(
                    "Report odeslán",
                    "Měsíční report skutečných odchodů byl odeslán."
                  )
                  void reload()
                }}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Dialog pro potvrzení skutečného odchodu - oranžový s možností úpravy */}
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
                {/* Informace o zaměstnanci s tlačítkem upravit a potvrzením */}
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
                      {format(new Date(activeRow.plannedEnd), "d.M.yyyy")}
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

                  {/* Potvrzovací box */}
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

                {/* Datum skutečného odchodu */}
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

      {/* Dialog pro editaci */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogTitle className="px-6 pt-6">Upravit záznam</DialogTitle>
          <div className="p-6">
            {editLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current"></div>
                <span className="ml-2 text-muted-foreground">
                  Načítám data...
                </span>
              </div>
            ) : editId != null && editInitial ? (
              <OffboardingFormUnified
                key={`edit-${editId}-${editContext}`}
                id={editId!}
                initial={editInitial!}
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
