"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Calendar, History as HistoryIcon, User } from "lucide-react"

import { useCurrentRole } from "@/hooks/use-current-role"
import { canEditInternalApp } from "@/lib/rbac"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Kind = "onboarding" | "offboarding" | "employee-change"

type AuditRow = {
  id: number
  employeeId: number
  userId: string
  displayUser?: string
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: string
}

function parseJSON(v: string | null): unknown {
  if (!v) return null
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

const CZ_FIELD_LABEL: Record<string, string> = {
  titleBefore: "Titul před",
  name: "Jméno",
  surname: "Příjmení",
  titleAfter: "Titul za",
  positionNum: "Číslo pozice",
  positionName: "Pozice",
  positionType: "Typ pozice",
  department: "Odbor",
  unitName: "Oddělení",
  notes: "Poznámka",
  status: "Stav",
  email: "E-mail (osobní)",
  phone: "Telefon",
  plannedStart: "Plánovaný nástup",
  actualStart: "Skutečný nástup",
  probationEnd: "Konec zkušební doby",
  probationMonths: "Délka zkušební doby",
  startTime: "Čas nástupu",
  userEmail: "Firemní účet",
  userName: "Uživatelské jméno",
  personalNumber: "Osobní číslo",
  plannedEnd: "Plánovaný odchod",
  actualEnd: "Skutečný odchod",
  noticePeriodEnd: "Konec výpovědní lhůty",
  noticeEnd: "Konec výpovědní lhůty",
  noticeMonths: "Délka výpovědní lhůty",
  deleted_at: "Smazání",
  deletedAt: "Smazání",
  deletedBy: "Smazal(a)",
  deleteReason: "Důvod smazání",
  restore_info: "Obnovení",
  restoredBy: "Obnovil(a)",
  restoredAt: "Datum obnovení",
  probationExtensions: "Prodloužení zkušební doby",
  probationExtensionSummary: "Shrnutí prodloužení zkušební doby",
  from: "Od",
  to: "Do",
  days: "Počet dní",
  note: "Poznámka",
  cancelled_at: "Zrušení",
  cancel_reason: "Důvod zrušení",
  cancelled_by: "Zrušil(a)",
  probationStopDecision: "Zastavení zkušební doby",
  mentorName: "Jméno mentora",
  mentorEmail: "E-mail mentora",
  mentorSurname: "Příjmení mentora",
  mentorTitleBefore: "Titul mentora před",
  mentorTitleAfter: "Titul mentora za",
  mentorPosition: "Pozice mentora",
  mentorDepartment: "Odbor mentora",
  mentorUnitName: "Oddělení mentora",
  mentorPersonalNumber: "Osobní číslo mentora",
  mentorSource: "Zdroj údajů o mentorovi",
  mentorGid: "Identifikátor mentora",
  mentorManualOverride: "Ruční úprava mentora",
  mentorAssignedFrom: "Mentor přiřazen od",
  supervisorName: "Jméno vedoucího",
  supervisorEmail: "E-mail vedoucího",
  supervisorSurname: "Příjmení vedoucího",
  supervisorTitleBefore: "Titul vedoucího před",
  supervisorTitleAfter: "Titul vedoucího za",
  supervisorPosition: "Pozice vedoucího",
  supervisorDepartment: "Odbor vedoucího",
  supervisorUnitName: "Oddělení vedoucího",
  supervisorPersonalNumber: "Osobní číslo vedoucího",
  supervisorSource: "Zdroj údajů o vedoucím",
  supervisorGid: "Identifikátor vedoucího",
  supervisorManualOverride: "Ruční úprava vedoucího",
  isManager: "Vedoucí pozice",
  hasCustomDates: "Vlastní termíny",
  type: "Typ změny",
  audience: "Skupina",
  effectiveDate: "Datum účinnosti",
  initial_creation: "Založení záznamu",
  updated_at: "Úprava záznamu",
  EMPLOYEE_INFO: "E-mail zaměstnanci",
  oldTitleBefore: "Původní titul před",
  newTitleBefore: "Nový titul před",
  oldName: "Původní jméno",
  newName: "Nové jméno",
  oldSurname: "Původní příjmení",
  newSurname: "Nové příjmení",
  oldTitleAfter: "Původní titul za",
  newTitleAfter: "Nový titul za",
  oldDepartment: "Původní odbor",
  newDepartment: "Nový odbor",
  oldUnitName: "Původní oddělení",
  newUnitName: "Nové oddělení",
  oldPositionName: "Původní pozice",
  newPositionName: "Nová pozice",
  oldPositionNum: "Původní č. funkce",
  newPositionNum: "Nové č. funkce",
  appliedAt: "Propojeno",
  emailSentAt: "Report odeslán",
  subject: "Předmět",
  recipients: "Příjemci",
  "*": "Záznam",
}

const CZ_ACTION_LABEL: Record<string, string> = {
  CREATE: "Vytvoření záznamu",
  UPDATE: "Úprava",
  DELETE: "Smazání",
  RESTORED: "Obnovení",
  REVERTED: "Vrácení zpět",
  CANCELLED: "Zrušení",
  STATUS_CHANGED: "Změna stavu",
  MAIL_ENQUEUED: "E-mail zařazen k odeslání",
  MAIL_SENT: "E-mail odeslán",
  MAIL_FAILED: "Odeslání e-mailu selhalo",
  OFFICIAL_CHANGE_APPLIED: "Propojení se záznamy",
}

function humanizeFieldName(field: string): string {
  return field
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}

function fieldLabel(field: string | null | undefined): string {
  if (!field) return "Záznam"
  return CZ_FIELD_LABEL[field] ?? humanizeFieldName(field)
}

function actionLabel(action: string): string {
  return CZ_ACTION_LABEL[action] ?? humanizeFieldName(action)
}

const DATE_FIELD_HINTS = [
  "plannedStart",
  "actualStart",
  "plannedEnd",
  "actualEnd",
  "probationEnd",
  "noticePeriodEnd",
  "noticeEnd",
  "effectiveDate",
  "appliedAt",
  "emailSentAt",
  "deleted_at",
  "deletedAt",
  "cancelled_at",
  "updated_at",
  "sentAt",
]

function looksLikeIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(v)
}

