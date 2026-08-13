"use client"

import * as React from "react"
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Mail,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ReportsHistoryButton } from "@/components/history/reports-history-button"

type OnboardingStatus = "planned" | "actual" | "cancelled"
type OffboardingStatus = "planned" | "actual" | "cancelled"

type ArrivalLite = {
  id: number
  plannedStart: string
  actualStart?: string | null
  cancelledAt?: string | null
}

type DepartureLite = {
  id: number
  plannedEnd: string
  actualEnd?: string | null
  cancelledAt?: string | null
}

type ChangeLite = {
  id: number
  status: string
  effectiveDate: string
}

type SelectionSection = {
  module: "nastup" | "odchod" | "zmena"
  status?: OnboardingStatus | OffboardingStatus
  month: string
  ids: number[]
  includeDocuments?: boolean
}

const MONTH_LABELS = [
  "Led",
  "Úno",
  "Bře",
  "Dub",
  "Kvě",
  "Čvn",
  "Čvc",
  "Srp",
  "Zář",
  "Říj",
  "Lis",
  "Pro",
]

const MONTH_FULL_LABELS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
]

function monthDisplayLabel(month: string) {
  const [year, monthNumber] = month.split("-")
  const label = MONTH_FULL_LABELS[Number(monthNumber) - 1] ?? monthNumber
  return `${label} ${year}`
}

function arrivalStatus(a: ArrivalLite): OnboardingStatus {
  if (a.cancelledAt) return "cancelled"
  if (a.actualStart) return "actual"
  return "planned"
}

function arrivalMonth(a: ArrivalLite): string {
  const date = arrivalStatus(a) === "actual" ? a.actualStart : a.plannedStart
  return (date ?? a.plannedStart).slice(0, 7)
}

function departureStatus(d: DepartureLite): OffboardingStatus {
  if (d.cancelledAt) return "cancelled"
  return d.actualEnd ? "actual" : "planned"
}

function departureMonth(d: DepartureLite): string {
  const date = departureStatus(d) === "actual" ? d.actualEnd : d.plannedEnd
  return (date ?? d.plannedEnd).slice(0, 7)
}

function changeMonth(c: ChangeLite): string {
  return c.effectiveDate.slice(0, 7)
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function buildClientFilename(moduleSlugs: string[]) {
  const slug = moduleSlugs.length ? moduleSlugs.join("-") : "report"
  const now = new Date()
  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
  return `report-${slug}-${stamp}.pdf`
}

function groupIdsByMonth<T>(
  rows: T[],
  getId: (row: T) => number,
  getMonth: (row: T) => string
): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  for (const row of rows) {
    const month = getMonth(row)
    if (!map[month]) map[month] = []
    map[month].push(getId(row))
  }
  return map
}

const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  planned: "Plánované",
  actual: "Skutečné",
  cancelled: "Neuskutečněné",
}

const OFFBOARDING_STATUS_LABEL: Record<OffboardingStatus, string> = {
  planned: "Plánované",
  actual: "Skutečné",
  cancelled: "Neuskutečněné",
}

type Props = {
  openSignal?: number
  canSend: boolean
}

