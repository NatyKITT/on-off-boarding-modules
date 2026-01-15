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
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background"

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

      setSuccessState({
        open: true,
        mode,
        total: payloadRows.length,
      })

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
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>Měsíční report – {monthLabel}</DialogTitle>
          </DialogHeader>

          <div className="mt-3 flex flex-wrap gap-4">
            <div className="min-w-[200px] flex-1">
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

            <div className="min-w-[200px] flex-1">
              <Label>Režim</Label>
              <Tabs
                value={kind}
                onValueChange={(v) => setKind(v as Kind)}
                className="mt-1"
              >
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="actual" disabled={combineBoth}>
                    Skutečné
                  </TabsTrigger>
                  <TabsTrigger value="planned" disabled={combineBoth}>
                    Plánované
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="min-w-[200px] flex-1">
              <Label>Hlavní typ</Label>
              <Tabs
                value={type}
                onValueChange={(v) => setType(v as TypeFilter)}
                className="mt-1"
              >
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="nastupy">Nástupy</TabsTrigger>
                  <TabsTrigger value="odchody">Odchody</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-col justify-end gap-2">
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

          <div
            className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
            data-lenis-prevent=""
            onWheelCapture={(e) => e.stopPropagation()}
          >
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
                className="inline-flex items-center justify-center gap-2"
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
                className="inline-flex items-center justify-center gap-2"
              >
                Vybrat neodeslané
              </Button>
              <div className="ml-auto text-sm text-muted-foreground">
                Vybráno: {selectedKeys.length} / {records.length}
              </div>
            </div>

            <div
              className="rounded-lg border bg-background"
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
                <table className="w-full min-w-[720px] text-xs sm:text-sm">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b">
                      <th className="w-12 p-2">
                        <Checkbox
                          checked={
                            selectedKeys.length === records.length &&
                            records.length > 0
                          }
                          onCheckedChange={toggleAll}
                          aria-label="Vybrat všechny"
                        />
                      </th>
                      <th className="p-2 text-left">Jméno</th>
                      <th className="p-2 text-left">Pozice</th>
                      <th className="p-2 text-left">Oddělení</th>
                      <th className="p-2 text-left">Datum</th>
                      <th className="p-2 text-left">Typ</th>
                      <th className="p-2 text-left">Režim</th>
                      <th className="w-40 p-2 text-left">Status</th>
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
                          <td className="p-2 text-xs sm:text-sm">
                            {r.position ?? "—"}
                          </td>
                          <td className="p-2 text-xs sm:text-sm">
                            {r.department ?? "—"}
                          </td>
                          <td className="whitespace-nowrap p-2 text-xs sm:text-sm">
                            {r.date ? fmt(new Date(r.date), "dd.MM.yyyy") : "–"}
                          </td>
                          <td className="p-2">
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
                          <td className="p-2">
                            <Badge
                              variant={r.isPlanned ? "secondary" : "default"}
                            >
                              {r.isPlanned ? "Plánované" : "Skutečné"}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {r.wasSent ? (
                              <div className="flex min-w-[150px] flex-col gap-0.5 text-xs text-muted-foreground sm:text-sm">
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle2 className="size-3 shrink-0" />
                                  <span>Již odesláno</span>
                                </span>
                                {r.sentDate && (
                                  <span className="pl-5 text-[11px] sm:text-xs">
                                    Odesláno{" "}
                                    {fmt(new Date(r.sentDate), "dd.MM.yyyy")}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-green-600 sm:text-sm">
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

          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-2"
            >
              Zrušit
            </Button>
            <Button
              onClick={() => handleSend("unsentOnly")}
              disabled={sending || loading}
              className="inline-flex items-center justify-center gap-2"
            >
              <Mail className="size-4" />
              <span>Odeslat jen neodeslané</span>
            </Button>
            <Button
              onClick={() => handleSend("selected")}
              disabled={selectedKeys.length === 0 || sending || loading}
              className="inline-flex items-center justify-center gap-2"
            >
              <Mail className="size-4" />
              <span>Odeslat vybrané ({selectedKeys.length})</span>
            </Button>
            <Button
              onClick={() => handleSend("all")}
              disabled={sending || loading}
              className="inline-flex items-center justify-center gap-2"
            >
              <Mail className="size-4" />
              <span>Odeslat celý měsíc</span>
            </Button>
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
              className="inline-flex items-center justify-center gap-2"
            >
              Ne, neodesílat znovu
            </Button>
            <Button
              onClick={() => {
                const m = confirmState.mode
                setConfirmState((prev) => ({ ...prev, open: false }))
                if (m) void handleSend(m, true)
              }}
              className="inline-flex items-center justify-center gap-2"
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
              className="inline-flex items-center justify-center gap-2"
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
              className="inline-flex items-center justify-center gap-2"
            >
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
