"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { format as fmt } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertCircle, CheckCircle2, Mail } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Kind = "planned" | "actual"
type TypeFilter = "nastupy" | "odchody"
type SendMode = "selected" | "all" | "unsentOnly"

interface ReportRecord {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  date: string | null
  position: string | null
  department: string | null
  type: "onboarding" | "offboarding"
  isPlanned: boolean
  wasSent: boolean
  sentDate?: string | null
  email?: string | null
  personalNumber?: string | null
  positionNum?: string | null
}

interface RecordsResponse {
  records: ReportRecord[]
}

interface UiRecordPayload {
  id: number
  type: "onboarding" | "offboarding"
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  position: string | null
  department: string | null
  date: string | null
  originKind: "planned" | "actual"
  personalNumber?: string | null
  positionNum?: string | null
}

interface Props {
  openSignal?: number
  initialType: TypeFilter
  defaultMonth?: string
  initialKind?: Kind
}

function rowKey(r: ReportRecord): string {
  return `${r.type}-${r.id}-${r.isPlanned ? "planned" : "actual"}`
}

function formatFullName(r: ReportRecord): string {
  const before = r.titleBefore?.trim()
  const after = r.titleAfter?.trim()
  const base = `${r.name} ${r.surname}`.trim()
  let full = base
  if (before) full = `${before} ${full}`
  if (after) full = `${full}, ${after}`
  return full
}

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 " +
  "focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary " +
  "focus-visible:ring-2 focus-visible:ring-primary/55 " +
  "focus-visible:ring-offset-2 focus:ring-offset-background"