const CZ_VALUE_LABEL: Record<string, string> = {
  NEW: "Nový",
  IN_PROGRESS: "Probíhá",
  COMPLETED: "Dokončeno",
  CANCELLED: "Zrušeno",

  QUEUED: "Ve frontě",
  PROCESSING: "Zpracovává se",
  SENT: "Odesláno",
  FAILED: "Selhalo",

  EMPLOYEE_INFO: "E-mail zaměstnanci",
  MONTHLY_SUMMARY: "Měsíční souhrn",
  PROBATION_EVALUATION_INVITE: "Pozvánka k hodnocení zkušební doby",
  PROBATION_EVALUATION_REMINDER: "Připomínka hodnocení zkušební doby",
  PROBATION_EVALUATION_HR_INFO: "Info pro HR o hodnocení zkušební doby",
  PROBATION_EVALUATION_HR_MISSING_SUPERVISOR: "Info pro HR – chybí vedoucí",
  PROBATION_EVALUATION_HR_NOT_COMPLETED: "Info pro HR – hodnocení nedokončeno",
  PROBATION_EVALUATION_COMPLETED: "Hodnocení zkušební doby dokončeno",
  NOTICE_WARNING: "Upozornění na výpověď",
  NOTICE_ENDING: "Konec výpovědní lhůty",
  SIGNATURE_INVITE: "Pozvánka k podpisu",
  EXIT_CHECKLIST_SIGNATURE_INVITE: "Pozvánka k podpisu výstupního listu",
  EXIT_SIGNATURE_INVITE: "Pozvánka k podpisu výstupu",
  BEHALF_SIGNATURE_INVITE: "Pozvánka k podpisu v zastoupení",
  EXIT_CHECKLIST_BEHALF_SIGNATURE: "Podpis výstupního listu v zastoupení",
  HANDOVER_RECIPIENT: "Příjemce předání",
  HANDOVER_RECIPIENT_INFO: "Info pro příjemce předání",
  EXIT_CHECKLIST_HANDOVER_RECIPIENT: "Příjemce předání – výstupní list",
  EXIT_CHECKLIST_COMPLETED: "Výstupní list dokončen",
  EXIT_CHECKLIST_COMPLETION: "Dokončení výstupního listu",
  EXIT_CHECKLIST_PDF: "PDF výstupního listu",
  EMPLOYEE_CHANGE_INFO: "Info o zaměstnanecké změně",
  EMPLOYEE_CHANGE_SUMMARY: "Souhrn zaměstnaneckých změn",
  MANUAL_EMAIL: "Ruční e-mail",
  SYSTEM_NOTIFICATION: "Systémové oznámení",
  GENERIC_EMAIL: "E-mail",
  MENTOR_ASSIGNED: "Přiřazen mentor",
  STATISTICS_REPORT: "Statistický report",

  sick_leave: "Dočasná pracovní neschopnost / nemoc",
  vacation: "Dovolená",
  family_care: "OČR / ošetřování člena rodiny",
  maternity_parental: "Mateřská / rodičovská dovolená",
  other_obstacle: "Jiná celodenní překážka v práci",
  unexcused_absence: "Neomluvená absence",

  planned_onboarding: "Plánovaný nástup",
  actual_onboarding: "Skutečný nástup",
  planned_offboarding: "Plánovaný odchod",
  actual_offboarding: "Skutečný odchod",

  POSITION: "Změna pozice",
  NAME: "Změna jména",
  NAME_AND_POSITION: "Změna jména a pozice",

  DRAFT: "Koncept",
  APPLIED: "Uplatněno",

  ONBOARDING_GROUP: "Skupina nástupů",
  ALL_EMPLOYEES: "Všichni zaměstnanci",
  HR_GROUP: "Skupina HR",

  STOP: "Zastavit",
  KEEP: "Pokračovat",

  MANUAL: "Ručně",
  USER: "Uživatel",
}

