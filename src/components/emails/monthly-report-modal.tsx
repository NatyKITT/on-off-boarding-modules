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

  async function send(mode: SendMode) {
    const payloadRows =
      mode === "selected"
        ? records.filter((r) => selectedKeys.includes(rowKey(r)))
        : records

    const alreadySentInPayload = payloadRows.filter((r) => r.wasSent).length
    if (mode !== "unsentOnly" && alreadySentInPayload > 0) {
      const ok = confirm(
        `${alreadySentInPayload} vybraných záznamů už bylo odesláno. Chceš je zahrnout znovu?`
      )
      if (!ok) return
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
        console.error(await res.text().catch(() => ""))
        alert("Chyba při odesílání reportu.")
        return
      }

      alert("Report odeslán.")
      setOpen(false)
    } catch (e) {
      console.error(e)
      alert("Chyba při odesílání.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>Měsíční report – {monthLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-4">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="month">Měsíc</Label>
            <input
              id="month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </div>

          <div className="min-w-[200px] flex-1">
            <Label>Režim</Label>
            <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
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
            <Tabs value={type} onValueChange={(v) => setType(v as TypeFilter)}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="nastupy">Nástupy</TabsTrigger>
                <TabsTrigger value="odchody">Odchody</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-end gap-4">
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
          <Alert className="mt-3">
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

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAll}
            disabled={loading}
          >
            {selectedKeys.length === records.length
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
          className="mt-2 flex-1 overflow-auto rounded-lg border"
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
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="w-12 p-2">
                    <Checkbox
                      checked={
                        selectedKeys.length === records.length &&
                        records.length > 0
                      }
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-2 text-left">Jméno</th>
                  <th className="p-2 text-left">Pozice</th>
                  <th className="p-2 text-left">Oddělení</th>
                  <th className="p-2 text-left">Datum</th>
                  <th className="p-2 text-left">Typ</th>
                  <th className="p-2 text-left">Režim</th>
                  <th className="p-2 text-left">Status</th>
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
                        />
                      </td>
                      <td className="p-2 font-medium">
                        {r.name} {r.surname}
                      </td>
                      <td className="p-2 text-sm">{r.position ?? "—"}</td>
                      <td className="p-2 text-sm">{r.department ?? "—"}</td>
                      <td className="p-2 text-sm">
                        {r.date ? fmt(new Date(r.date), "dd.MM.yyyy") : "–"}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            r.type === "onboarding" ? "default" : "secondary"
                          }
                        >
                          {r.type === "onboarding" ? "Nástup" : "Odchod"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant={r.isPlanned ? "secondary" : "default"}>
                          {r.isPlanned ? "Plánované" : "Skutečné"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {r.wasSent ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckCircle2 className="size-3" />
                            Již odesláno
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-green-600">
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

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Zrušit
          </Button>
          <Button
            onClick={() => send("unsentOnly")}
            disabled={sending || loading}
          >
            <Mail className="mr-2 size-4" />
            Odeslat jen neodeslané
          </Button>
          <Button
            onClick={() => send("selected")}
            disabled={selectedKeys.length === 0 || sending || loading}
          >
            <Mail className="mr-2 size-4" />
            Odeslat vybrané ({selectedKeys.length})
          </Button>
          <Button onClick={() => send("all")} disabled={sending || loading}>
            <Mail className="mr-2 size-4" />
            Odeslat celý měsíc
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