export function PdfReportModal({ openSignal, canSend }: Props) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (openSignal) setOpen(true)
  }, [openSignal])

  const [viewYear, setViewYear] = React.useState(() => new Date().getFullYear())
  const [selectedMonths, setSelectedMonths] = React.useState<string[]>([])

  const [includeNastupPlanned, setIncludeNastupPlanned] = React.useState(false)
  const [includeNastupActual, setIncludeNastupActual] = React.useState(false)
  const [includeNastupCancelled, setIncludeNastupCancelled] =
    React.useState(false)
  const [includeNastupDocuments, setIncludeNastupDocuments] =
    React.useState(false)

  const [includeOdchodPlanned, setIncludeOdchodPlanned] = React.useState(false)
  const [includeOdchodActual, setIncludeOdchodActual] = React.useState(false)
  const [includeOdchodCancelled, setIncludeOdchodCancelled] =
    React.useState(false)
  const [includeOdchodDocuments, setIncludeOdchodDocuments] =
    React.useState(false)

  const [includeZmeny, setIncludeZmeny] = React.useState(false)

  const [email, setEmail] = React.useState("")

  const [loading, setLoading] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  )

  const [arrivals, setArrivals] = React.useState<ArrivalLite[]>([])
  const [departures, setDepartures] = React.useState<DepartureLite[]>([])
  const [changes, setChanges] = React.useState<ChangeLite[]>([])

  React.useEffect(() => {
    if (!successMessage && !error) return
    const timeout = setTimeout(() => {
      setSuccessMessage(null)
      setError(null)
    }, 6000)
    return () => clearTimeout(timeout)
  }, [successMessage, error])

  React.useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetch("/api/nastupy", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/odchody", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/zmeny", { cache: "no-store" }).then((res) => res.json()),
    ])
      .then(([nastupyJson, odchodyJson, zmenyJson]) => {
        if (cancelled) return

        setArrivals(
          nastupyJson?.status === "success" && Array.isArray(nastupyJson.data)
            ? (nastupyJson.data as ArrivalLite[])
            : []
        )
        setDepartures(
          odchodyJson?.status === "success" && Array.isArray(odchodyJson.data)
            ? (odchodyJson.data as DepartureLite[])
            : []
        )
        setChanges(
          Array.isArray(zmenyJson?.data) ? (zmenyJson.data as ChangeLite[]) : []
        )
      })
      .catch(() => {
        if (!cancelled) setError("Nepodařilo se načíst data pro report.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  function toggleMonth(month: string) {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort()
    )
  }

  const nastupMatching = React.useMemo(
    () =>
      arrivals.filter((a) => {
        const status = arrivalStatus(a)
        if (status === "planned" && !includeNastupPlanned) return false
        if (status === "actual" && !includeNastupActual) return false
        if (status === "cancelled" && !includeNastupCancelled) return false
        return selectedMonths.includes(arrivalMonth(a))
      }),
    [
      arrivals,
      includeNastupPlanned,
      includeNastupActual,
      includeNastupCancelled,
      selectedMonths,
    ]
  )

  const odchodMatching = React.useMemo(
    () =>
      departures.filter((d) => {
        const status = departureStatus(d)
        if (status === "planned" && !includeOdchodPlanned) return false
        if (status === "actual" && !includeOdchodActual) return false
        if (status === "cancelled" && !includeOdchodCancelled) return false
        return selectedMonths.includes(departureMonth(d))
      }),
    [
      departures,
      includeOdchodPlanned,
      includeOdchodActual,
      includeOdchodCancelled,
      selectedMonths,
    ]
  )

  const zmenaMatching = React.useMemo(
    () =>
      changes.filter(
        (c) =>
          c.status !== "CANCELLED" && selectedMonths.includes(changeMonth(c))
      ),
    [changes, selectedMonths]
  )

  const totalSelected =
    (includeNastupPlanned || includeNastupActual || includeNastupCancelled
      ? nastupMatching.length
      : 0) +
    (includeOdchodPlanned || includeOdchodActual || includeOdchodCancelled
      ? odchodMatching.length
      : 0) +
    (includeZmeny ? zmenaMatching.length : 0)

  const nastupCountsByStatus = React.useMemo(() => {
    const counts: Record<OnboardingStatus, number> = {
      planned: 0,
      actual: 0,
      cancelled: 0,
    }
    for (const a of arrivals) {
      if (!selectedMonths.includes(arrivalMonth(a))) continue
      counts[arrivalStatus(a)] += 1
    }
    return counts
  }, [arrivals, selectedMonths])

  const odchodCountsByStatus = React.useMemo(() => {
    const counts: Record<OffboardingStatus, number> = {
      planned: 0,
      actual: 0,
      cancelled: 0,
    }
    for (const d of departures) {
      if (!selectedMonths.includes(departureMonth(d))) continue
      counts[departureStatus(d)] += 1
    }
    return counts
  }, [departures, selectedMonths])

  function resetSelection() {
    setSelectedMonths([])
    setIncludeNastupPlanned(false)
    setIncludeNastupActual(false)
    setIncludeNastupCancelled(false)
    setIncludeNastupDocuments(false)
    setIncludeOdchodPlanned(false)
    setIncludeOdchodActual(false)
    setIncludeOdchodCancelled(false)
    setIncludeOdchodDocuments(false)
    setIncludeZmeny(false)
    setEmail("")
  }

  function buildSelectionSections(): SelectionSection[] {
    const sections: SelectionSection[] = []

    const nastupByStatus: Record<OnboardingStatus, ArrivalLite[]> = {
      planned: [],
      actual: [],
      cancelled: [],
    }
    for (const a of nastupMatching) {
      nastupByStatus[arrivalStatus(a)].push(a)
    }

    ;(
      [
        ["planned", includeNastupPlanned],
        ["actual", includeNastupActual],
        ["cancelled", includeNastupCancelled],
      ] as const
    ).forEach(([status, enabled]) => {
      if (!enabled) return
      const grouped = groupIdsByMonth(
        nastupByStatus[status],
        (a) => a.id,
        (a) => arrivalMonth(a)
      )
      for (const [month, ids] of Object.entries(grouped)) {
        sections.push({
          module: "nastup",
          status,
          month,
          ids,
          includeDocuments:
            status === "cancelled" ? false : includeNastupDocuments,
        })
      }
    })

    const odchodByStatus: Record<OffboardingStatus, DepartureLite[]> = {
      planned: [],
      actual: [],
      cancelled: [],
    }
    for (const d of odchodMatching) {
      odchodByStatus[departureStatus(d)].push(d)
    }

    ;(
      [
        ["planned", includeOdchodPlanned],
        ["actual", includeOdchodActual],
        ["cancelled", includeOdchodCancelled],
      ] as const
    ).forEach(([status, enabled]) => {
      if (!enabled) return
      const grouped = groupIdsByMonth(
        odchodByStatus[status],
        (d) => d.id,
        (d) => departureMonth(d)
      )
      for (const [month, ids] of Object.entries(grouped)) {
        sections.push({
          module: "odchod",
          status,
          month,
          ids,
          includeDocuments:
            status === "cancelled" ? false : includeOdchodDocuments,
        })
      }
    })

    if (includeZmeny) {
      const grouped = groupIdsByMonth(
        zmenaMatching,
        (c) => c.id,
        (c) => changeMonth(c)
      )
      for (const [month, ids] of Object.entries(grouped)) {
        sections.push({ module: "zmena", month, ids })
      }
    }

    return sections
  }

  function activeModuleSlugs(): string[] {
    const slugs: string[] = []
    if (includeNastupPlanned || includeNastupActual || includeNastupCancelled)
      slugs.push("nastupy")
    if (includeOdchodPlanned || includeOdchodActual || includeOdchodCancelled)
      slugs.push("odchody")
    if (includeZmeny) slugs.push("zmeny")
    return slugs
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const sections = buildSelectionSections()

      if (sections.length === 0) {
        setError("Vyber alespoň jeden měsíc a jednu sekci s nějakými záznamy.")
        return
      }

      const filename = buildClientFilename(activeModuleSlugs())

      const res = await fetch("/api/reporty/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Generování PDF selhalo.")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      resetSelection()
      setSuccessMessage(`PDF „${filename}" bylo staženo.`)
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : "Generování PDF selhalo."
      )
    } finally {
      setGenerating(false)
    }
  }

  async function handleSendEmail() {
    setSending(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const sections = buildSelectionSections()

      if (sections.length === 0) {
        setError("Vyber alespoň jeden měsíc a jednu sekci s nějakými záznamy.")
        return
      }

      if (!email.trim()) {
        setError("Zadej e-mail příjemce.")
        return
      }

      const res = await fetch("/api/reporty/pdf/odeslat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, email: email.trim() }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Odeslání reportu selhalo.")
      }

      const sentEmail = email.trim()
      resetSelection()
      setSuccessMessage(`Report byl odeslán na ${sentEmail}.`)
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Odeslání reportu selhalo."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex max-h-[95svh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 p-0"
        style={{ overscrollBehavior: "contain" }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b p-4 sm:px-6">
          <DialogTitle>Generovat PDF report</DialogTitle>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-lenis-prevent=""
          onWheelCapture={(e) => e.stopPropagation()}
        >
          <div className="space-y-5 p-4 sm:px-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Rok a měsíce</h3>
                {selectedMonths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedMonths([])}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Vymazat vše
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setViewYear((y) => y - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-14 text-center text-sm font-medium">
                  {viewYear}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setViewYear((y) => y + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {MONTH_LABELS.map((label, index) => {
                  const month = `${viewYear}-${String(index + 1).padStart(2, "0")}`
                  const isSelected = selectedMonths.includes(month)

                  return (
                    <Button
                      key={month}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-9",
                        isSelected &&
                          "bg-[#00847C] text-white hover:bg-[#0B6D73]"
                      )}
                      onClick={() => toggleMonth(month)}
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>

              {selectedMonths.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t pt-3">
                  {selectedMonths.map((month) => (
                    <Badge
                      key={month}
                      variant="secondary"
                      className="gap-1 py-1 pl-2.5 pr-1.5 capitalize"
                    >
                      {monthDisplayLabel(month)}
                      <button
                        type="button"
                        onClick={() => toggleMonth(month)}
                        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                        aria-label={`Odebrat ${month}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {selectedMonths.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Zatím není vybraný žádný měsíc.
                </p>
              )}
            </section>

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Načítám data…
              </div>
            ) : (
              <>
                <section className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="size-4 text-[#00847C]" />
                    <h3 className="font-semibold">Nástupy</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeNastupPlanned}
                        onCheckedChange={(c) => setIncludeNastupPlanned(!!c)}
                      />
                      {ONBOARDING_STATUS_LABEL.planned} (
                      {nastupCountsByStatus.planned})
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeNastupActual}
                        onCheckedChange={(c) => setIncludeNastupActual(!!c)}
                      />
                      {ONBOARDING_STATUS_LABEL.actual} (
                      {nastupCountsByStatus.actual})
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeNastupCancelled}
                        onCheckedChange={(c) => setIncludeNastupCancelled(!!c)}
                      />
                      {ONBOARDING_STATUS_LABEL.cancelled} (
                      {nastupCountsByStatus.cancelled})
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={includeNastupDocuments}
                      onCheckedChange={(c) => setIncludeNastupDocuments(!!c)}
                    />
                    Zahrnout informace o dokumentech{" "}
                    <span className="text-muted-foreground">
                      (formuláře, vyhodnocení zkušební doby)
                    </span>
                  </label>

                  <p className="text-xs text-muted-foreground">
                    Celkem k zahrnutí: {nastupMatching.length} záznamů
                  </p>
                </section>

                <section className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <UserMinus className="size-4 text-[#00847C]" />
                    <h3 className="font-semibold">Odchody</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeOdchodPlanned}
                        onCheckedChange={(c) => setIncludeOdchodPlanned(!!c)}
                      />
                      {OFFBOARDING_STATUS_LABEL.planned} (
                      {odchodCountsByStatus.planned})
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeOdchodActual}
                        onCheckedChange={(c) => setIncludeOdchodActual(!!c)}
                      />
                      {OFFBOARDING_STATUS_LABEL.actual} (
                      {odchodCountsByStatus.actual})
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeOdchodCancelled}
                        onCheckedChange={(c) => setIncludeOdchodCancelled(!!c)}
                      />
                      {OFFBOARDING_STATUS_LABEL.cancelled} (
                      {odchodCountsByStatus.cancelled})
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={includeOdchodDocuments}
                      onCheckedChange={(c) => setIncludeOdchodDocuments(!!c)}
                    />
                    Zahrnout informace o dokumentech{" "}
                    <span className="text-muted-foreground">
                      (výstupní list)
                    </span>
                  </label>

                  <p className="text-xs text-muted-foreground">
                    Celkem k zahrnutí: {odchodMatching.length} záznamů
                  </p>
                </section>

                <section className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="size-4 text-[#00847C]" />
                    <h3 className="font-semibold">Zaměstnanecké změny</h3>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={includeZmeny}
                      onCheckedChange={(c) => setIncludeZmeny(!!c)}
                    />
                    Zahrnout do reportu
                  </label>

                  <p className="text-xs text-muted-foreground">
                    Celkem k zahrnutí: {zmenaMatching.length} záznamů
                  </p>
                </section>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t px-4 py-3 sm:px-6">
          {successMessage && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="size-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {canSend && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail příjemce"
                className="h-9 max-w-64"
              />
              <Button
                onClick={handleSendEmail}
                disabled={
                  sending || loading || totalSelected === 0 || !email.trim()
                }
                className="inline-flex items-center gap-1.5 bg-[#00847C] text-white hover:bg-[#0B6D73]"
              >
                {sending ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : (
                  <Mail className="size-4 shrink-0" />
                )}
                Odeslat přílohu
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm text-muted-foreground">
              Celkem k zahrnutí: {totalSelected} záznamů
            </span>
            <ReportsHistoryButton scope="generic" title="Historie reportů" />
            <Button variant="outline" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || loading || totalSelected === 0}
              className="inline-flex items-center gap-1.5 bg-[#00847C] text-white hover:bg-[#0B6D73]"
            >
              {generating ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Download className="size-4 shrink-0" />
              )}
              Stáhnout PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