function formatValueString(
  field: string | null | undefined,
  raw: string
): string {
  const f = field ?? ""
  const isDateField =
    DATE_FIELD_HINTS.some((k) => f.includes(k)) || looksLikeIsoDate(raw)

  if (isDateField) {
    try {
      const d = new Date(raw.length > 10 ? raw : `${raw}T00:00:00`)
      if (!isNaN(d.getTime())) {
        const hasTime = raw.includes("T") || raw.includes(" ")
        return format(d, hasTime ? "d.M.yyyy HH:mm" : "d.M.yyyy", {
          locale: cs,
        })
      }
    } catch {
      // ignore
    }
  }

  if (raw === "true") return "Ano"
  if (raw === "false") return "Ne"
  if (CZ_VALUE_LABEL[raw]) return CZ_VALUE_LABEL[raw]
  if (/^\[object Object\](,\[object Object\])*$/.test(raw)) {
    return "Podrobnosti nejsou k dispozici (starší, nesprávně uložený záznam)"
  }

  return raw
}

function formatObjectItem(item: Record<string, unknown>): string {
  return Object.entries(item)
    .filter(([key]) => key !== "id")
    .map(([key, entryVal]) => {
      const value =
        entryVal == null || entryVal === ""
          ? "—"
          : typeof entryVal === "string"
            ? formatValueString(key, entryVal)
            : typeof entryVal === "boolean"
              ? entryVal
                ? "Ano"
                : "Ne"
              : String(entryVal)

      return `${fieldLabel(key)}: ${value}`
    })
    .join(", ")
}

function formatArrayValue(items: unknown[]): string {
  return items
    .map((item) =>
      typeof item === "string"
        ? formatValueString(null, item)
        : item != null && typeof item === "object"
          ? formatObjectItem(item as Record<string, unknown>)
          : String(item)
    )
    .join("; ")
}

function toDisplayEntries(
  field: string | null | undefined,
  val: unknown
): Array<{ label: string; value: string }> {
  if (val == null || val === "")
    return [{ label: fieldLabel(field), value: "—" }]

  if (typeof val === "boolean") {
    return [{ label: fieldLabel(field), value: val ? "Ano" : "Ne" }]
  }

  if (typeof val === "string") {
    return [{ label: fieldLabel(field), value: formatValueString(field, val) }]
  }

  if (typeof val === "number") {
    return [{ label: fieldLabel(field), value: String(val) }]
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return [{ label: fieldLabel(field), value: "—" }]

    return [{ label: fieldLabel(field), value: formatArrayValue(val) }]
  }

  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>)

    if (entries.length === 0) return [{ label: fieldLabel(field), value: "—" }]

    return entries.map(([key, entryVal]) => ({
      label: fieldLabel(key),
      value:
        entryVal == null || entryVal === ""
          ? "—"
          : typeof entryVal === "string"
            ? formatValueString(key, entryVal)
            : typeof entryVal === "boolean"
              ? entryVal
                ? "Ano"
                : "Ne"
              : Array.isArray(entryVal)
                ? formatArrayValue(entryVal)
                : JSON.stringify(entryVal),
    }))
  }

  return [{ label: fieldLabel(field), value: String(val) }]
}

