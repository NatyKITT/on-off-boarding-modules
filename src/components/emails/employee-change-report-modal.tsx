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

type SendMode = "selected" | "all" | "unsentOnly"
type ReportTypeFilter = "ALL" | "NAME" | "POSITION" | "NAME_AND_POSITION"

type EmployeeChangeType = "POSITION" | "NAME" | "NAME_AND_POSITION"
type EmployeeChangeStatus = "DRAFT" | "APPLIED" | "CANCELLED"

interface ChangeReportRecord {
  id: number
  type: EmployeeChangeType
  status: EmployeeChangeStatus
  employeeName: string
  personalNumber: string | null
  effectiveDate: string

  oldTitleBefore?: string | null
  newTitleBefore?: string | null
  oldName?: string | null
  newName?: string | null
  oldSurname?: string | null
  newSurname?: string | null
  oldTitleAfter?: string | null
  newTitleAfter?: string | null

  oldPositionNum?: string | null
  newPositionNum?: string | null
  oldPositionName?: string | null
  newPositionName?: string | null
  oldDepartment?: string | null
  newDepartment?: string | null
  oldUnitName?: string | null
  newUnitName?: string | null

  wasSent: boolean
  sentDate?: string | null
}

interface RecordsResponse {
  records: ChangeReportRecord[]
}

interface Props {
  openSignal?: number
  defaultMonth?: string
}

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 " +
  "focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary " +
  "focus-visible:ring-2 focus-visible:ring-primary/55 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background"

function rowKey(record: ChangeReportRecord) {
  return `employee-change-${record.id}`
}

function changeTypeLabel(type: EmployeeChangeType) {
  if (type === "NAME") return "Jméno / titul"
  if (type === "POSITION") return "Pozice / odbor"
  return "Jméno i pozice"
}

function statusLabel(status: EmployeeChangeStatus) {
  if (status === "CANCELLED") return "Zrušeno"
  return "Aktivní změna"
}

function reportTypeFilterLabel(type: ReportTypeFilter) {
  if (type === "NAME") return "Jen jméno / titul"
  if (type === "POSITION") return "Jen pozice / odbor"
  if (type === "NAME_AND_POSITION") return "Jméno i pozice"
  return "Všechny typy změn"
}

function formatDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return "–"

  return fmt(date, "dd.MM.yyyy")
}

function buildCompactSummary(record: ChangeReportRecord) {
  const parts: string[] = []

  if (record.type === "NAME" || record.type === "NAME_AND_POSITION") {
    if (record.oldSurname !== record.newSurname && record.newSurname) {
      parts.push(
        `Příjmení: původně ${record.oldSurname || "–"}, nově ${record.newSurname}`
      )
    }

    if (record.oldName !== record.newName && record.newName) {
      parts.push(
        `Jméno: původně ${record.oldName || "–"}, nově ${record.newName}`
      )
    }

    if (
      record.oldTitleBefore !== record.newTitleBefore &&
      record.newTitleBefore
    ) {
      parts.push(
        `Titul před: původně ${record.oldTitleBefore || "–"}, nově ${record.newTitleBefore}`
      )
    }

    if (record.oldTitleAfter !== record.newTitleAfter && record.newTitleAfter) {
      parts.push(
        `Titul za: původně ${record.oldTitleAfter || "–"}, nově ${record.newTitleAfter}`
      )
    }
  }

  if (record.type === "POSITION" || record.type === "NAME_AND_POSITION") {
    if (record.oldPositionName !== record.newPositionName) {
      parts.push(
        `Pozice: původně ${record.oldPositionName || "–"}, nově ${
          record.newPositionName || "–"
        }`
      )
    }

    if (record.oldDepartment !== record.newDepartment) {
      parts.push(
        `Odbor: původně ${record.oldDepartment || "–"}, nově ${record.newDepartment || "–"}`
      )
    }

    if (record.oldPositionNum !== record.newPositionNum) {
      parts.push(
        `Č. funkce: původně ${record.oldPositionNum || "–"}, nově ${
          record.newPositionNum || "–"
        }`
      )
    }
  }

  return parts.length > 0 ? parts.join("; ") : "Bez detailu změny"
}