export function MonthlyReportModal({
  openSignal,
  initialType,
  defaultMonth = fmt(new Date(), "yyyy-MM"),
  initialKind = "actual",
}: Props) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (openSignal) setOpen(true)
  }, [openSignal])

  const [month, setMonth] = useState(defaultMonth)
  const [kind, setKind] = useState<Kind>(initialKind)
  const [type, setType] = useState<TypeFilter>(initialType)
  const [includeOtherType, setIncludeOtherType] = useState(false)
  const [combineBoth, setCombineBoth] = useState(false)

  const [records, setRecords] = useState<ReportRecord[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const [confirmState, setConfirmState] = useState<{
    open: boolean
    mode: SendMode | null
    alreadySent: number
    total: number
  }>({ open: false, mode: null, alreadySent: 0, total: 0 })

  const [successState, setSuccessState] = useState<{
    open: boolean
    mode: SendMode | null
    total: number
  }>({ open: false, mode: null, total: 0 })

  const [errorState, setErrorState] = useState<{
    open: boolean
    message: string | null
  }>({ open: false, message: null })

  const monthLabel = useMemo(
    () => fmt(new Date(`${month}-01`), "LLLL yyyy", { locale: cs }),
    [month]
  )

  const fetchOne = useCallback(
    async (k: Kind): Promise<ReportRecord[]> => {
      const params = new URLSearchParams({
        month,
        kind: k,
        type,
        includeOtherType: String(includeOtherType),
      })
      const res = await fetch(`/api/reporty/mesicni/zaznamy?${params}`)
      if (!res.ok) return []
      const j = (await res.json()) as Partial<RecordsResponse>
      return Array.isArray(j?.records) ? (j.records as ReportRecord[]) : []
    },
    [month, type, includeOtherType]
  )

  const loadRecords = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      if (combineBoth) {
        const [actual, planned] = await Promise.all([
          fetchOne("actual"),
          fetchOne("planned"),
        ])
        const map = new Map<string, ReportRecord>()
        ;[...planned, ...actual].forEach((r) => map.set(rowKey(r), r))
        setRecords(Array.from(map.values()))
      } else {
        const rows = await fetchOne(kind)
        setRecords(rows)
      }
      setSelectedKeys([])
    } finally {
      setLoading(false)
    }
  }, [open, kind, combineBoth, fetchOne])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  const sentCount = useMemo(
    () => records.filter((r) => r.wasSent).length,
    [records]
  )
  const selectedSentCount = useMemo(
    () =>
      records.filter((r) => selectedKeys.includes(rowKey(r)) && r.wasSent)
        .length,
    [records, selectedKeys]
  )

  function toggleAll() {
    if (selectedKeys.length === records.length) setSelectedKeys([])
    else setSelectedKeys(records.map(rowKey))
  }
  function toggleUnsent() {
    setSelectedKeys(records.filter((r) => !r.wasSent).map(rowKey))
  }
  function toggleSingle(key: string) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSend(mode: SendMode, force = false) {
    const payloadRows =
      mode === "selected"
        ? records.filter((r) => selectedKeys.includes(rowKey(r)))
        : records

    if (payloadRows.length === 0) return

    const alreadySentInPayload = payloadRows.filter((r) => r.wasSent).length

    if (!force && mode !== "unsentOnly" && alreadySentInPayload > 0) {
      setConfirmState({
        open: true,
        mode,
        alreadySent: alreadySentInPayload,
        total: payloadRows.length,
      })
      return
    }

    setSending(true)
    try {
      const payload: UiRecordPayload[] = payloadRows.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        surname: r.surname,
        titleBefore: r.titleBefore ?? null,
        titleAfter: r.titleAfter ?? null,
        position: r.position ?? null,
        department: r.department ?? null,
        date: r.date,
        originKind: r.isPlanned ? "planned" : "actual",
        personalNumber: r.personalNumber ?? null,
        positionNum: r.positionNum ?? null,
      }))

      const res = await fetch("/api/reporty/mesicni/odeslat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          kind,
          records: payload,
          mode,
          sendToAll: combineBoth,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Chyba při odesílání reportu.")
      }

      setSuccessState({ open: true, mode, total: payloadRows.length })
      void loadRecords()
    } catch (e) {
      setErrorState({
        open: true,
        message:
          e instanceof Error && e.message ? e.message : "Chyba při odesílání.",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[95svh] w-full max-w-5xl flex-col gap-0 p-0"
          style={{ overscrollBehavior: "contain" }}
        >
          <DialogHeader className="shrink-0 border-b p-4 sm:px-6">
            <DialogTitle>Měsíční report – {monthLabel}</DialogTitle>
          </DialogHeader>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            onWheelCapture={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 p-4 sm:px-6">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[160px] flex-1">
                  <Label htmlFor="month">Měsíc</Label>
                  <input
                    id="month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className={cn(
                      "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      focusRing
                    )}
                  />
                </div>

                <div className="min-w-[160px] flex-1">
                  <Label>Režim</Label>
                  <Tabs
                    value={kind}
                    onValueChange={(v) => setKind(v as Kind)}
                    className="mt-1"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="actual" disabled={combineBoth}>
                        Skutečné
                      </TabsTrigger>
                      <TabsTrigger value="planned" disabled={combineBoth}>
                        Plánované
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="min-w-[160px] flex-1">
                  <Label>Hlavní typ</Label>
                  <Tabs
                    value={type}
                    onValueChange={(v) => setType(v as TypeFilter)}
                    className="mt-1"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="nastupy">Nástupy</TabsTrigger>
                      <TabsTrigger value="odchody">Odchody</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="flex min-w-[160px] flex-1 flex-col justify-end gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeOther"
                      checked={includeOtherType}
                      onCheckedChange={(c) => setIncludeOtherType(!!c)}
                    />
                    <Label htmlFor="includeOther" className="cursor-pointer">
                      Zahrnout i {type === "nastupy" ? "odchody" : "nástupy"}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="combineBoth"
                      checked={combineBoth}
                      onCheckedChange={(c) => setCombineBoth(!!c)}
                    />
                    <Label htmlFor="combineBoth" className="cursor-pointer">
                      Zaslat společně (plánované + skutečné)
                    </Label>
                  </div>
                </div>
              </div>

              {sentCount > 0 && (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {sentCount} z {records.length} záznamů už bylo odesláno.
                    {selectedSentCount > 0 && (
                      <span className="ml-1 font-semibold">
                        Vybráno {selectedSentCount} již odeslaných.
                      </span>
                    )}
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
                  {selectedKeys.length === records.length && records.length > 0
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
                  Vybráno: {selectedKeys.length} / {records.length}
                </div>
              </div>

              <div
                className={cn(
                  "rounded-lg border bg-background",
                  "overflow-auto",
                  "max-h-[40vh]",
                  "[-webkit-overflow-scrolling:touch]",
                  "[overscroll-behavior:contain]"
                )}
                aria-busy={loading}
              >
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Načítám…
                  </div>
                ) : records.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Žádné záznamy
                  </div>
                ) : (
                  <table className="w-full min-w-[680px] text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                      <tr>
                        <th className="w-10 p-2">
                          <Checkbox
                            checked={
                              selectedKeys.length === records.length &&
                              records.length > 0
                            }
                            onCheckedChange={toggleAll}
                            aria-label="Vybrat všechny"
                          />
                        </th>
                        <th className="p-2 text-left font-medium">Jméno</th>
                        <th className="p-2 text-left font-medium">Pozice</th>
                        <th className="hidden p-2 text-left font-medium sm:table-cell">
                          Oddělení
                        </th>
                        <th className="p-2 text-left font-medium">Datum</th>
                        <th className="hidden p-2 text-left font-medium sm:table-cell">
                          Typ
                        </th>
                        <th className="hidden p-2 text-left font-medium sm:table-cell">
                          Režim
                        </th>
                        <th className="w-32 p-2 text-left font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => {
                        const k = rowKey(r)
                        return (
                          <tr
                            key={k}
                            className={cn(
                              "border-t hover:bg-muted/20",
                              r.wasSent && "bg-muted/10"
                            )}
                          >
                            <td className="p-2">
                              <Checkbox
                                checked={selectedKeys.includes(k)}
                                onCheckedChange={() => toggleSingle(k)}
                                aria-label="Vybrat záznam"
                              />
                            </td>
                            <td className="p-2 font-medium">
                              {formatFullName(r)}
                            </td>
                            <td className="p-2">{r.position ?? "—"}</td>
                            <td className="hidden p-2 sm:table-cell">
                              {r.department ?? "—"}
                            </td>
                            <td className="whitespace-nowrap p-2">
                              {r.date
                                ? fmt(new Date(r.date), "dd.MM.yyyy")
                                : "–"}
                            </td>
                            <td className="hidden p-2 sm:table-cell">
                              <Badge
                                variant={
                                  r.type === "onboarding"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {r.type === "onboarding" ? "Nástup" : "Odchod"}
                              </Badge>
                            </td>
                            <td className="hidden p-2 sm:table-cell">
                              <Badge
                                variant={r.isPlanned ? "secondary" : "default"}
                              >
                                {r.isPlanned ? "Plánované" : "Skutečné"}
                              </Badge>
                            </td>
                            <td className="p-2">
                              {r.wasSent ? (
                                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCircle2 className="size-3 shrink-0" />
                                    <span>Odesláno</span>
                                  </span>
                                  {r.sentDate && (
                                    <span className="pl-4 text-[10px]">
                                      {fmt(new Date(r.sentDate), "dd.MM.yyyy")}
                                    </span>
                                  )}
                                </div>
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
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t px-4 py-3 sm:px-6">
            <div className="flex flex-wrap justify-end gap-2">
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
                disabled={selectedKeys.length === 0 || sending || loading}
                className="inline-flex items-center gap-1.5"
              >
                <Mail className="size-4 shrink-0" />
                Vybrané ({selectedKeys.length})
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
            Chceš je zahrnout znovu do tohoto reportu?
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
              Chyba při odesílání
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