function DisplayEntries({
  entries,
  emphasize,
}: {
  entries: Array<{ label: string; value: string }>
  emphasize?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {entries.map((entry, idx) => (
        <div key={`${entry.label}-${idx}`}>
          <div className="text-[11px] font-medium uppercase text-muted-foreground">
            {entry.label}
          </div>
          <div
            className={
              emphasize
                ? "break-words font-semibold"
                : "break-words text-muted-foreground"
            }
          >
            {entry.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function getActionBadgeVariant(
  action: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "CREATE":
    case "RESTORED":
      return "default"
    case "DELETE":
    case "MAIL_FAILED":
      return "destructive"
    case "STATUS_CHANGED":
    case "CANCELLED":
    case "REVERTED":
    case "MAIL_ENQUEUED":
    case "MAIL_SENT":
    case "OFFICIAL_CHANGE_APPLIED":
      return "secondary"
    default:
      return "outline"
  }
}

const ACTION_DESCRIPTION: Record<string, string> = {
  CREATE: "Záznam byl vytvořen.",
  UPDATE: "Záznam byl upraven.",
  DELETE: "Záznam byl smazán.",
  RESTORED: "Záznam byl obnoven ze smazaných.",
  REVERTED: "Poslední krok byl vrácen zpět.",
  CANCELLED: "Záznam byl zrušen.",
  MAIL_ENQUEUED: "E-mail byl zařazen do fronty k odeslání.",
  MAIL_SENT: "E-mail byl úspěšně odeslán.",
  MAIL_FAILED: "Odeslání e-mailu se nezdařilo.",
  OFFICIAL_CHANGE_APPLIED: "Změna byla propojena se záznamy nástupů / odchodů.",
}

const ACTION_FIELD_DESCRIPTION: Record<string, string> = {
  "RESTORED:cancelled_at": "Záznam byl vrácen z neuskutečněných.",
  "STATUS_CHANGED:probationStopDecision":
    "Bylo rozhodnuto o zkušební době souvisejícího nástupu.",
}

function rowDescription(action: string, field: string | null | undefined) {
  const key = field ? `${action}:${field}` : null
  return (
    (key && ACTION_FIELD_DESCRIPTION[key]) ??
    ACTION_DESCRIPTION[action] ??
    `${actionLabel(action)}.`
  )
}

type AuditGroup = {
  key: string
  userId: string
  displayUser: string
  action: string
  field: string | null
  createdAt: string
  items: AuditRow[]
}

const GROUP_THRESHOLD_MS = 5000

function groupRows(rows: AuditRow[]): AuditGroup[] {
  const groups: AuditGroup[] = []

  for (const row of rows) {
    const last = groups[groups.length - 1]
    const rowTime = new Date(row.createdAt).getTime()

    if (
      last &&
      last.userId === row.userId &&
      last.action === row.action &&
      Math.abs(new Date(last.createdAt).getTime() - rowTime) <=
        GROUP_THRESHOLD_MS
    ) {
      last.items.push(row)
      continue
    }

    groups.push({
      key: `g${row.id}`,
      userId: row.userId,
      displayUser: row.displayUser || row.userId || "Neznámý",
      action: row.action,
      field: row.field,
      createdAt: row.createdAt,
      items: [row],
    })
  }

  return groups
}

function hasOldValue(item: AuditRow) {
  return item.oldValue != null && item.oldValue !== ""
}

function hasNewValue(item: AuditRow) {
  return item.newValue != null && item.newValue !== ""
}

type GroupRenderPlan =
  | {
      mode: "grid"
      oldEntries: Array<{ label: string; value: string }>
      newEntries: Array<{ label: string; value: string }>
    }
  | { mode: "single"; entries: Array<{ label: string; value: string }> }
  | { mode: "list"; items: AuditRow[] }

function buildGroupRenderPlan(items: AuditRow[]): GroupRenderPlan {
  const allHaveBoth = items.every(
    (item) => hasOldValue(item) && hasNewValue(item)
  )

  if (allHaveBoth) {
    return {
      mode: "grid",
      oldEntries: items.flatMap((item) =>
        toDisplayEntries(item.field, parseJSON(item.oldValue))
      ),
      newEntries: items.flatMap((item) =>
        toDisplayEntries(item.field, parseJSON(item.newValue))
      ),
    }
  }

  const allHaveNewOnly = items.every(
    (item) => hasNewValue(item) && !hasOldValue(item)
  )

  if (allHaveNewOnly) {
    return {
      mode: "single",
      entries: items.flatMap((item) =>
        toDisplayEntries(item.field, parseJSON(item.newValue))
      ),
    }
  }

  const allHaveOldOnly = items.every(
    (item) => hasOldValue(item) && !hasNewValue(item)
  )

  if (allHaveOldOnly) {
    return {
      mode: "single",
      entries: items.flatMap((item) =>
        toDisplayEntries(item.field, parseJSON(item.oldValue))
      ),
    }
  }

  return { mode: "list", items }
}

function getEndpoint(kind: Kind, id: number): string {
  if (kind === "onboarding") return `/api/nastupy/${id}/history`
  if (kind === "offboarding") return `/api/odchody/${id}/history`
  return `/api/zmeny/${id}/history`
}

export function HistoryDialog({
  id,
  kind,
  trigger,
}: {
  id: number
  kind: Kind
  trigger?: React.ReactNode
}) {
  const role = useCurrentRole()
  const canView = canEditInternalApp(role)

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !canView) return
    const loadHistory = async () => {
      setLoading(true)
      try {
        const res = await fetch(getEndpoint(kind, id), { cache: "no-store" })
        if (!res.ok) {
          setRows([])
          return
        }
        const j = await res.json()
        setRows(Array.isArray(j?.data) ? j.data : [])
      } catch {
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    void loadHistory()
  }, [open, canView, kind, id])

  if (!canView) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="icon" variant="ghost" title="Historie změn">
            <HistoryIcon className="size-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="flex max-h-[90svh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b p-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-5 shrink-0" />
            <span>Historie změn</span>
            {rows && rows.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({rows.length})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-lenis-prevent=""
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="p-4 sm:px-6">
            {loading || !rows ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Načítám historii…
                </span>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center">
                <HistoryIcon className="mx-auto mb-2 size-12 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  Zatím žádné změny.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupRows(rows).map((group) => {
                  const label = actionLabel(group.action)
                  const fLabel = fieldLabel(group.field)
                  const plan = buildGroupRenderPlan(group.items)

                  return (
                    <div
                      key={group.key}
                      className="rounded-lg border bg-muted/30 p-3 sm:p-4"
                    >
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <Badge
                          variant={getActionBadgeVariant(group.action)}
                          className="w-fit"
                        >
                          {label}
                          {group.action === "UPDATE" &&
                          group.field &&
                          group.items.length === 1
                            ? `: ${fLabel}`
                            : ""}
                        </Badge>

                        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:items-end">
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 shrink-0" />
                            <span className="break-words font-medium">
                              {group.displayUser}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="size-3.5 shrink-0" />
                            <span>
                              {format(
                                new Date(group.createdAt),
                                "d.M.yyyy HH:mm",
                                { locale: cs }
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {plan.mode === "grid" ? (
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                          <div className="min-w-0 rounded-md border bg-background/50 p-3">
                            <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                              Původní hodnota
                            </div>
                            <DisplayEntries entries={plan.oldEntries} />
                          </div>
                          <div className="min-w-0 rounded-md border border-primary/20 bg-primary/5 p-3">
                            <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                              Nová hodnota
                            </div>
                            <DisplayEntries
                              entries={plan.newEntries}
                              emphasize
                            />
                          </div>
                        </div>
                      ) : plan.mode === "single" ? (
                        <div className="space-y-2 text-sm">
                          <p className="text-muted-foreground">
                            {ACTION_DESCRIPTION[group.action] ?? `${label}.`}
                          </p>
                          <div className="min-w-0 rounded-md border bg-background/50 p-3">
                            <DisplayEntries entries={plan.entries} />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm">
                          {plan.items.map((item) => {
                            const itemHasOld = hasOldValue(item)
                            const itemHasNew = hasNewValue(item)

                            return (
                              <div key={item.id} className="space-y-2">
                                <p className="text-muted-foreground">
                                  {rowDescription(item.action, item.field)}
                                </p>

                                {itemHasNew && (
                                  <div className="min-w-0 rounded-md border bg-background/50 p-3">
                                    <DisplayEntries
                                      entries={toDisplayEntries(
                                        item.field,
                                        parseJSON(item.newValue)
                                      )}
                                    />
                                  </div>
                                )}

                                {!itemHasNew && itemHasOld && (
                                  <div className="min-w-0 rounded-md border bg-background/50 p-3">
                                    <DisplayEntries
                                      entries={toDisplayEntries(
                                        item.field,
                                        parseJSON(item.oldValue)
                                      )}
                                    />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