export function EmployeeChangeReportModal({
  openSignal,
  defaultMonth = fmt(new Date(), "yyyy-MM"),
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (openSignal) setOpen(true)
  }, [openSignal])

  const [month, setMonth] = useState(defaultMonth)
  const [records, setRecords] = useState<ChangeReportRecord[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [audience, setAudience] = useState<
    "ONBOARDING_GROUP" | "ALL_EMPLOYEES" | "HR_GROUP"
  >("ONBOARDING_GROUP")
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>("ALL")
  const [emailSubject, setEmailSubject] = useState("")
  const [emailIntro, setEmailIntro] = useState(
    "Dobrý den, posíláme přehled zaměstnaneckých změn za vybrané období."
  )

  const [confirmState, setConfirmState] = useState<{
    open: boolean
    mode: SendMode | null
    alreadySent: number
    total: number
  }>({ open: false, mode: null, alreadySent: 0, total: 0 })

  const [successState, setSuccessState] = useState<{
    open: boolean
    total: number
  }>({ open: false, total: 0 })

  const [errorState, setErrorState] = useState<{
    open: boolean
    message: string | null
  }>({ open: false, message: null })

  const monthLabel = useMemo(
    () => fmt(new Date(`${month}-01`), "LLLL yyyy", { locale: cs }),
    [month]
  )

  useEffect(() => {
    setEmailSubject(`Měsíční report zaměstnaneckých změn – ${monthLabel}`)
  }, [monthLabel])

  const filteredRecords = useMemo(() => {
    if (typeFilter === "ALL") return records

    return records.filter((record) => record.type === typeFilter)
  }, [records, typeFilter])

  const loadRecords = useCallback(async () => {
    if (!open) return

    setLoading(true)

    try {
      const params = new URLSearchParams({ month, audience })
      const res = await fetch(`/api/zmeny/reporty/mesicni/zaznamy?${params}`, {
        cache: "no-store",
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Nepodařilo se načíst změny.")
      }

      const json = (await res.json()) as Partial<RecordsResponse>
      const rows = Array.isArray(json?.records) ? json.records : []

      setRecords(rows)
      setSelectedKeys([])
    } catch (error) {
      setErrorState({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "Nepodařilo se načíst změny.",
      })
      setRecords([])
      setSelectedKeys([])
    } finally {
      setLoading(false)
    }
  }, [audience, month, open])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  const sentCount = useMemo(
    () => filteredRecords.filter((record) => record.wasSent).length,
    [filteredRecords]
  )

  const selectedSentCount = useMemo(
    () =>
      filteredRecords.filter(
        (record) => selectedKeys.includes(rowKey(record)) && record.wasSent
      ).length,
    [filteredRecords, selectedKeys]
  )

  function toggleAll() {
    if (
      filteredRecords.length > 0 &&
      selectedKeys.length === filteredRecords.length
    ) {
      setSelectedKeys([])
    } else {
      setSelectedKeys(filteredRecords.map(rowKey))
    }
  }

  function toggleUnsent() {
    setSelectedKeys(
      filteredRecords.filter((record) => !record.wasSent).map(rowKey)
    )
  }

  function toggleSingle(key: string) {
    setSelectedKeys((previous) =>
      previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key]
    )
  }

  async function handleSend(mode: SendMode, force = false) {
    const payloadRows =
      mode === "selected"
        ? filteredRecords.filter((record) =>
            selectedKeys.includes(rowKey(record))
          )
        : mode === "unsentOnly"
          ? filteredRecords.filter((record) => !record.wasSent)
          : filteredRecords

    if (payloadRows.length === 0) return

    const alreadySentInPayload = payloadRows.filter(
      (record) => record.wasSent
    ).length

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
      const res = await fetch("/api/zmeny/reporty/mesicni/odeslat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          mode,
          audience,
          typeFilter,
          subject: emailSubject.trim() || undefined,
          intro: emailIntro.trim() || undefined,
          records: payloadRows.map((record) => ({
            id: record.id,
          })),
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Chyba při odesílání reportu změn.")
      }

      setSuccessState({ open: true, total: payloadRows.length })
      await loadRecords()
    } catch (error) {
      setErrorState({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "Chyba při odesílání reportu změn.",
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
            <DialogTitle>Měsíční report změn – {monthLabel}</DialogTitle>
          </DialogHeader>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-lenis-prevent=""
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <div className="space-y-4 p-4 sm:px-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <Label htmlFor="employee-change-report-month">Měsíc</Label>
                  <input
                    id="employee-change-report-month"
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    className={cn(
                      "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      focusRing
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="employee-change-report-audience">
                    Příjemci
                  </Label>
                  <select
                    id="employee-change-report-audience"
                    value={audience}
                    onChange={(e) =>
                      setAudience(e.target.value as typeof audience)
                    }
                    className={cn(
                      "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      focusRing
                    )}
                  >
                    <option value="ONBOARDING_GROUP">
                      Vybraná skupina / nástupy
                    </option>
                    <option value="ALL_EMPLOYEES">Všichni zaměstnanci</option>
                    <option value="HR_GROUP">Jen HR / interní evidence</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="employee-change-report-type">Typ změn</Label>
                  <select
                    id="employee-change-report-type"
                    value={typeFilter}
                    onChange={(event) =>
                      setTypeFilter(event.target.value as ReportTypeFilter)
                    }
                    className={cn(
                      "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      focusRing
                    )}
                  >
                    <option value="ALL">Všechny změny</option>
                    <option value="NAME">Jen jméno / titul</option>
                    <option value="POSITION">Jen pozice / odbor</option>
                    <option value="NAME_AND_POSITION">Jméno i pozice</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="employee-change-report-subject">
                    Předmět e-mailu
                  </Label>
                  <input
                    id="employee-change-report-subject"
                    value={emailSubject}
                    onChange={(event) => setEmailSubject(event.target.value)}
                    className={cn(
                      "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      focusRing
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="employee-change-report-intro">
                    Úvodní text e-mailu
                  </Label>
                  <textarea
                    id="employee-change-report-intro"
                    value={emailIntro}
                    onChange={(event) => setEmailIntro(event.target.value)}
                    rows={3}
                    className={cn(
                      "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      focusRing
                    )}
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Odesílá se filtr:{" "}
                <span className="font-medium text-foreground">
                  {reportTypeFilterLabel(typeFilter)}
                </span>
                . E-mail se zařadí do fronty podobně jako reporty nástupů a
                odchodů.
              </div>

              {sentCount > 0 && (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    {sentCount} z {filteredRecords.length} změn už bylo v
                    měsíčním reportu odesláno.
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
                  {selectedKeys.length === filteredRecords.length &&
                  filteredRecords.length > 0
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
                  Vybráno: {selectedKeys.length} / {filteredRecords.length}
                </div>
              </div>

              <div
                className={cn(
                  "max-h-[44vh] overflow-auto rounded-lg border bg-background",
                  "[-webkit-overflow-scrolling:touch]",
                  "[overscroll-behavior:contain]"
                )}
                aria-busy={loading}
              >
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Načítám…
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Žádné změny v tomto měsíci
                  </div>
                ) : (
                  <table className="w-full min-w-[860px] text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                      <tr>
                        <th className="w-10 p-2">
                          <Checkbox
                            checked={
                              filteredRecords.length > 0 &&
                              selectedKeys.length === filteredRecords.length
                            }
                            onCheckedChange={toggleAll}
                            aria-label="Vybrat všechny změny"
                          />
                        </th>
                        <th className="p-2 text-left font-medium">
                          Zaměstnanec
                        </th>
                        <th className="p-2 text-left font-medium">Typ změny</th>
                        <th className="p-2 text-left font-medium">Účinnost</th>
                        <th className="p-2 text-left font-medium">Změna</th>
                        <th className="p-2 text-left font-medium">Stav</th>
                        <th className="w-32 p-2 text-left font-medium">
                          Report
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRecords.map((record) => {
                        const key = rowKey(record)

                        return (
                          <tr
                            key={key}
                            className={cn(
                              "border-t hover:bg-muted/20",
                              record.wasSent && "bg-muted/10"
                            )}
                          >
                            <td className="p-2">
                              <Checkbox
                                checked={selectedKeys.includes(key)}
                                onCheckedChange={() => toggleSingle(key)}
                                aria-label="Vybrat změnu"
                              />
                            </td>

                            <td className="p-2">
                              <div className="font-medium">
                                {record.employeeName}
                              </div>
                              {record.personalNumber && (
                                <div className="font-mono text-xs text-muted-foreground">
                                  #{record.personalNumber}
                                </div>
                              )}
                            </td>

                            <td className="p-2">
                              <Badge variant="secondary">
                                {changeTypeLabel(record.type)}
                              </Badge>
                            </td>

                            <td className="whitespace-nowrap p-2">
                              {formatDate(record.effectiveDate)}
                            </td>

                            <td className="max-w-[360px] p-2">
                              <span className="line-clamp-2">
                                {buildCompactSummary(record)}
                              </span>
                            </td>

                            <td className="p-2">
                              <Badge
                                variant={
                                  record.status === "CANCELLED"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {statusLabel(record.status)}
                              </Badge>
                            </td>

                            <td className="p-2">
                              {record.wasSent ? (
                                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <CheckCircle2 className="size-3 shrink-0" />
                                    <span>Odesláno</span>
                                  </span>
                                  {record.sentDate && (
                                    <span className="pl-4 text-[10px]">
                                      {formatDate(record.sentDate)}
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
            <DialogTitle>Odeslat znovu již odeslané změny?</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            V aktuálním výběru je{" "}
            <span className="font-semibold">{confirmState.alreadySent}</span>{" "}
            změn, které už byly dříve odeslány.
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
                const mode = confirmState.mode
                setConfirmState((prev) => ({ ...prev, open: false }))
                if (mode) void handleSend(mode, true)
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
              Report změn zařazen k odeslání
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {successState.total} změn bylo zařazeno do měsíčního reportu.
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
              Chyba
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
