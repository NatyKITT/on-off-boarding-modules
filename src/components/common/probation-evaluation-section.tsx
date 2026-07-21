"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  History,
  Lock,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserRound,
} from "lucide-react"

import { useIsReadonly } from "@/hooks/use-current-role"
import { useToast } from "@/hooks/use-toast"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ProbationEvaluationDialog } from "@/components/common/probation-evaluation-dialog"

type ProbationStatus =
  | "DRAFT"
  | "READY"
  | "SENT"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"

type ProbationFormType = "REGULAR_EMPLOYEE" | "MANAGERIAL"

type ProbationEvent = {
  id: number
  action: string
  message: string | null
  byName: string | null
  byEmail: string | null
  createdAt: string
  mailQueueId?: number | null
  meta?: unknown
}

type ProbationEvaluationRequest = {
  id: number
  onboardingId: number
  status: ProbationStatus
  formType: ProbationFormType
  token: string
  tokenExpiresAt: string | null
  probationEnd?: string | null
  isLocked: boolean

  supervisorName: string | null
  supervisorEmail: string | null
  supervisorPosition?: string | null
  supervisorDepartment?: string | null
  supervisorUnitName?: string | null

  sentAt: string | null
  sentBy?: string | null
  sentByName: string | null
  sentMethod: string | null

  lastReminderAt: string | null
  lastReminderBy?: string | null
  lastReminderByName: string | null
  reminderCount: number

  missingSupervisorNotifiedAt: string | null
  missingSupervisorNotifiedBy?: string | null
  hrInfoSentAt: string | null
  hrReminderBeforeEndSentAt: string | null

  completedAt: string | null
  completedBy?: string | null
  completedByName?: string | null
  completedByEmail?: string | null
  completedNotificationSentAt?: string | null
  completedNotificationSentBy?: string | null

  resetAt?: string | null
  resetBy?: string | null
  resetByName?: string | null

  evaluatorName?: string | null
  evaluatorEmail?: string | null
  evaluatorPosition?: string | null
  evaluatorDepartment?: string | null
  evaluatorUnitName?: string | null
  recommendation?: boolean | null
  evaluatedAt?: string | null

  createdAt: string
  updatedAt: string
  data?: unknown
  events?: ProbationEvent[]
}

type ProbationDetailResponse = {
  status?: "success" | "error" | "warning"
  message?: string
  error?: string
  request?: ProbationEvaluationRequest
  data?: ProbationEvaluationRequest
  onboarding?: {
    id: number
    fullName: string
    personalNumber?: string | null
    positionName: string | null
    positionType?: string | null
    department: string | null
    unitName: string | null
    actualStart: string | null
    plannedStart?: string | null
    probationEnd: string | null

    supervisorName?: string | null
    supervisorEmail?: string | null
    supervisorPosition?: string | null
    supervisorDepartment?: string | null
    supervisorUnitName?: string | null
  }
  currentUser?: {
    name: string | null
    email: string | null
  }
}

type StoredSignature = {
  signedByName?: string | null
  signedByEmail?: string | null
  signedAt?: string | null
  signedOnBehalf?: boolean | null
}

type RevisionMeta = {
  open?: boolean | null
  openedAt?: string | null
  openedByName?: string | null
  openedByEmail?: string | null
  editedAt?: string | null
  editedByName?: string | null
  editedByEmail?: string | null
  count?: number | null
}

type StoredProbationData = {
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  evaluatorPosition?: string | null
  evaluatorDepartment?: string | null
  evaluatorUnitName?: string | null
  recommendation?: "yes" | "no" | boolean | "" | null
  reason?: string | null
  reasonIfNo?: string | null
  signature?: StoredSignature | null
  lastEditedAt?: string | null
  lastEditedByName?: string | null
  lastEditedByEmail?: string | null
  revision?: RevisionMeta | null
}

type SendDialogMode = "send" | "remind"

type Props = {
  active?: boolean
  onboardingId: number
  supervisorName?: string | null
  supervisorEmail?: string | null
  probationEvaluationSentAt?: string | Date | null
  probationEvaluationSentBy?: string | null
  onSent?: () => void
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "—"

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—"

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleDateString("cs-CZ")
}

function daysUntil(value?: string | Date | null) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000)
}

function cleanInline(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null
}

function joinInline(values: Array<string | null | undefined>) {
  const cleaned = values
    .map(cleanInline)
    .filter((value): value is string => Boolean(value))

  return cleaned.length > 0 ? cleaned.join(" • ") : null
}

function getStoredData(value: unknown): StoredProbationData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as StoredProbationData
}

function getEventRevisionAction(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const revisionAction = (value as Record<string, unknown>).revisionAction

  return typeof revisionAction === "string" ? revisionAction : null
}

function statusLabel(status: ProbationStatus) {
  switch (status) {
    case "DRAFT":
      return "Rozpracováno"
    case "READY":
      return "Připraveno k vyplnění"
    case "SENT":
      return "Odesláno vedoucímu"
    case "COMPLETED":
      return "Vyplněno"
    case "CANCELLED":
      return "Zastaveno (odchod ve zkušební době)"
    case "EXPIRED":
      return "Vypršel link"
    default:
      return status
  }
}

function statusVariant(
  status: ProbationStatus
): "default" | "outline" | "secondary" {
  switch (status) {
    case "COMPLETED":
      return "default"
    case "READY":
    case "SENT":
      return "outline"
    case "CANCELLED":
    case "EXPIRED":
      return "secondary"
    default:
      return "secondary"
  }
}

function formTypeLabel(type?: ProbationFormType | null) {
  return type === "MANAGERIAL" ? "Vedoucí / manažerská pozice" : "Zaměstnanec"
}

function recommendationLabel(value?: boolean | "yes" | "no" | "" | null) {
  if (value === true || value === "yes") return "Doporučeno pokračování"
  if (value === false || value === "no") return "Nedoporučeno pokračování"
  return "Bez stanoviska"
}

function recommendationVariant(
  value?: boolean | "yes" | "no" | "" | null
): "default" | "secondary" | "outline" {
  if (value === true || value === "yes") return "default"
  if (value === false || value === "no") return "secondary"
  return "outline"
}

function getErrorMessage(
  json: ProbationDetailResponse | null,
  fallback: string
) {
  return json?.message ?? json?.error ?? fallback
}

function isUnavailableStatus(status?: ProbationStatus | null) {
  return status === "CANCELLED" || status === "EXPIRED"
}

function eventLabel(eventOrAction: ProbationEvent | string) {
  const action =
    typeof eventOrAction === "string" ? eventOrAction : eventOrAction.action
  const revisionAction =
    typeof eventOrAction === "string"
      ? null
      : getEventRevisionAction(eventOrAction.meta)

  if (action === "UPDATED" && revisionAction === "opened_for_edit") {
    return "Formulář otevřen k úpravě"
  }

  if (action === "UPDATED" && revisionAction === "edited") {
    return "Formulář upraven"
  }

  switch (action) {
    case "CREATED":
      return "Formulář vytvořen"
    case "INVITE_SENT":
      return "Pozvánka odeslána"
    case "INVITE_QUEUED":
      return "Pozvánka zařazena k hromadnému odeslání"
    case "REMINDER_SENT":
      return "Připomínka odeslána"
    case "REMINDER_QUEUED":
      return "Připomínka zařazena k hromadnému odeslání"
    case "HR_INFO_QUEUED":
      return "Informace pro HR zařazena k hromadnému odeslání"
    case "HR_INFO_SENT":
      return "Informace pro HR odeslána"
    case "HR_REMINDER_QUEUED":
      return "Připomínka pro HR zařazena k hromadnému odeslání"
    case "HR_REMINDER_SENT":
      return "Připomínka pro HR odeslána"
    case "COMPLETED":
      return "Formulář vyplněn"
    case "EDIT_REOPENED":
      return "Formulář otevřen k úpravě"
    case "EDITED":
      return "Formulář upraven"
    case "UPDATED":
      return "Záznam upraven"
    case "RESET":
      return "Data vymazána"
    case "LOCKED":
      return "Formulář uzamčen"
    case "UNLOCKED":
      return "Formulář odemčen"
    case "EMAIL_FAILED":
      return "E-mail se nepodařilo odeslat"
    case "MISSING_SUPERVISOR":
      return "Chybí vedoucí daného zaměstnance"
    default:
      return action
  }
}

function DetailTile({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  tone?: "default" | "warning" | "success" | "muted"
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "muted"
          ? "bg-muted/30"
          : "bg-background"

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium leading-snug">{value || "—"}</div>
    </div>
  )
}

function ProcessStep({
  done,
  active,
  warning,
  label,
  description,
}: {
  done: boolean
  active?: boolean
  warning?: boolean
  label: string
  description: string
}) {
  const className = done
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : warning
      ? "border-red-200 bg-red-50 text-red-700"
      : active
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-muted bg-muted/30 text-muted-foreground"

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="size-4 shrink-0" />
        ) : warning ? (
          <AlertTriangle className="size-4 shrink-0" />
        ) : (
          <Circle className="size-4 shrink-0" />
        )}
        <div className="text-sm font-semibold">{label}</div>
      </div>
      <div className="mt-1 pl-6 text-xs opacity-90">{description}</div>
    </div>
  )
}

function AlertBox({
  tone,
  title,
  children,
}: {
  tone: "warning" | "danger" | "info"
  title: string
  children: React.ReactNode
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-blue-200 bg-blue-50 text-blue-800"

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${className}`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <div className="mt-0.5 text-xs">{children}</div>
      </div>
    </div>
  )
}

export function ProbationEvaluationSection({
  active = true,
  onboardingId,
  supervisorName,
  supervisorEmail,
  probationEvaluationSentAt,
  probationEvaluationSentBy,
  onSent,
}: Props) {
  const { toast } = useToast()
  const isReadonly = useIsReadonly()
  const hasLoadedRef = React.useRef(false)

  const [request, setRequest] =
    React.useState<ProbationEvaluationRequest | null>(null)
  const [detail, setDetail] = React.useState<ProbationDetailResponse | null>(
    null
  )

  const [loading, setLoading] = React.useState(false)
  const [ensuring, setEnsuring] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [reminding, setReminding] = React.useState(false)
  const [locking, setLocking] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [sendingPdf, setSendingPdf] = React.useState(false)

  const [error, setError] = React.useState<string | null>(null)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [formDialogOpen, setFormDialogOpen] = React.useState(false)

  const [sendDialogMode, setSendDialogMode] =
    React.useState<SendDialogMode | null>(null)
  const [manualEmail, setManualEmail] = React.useState("")

  const [sendPdfOpen, setSendPdfOpen] = React.useState(false)
  const [pdfEmail, setPdfEmail] = React.useState("")

  const onboarding = detail?.onboarding ?? null
  const storedData = React.useMemo(
    () => getStoredData(request?.data),
    [request?.data]
  )
  const revision = storedData.revision ?? null
  const revisionOpen = revision?.open === true
  const signature = storedData.signature ?? null

  const effectiveSupervisorName =
    request?.supervisorName ||
    onboarding?.supervisorName ||
    supervisorName ||
    storedData.evaluatorName ||
    request?.evaluatorName ||
    null

  const effectiveSupervisorEmail =
    request?.supervisorEmail ||
    onboarding?.supervisorEmail ||
    supervisorEmail ||
    storedData.evaluatorEmail ||
    request?.evaluatorEmail ||
    null

  const effectiveSupervisorPosition =
    request?.supervisorPosition ||
    onboarding?.supervisorPosition ||
    storedData.evaluatorPosition ||
    request?.evaluatorPosition ||
    null

  const effectiveSupervisorDepartment =
    request?.supervisorDepartment ||
    onboarding?.supervisorDepartment ||
    storedData.evaluatorDepartment ||
    request?.evaluatorDepartment ||
    null

  const effectiveSupervisorUnitName =
    request?.supervisorUnitName ||
    onboarding?.supervisorUnitName ||
    storedData.evaluatorUnitName ||
    request?.evaluatorUnitName ||
    null

  const effectiveSupervisorOrg = joinInline([
    effectiveSupervisorDepartment,
    effectiveSupervisorUnitName,
  ])

  const effectiveSupervisorDetails = joinInline([
    effectiveSupervisorPosition,
    effectiveSupervisorOrg,
    effectiveSupervisorEmail,
  ])

  const evaluatorOrg = joinInline([
    storedData.evaluatorDepartment,
    storedData.evaluatorUnitName,
  ])

  const evaluatorDetails = joinInline([
    storedData.evaluatorPosition,
    evaluatorOrg,
    storedData.evaluatorEmail ?? request?.evaluatorEmail,
  ])

  const hasSupervisorName = Boolean(effectiveSupervisorName?.trim())
  const hasSupervisorEmail = Boolean(effectiveSupervisorEmail?.trim())
  const hasCompleteSupervisor = hasSupervisorName && hasSupervisorEmail

  const employmentStart =
    onboarding?.actualStart ?? onboarding?.plannedStart ?? null

  const probationEnd = request?.probationEnd ?? onboarding?.probationEnd ?? null
  const daysToEnd = daysUntil(probationEnd)

  const sentAtFormatted =
    formatDateTime(request?.sentAt) !== "—"
      ? formatDateTime(request?.sentAt)
      : formatDateTime(probationEvaluationSentAt)

  const sentByLabel =
    request?.sentByName || probationEvaluationSentBy || request?.sentMethod

  const completedAtFormatted = formatDateTime(request?.completedAt)
  const completedByLabel =
    request?.completedByName ||
    request?.completedByEmail ||
    signature?.signedByName ||
    signature?.signedByEmail ||
    request?.evaluatorName ||
    request?.evaluatorEmail

  const lastReminderAtFormatted = formatDateTime(request?.lastReminderAt)
  const hrNotificationAtFormatted = formatDateTime(
    request?.completedNotificationSentAt
  )
  const hrReminderAtFormatted = formatDateTime(
    request?.hrReminderBeforeEndSentAt
  )
  const lastEditedAtFormatted = formatDateTime(storedData.lastEditedAt)
  const lastEditedByLabel =
    storedData.lastEditedByName || storedData.lastEditedByEmail || null

  const isCompleted =
    request?.status === "COMPLETED" || Boolean(request?.completedAt)

  const isLocked = Boolean(request?.isLocked)
  const unavailable = isUnavailableStatus(request?.status)

  const isDraft = request?.status === "DRAFT"
  const isReady = request?.status === "READY"
  const isSent = request?.status === "SENT"

  const shouldWarnNotCompleted =
    !isCompleted &&
    typeof daysToEnd === "number" &&
    daysToEnd <= 21 &&
    daysToEnd >= 0

  const shouldWarnThreeDays =
    !isCompleted &&
    typeof daysToEnd === "number" &&
    daysToEnd <= 3 &&
    daysToEnd >= 0

  const isAfterProbationEnd =
    !isCompleted && typeof daysToEnd === "number" && daysToEnd < 0

  const canSend =
    Boolean(request) &&
    !request?.isLocked &&
    !unavailable &&
    (!isCompleted || revisionOpen)

  const canRemind =
    Boolean(request) &&
    !request?.isLocked &&
    !unavailable &&
    (!isCompleted || revisionOpen)

  const canReset = Boolean(request) && !request?.isLocked
  const canOpenPdf = Boolean(request) && isCompleted
  const canSendPdf = Boolean(request) && isCompleted

  const loadOrEnsure = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true)

      setEnsuring(true)
      setError(null)

      try {
        const res = await fetch(
          `/api/nastupy/${onboardingId}/probation-evaluation`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            headers: {
              Accept: "application/json",
            },
          }
        )

        const json = (await res
          .json()
          .catch(() => null)) as ProbationDetailResponse | null

        if (!res.ok) {
          throw new Error(
            getErrorMessage(
              json,
              "Nepodařilo se načíst nebo vytvořit formulář k vyhodnocení zkušební doby."
            )
          )
        }

        if (!json?.request || !json?.onboarding) {
          throw new Error(
            "API nevrátilo kompletní detail formuláře k vyhodnocení zkušební doby."
          )
        }

        setDetail(json)
        setRequest(json.request)

        return json.request
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Nepodařilo se načíst formulář k vyhodnocení zkušební doby."

        setError(message)

        return null
      } finally {
        setEnsuring(false)
        if (!opts?.silent) setLoading(false)
      }
    },
    [onboardingId]
  )

  React.useEffect(() => {
    if (!active) return
    if (hasLoadedRef.current) return

    hasLoadedRef.current = true
    void loadOrEnsure()
  }, [active, loadOrEnsure])

  async function refreshFromJsonOrReload(json: ProbationDetailResponse | null) {
    if (json?.request && json?.onboarding) {
      setDetail(json)
      setRequest(json.request)
      return json.request
    }

    return loadOrEnsure({ silent: true })
  }

  function openSendDialog(mode: SendDialogMode) {
    setSendDialogMode(mode)
    setManualEmail(effectiveSupervisorEmail ?? "")
  }

  async function handleSendConfirmed() {
    if (!sendDialogMode) return

    const email = manualEmail.trim()

    if (!email) {
      setError(
        "Vyplňte e-mail, na který se má formulář k vyhodnocení zkušební doby odeslat."
      )
      return
    }

    const isReminder = sendDialogMode === "remind"

    if (isReminder) setReminding(true)
    else setSending(true)

    setError(null)

    try {
      const endpoint = isReminder
        ? `/api/nastupy/${onboardingId}/probation-evaluation/remind`
        : `/api/nastupy/${onboardingId}/probation-evaluation/invite`

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          supervisorEmail: email,
        }),
      })

      const json = (await res
        .json()
        .catch(() => null)) as ProbationDetailResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(
            json,
            isReminder
              ? "Nepodařilo se odeslat připomínku k vyplnění formuláře vyhodnocení zkušební doby."
              : "Nepodařilo se odeslat formulář k vyhodnocení zkušební doby."
          )
        )
      }

      await refreshFromJsonOrReload(json)
      onSent?.()

      toast({
        title: isReminder
          ? "Připomínka k vyplnění formuláře odeslána"
          : "Odkaz na formulář odeslán",
        description: isReminder
          ? `Připomínka k formuláři vyhodnocení zkušební doby byla odeslána na ${email}.`
          : `Odkaz na formulář k vyhodnocení zkušební doby byl odeslán na ${email}.`,
      })

      setSendDialogMode(null)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : isReminder
            ? "Odeslání připomínky k formuláři vyhodnocení zkušební doby se nezdařilo."
            : "Odeslání formuláře k vyhodnocení zkušební doby se nezdařilo."

      setError(message)

      toast({
        title: isReminder
          ? "Chyba při odeslání připomínky"
          : "Chyba při odesílání",
        description: message,
        variant: "destructive",
      })
    } finally {
      setSending(false)
      setReminding(false)
    }
  }

  async function handleToggleLock() {
    if (!request) return

    setLocking(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/probation-evaluation/lock`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "include",
          body: JSON.stringify({
            locked: !request.isLocked,
          }),
        }
      )

      const json = (await res
        .json()
        .catch(() => null)) as ProbationDetailResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(
            json,
            "Nepodařilo se změnit zámek u formuláře k vyhodnocení zkušební doby."
          )
        )
      }

      await refreshFromJsonOrReload(json)

      toast({
        title: request.isLocked
          ? "Formulář je odemknutý"
          : "Formulář je zamčený",
        description: request.isLocked
          ? "Formulář je znovu možné upravovat."
          : "Formulář je uzamčený proti úpravám.",
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Změna zámku se nezdařila."

      setError(message)

      toast({
        title: "Chyba při změně zámku",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLocking(false)
    }
  }

  async function handleResetConfirmed() {
    if (!request) return

    setResetting(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/probation-evaluation/reset`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "include",
        }
      )

      const json = (await res
        .json()
        .catch(() => null)) as ProbationDetailResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(
            json,
            "Resetovat data k formuláři vyhodnocení zkušební doby se nezdařilo."
          )
        )
      }

      await refreshFromJsonOrReload(json)

      toast({
        title: "Formulář obnoven",
        description:
          "Vyplněná data byla smazána a formulář k vyhodnocení zkušební doby se vrátil do stavu čekání.",
      })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Reset dat ve formuláři k vyhodnocení zkušební doby se nezdařil."

      setError(message)

      toast({
        title: "Chyba při resetu dat formuláře",
        description: message,
        variant: "destructive",
      })
    } finally {
      setResetting(false)
      setConfirmReset(false)
    }
  }

  async function handleSendPdfConfirmed() {
    if (!request) return

    const to = pdfEmail.trim()

    if (!to) {
      setError(
        "Vyplňte e-mail příjemce PDF formuláře k vyhodnocení zkušební doby."
      )
      return
    }

    setSendingPdf(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/probation-evaluation/send-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "include",
          body: JSON.stringify({
            to,
          }),
        }
      )

      const json = (await res.json().catch(() => null)) as {
        message?: string
        error?: string
      } | null

      if (!res.ok) {
        throw new Error(
          json?.message ??
            json?.error ??
            "PDF formuláře k vyhodnocení zkušební doby se nepodařilo odeslat."
        )
      }

      await loadOrEnsure({ silent: true })

      toast({
        title: "PDF formuláře odesláno",
        description:
          json?.message ??
          `PDF formuláře k vyhodnocení zkušební doby bylo odesláno na ${to}.`,
      })

      setSendPdfOpen(false)
      setPdfEmail("")
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "PDF formuláře k vyhodnocení zkušební doby se nepodařilo odeslat."

      setError(message)

      toast({
        title: "Chyba při odeslání PDF formuláře",
        description: message,
        variant: "destructive",
      })
    } finally {
      setSendingPdf(false)
    }
  }

  function openForm() {
    setFormDialogOpen(true)
  }

  function openPdf() {
    window.open(
      `/api/nastupy/${onboardingId}/probation-evaluation/pdf`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  return (
    <section className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-b-2 border-current" />
          <span>Načítám vyhodnocení zkušební doby…</span>
        </div>
      )}

      {!loading && request && (
        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="border-b bg-background p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Vyhodnocení zkušební doby
                    </h3>
                  </div>

                  <Badge variant={statusVariant(request.status)}>
                    {statusLabel(request.status)}
                  </Badge>

                  <Badge variant="outline">
                    {formTypeLabel(request.formType)}
                  </Badge>

                  {isLocked && (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" />
                      Zamčeno
                    </Badge>
                  )}

                  {revisionOpen && (
                    <Badge variant="outline" className="gap-1">
                      Otevřeno k úpravě
                    </Badge>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <DetailTile
                    icon={<UserRound className="size-3.5" />}
                    label="Zaměstnanec"
                    value={onboarding?.fullName ?? "—"}
                  />

                  <DetailTile
                    icon={<UserCheck className="size-3.5" />}
                    label="Osobní číslo"
                    value={
                      onboarding?.personalNumber ? (
                        <span className="font-mono">
                          {onboarding.personalNumber}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />

                  <DetailTile
                    icon={<ShieldCheck className="size-3.5" />}
                    label="Pozice"
                    value={onboarding?.positionName || "—"}
                  />

                  <DetailTile
                    label="Odbor / oddělení"
                    value={
                      [onboarding?.department, onboarding?.unitName]
                        .filter(Boolean)
                        .join(" – ") || "—"
                    }
                  />

                  <DetailTile
                    icon={<CalendarDays className="size-3.5" />}
                    label="Datum nástupu"
                    value={formatDate(employmentStart)}
                  />

                  <DetailTile
                    icon={<Clock className="size-3.5" />}
                    label="Konec zkušební doby"
                    value={
                      <div className="space-y-0.5">
                        <div>{formatDate(probationEnd)}</div>
                        {typeof daysToEnd === "number" && !isCompleted && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {daysToEnd >= 0
                              ? `zbývá ${daysToEnd} dní`
                              : `po termínu ${Math.abs(daysToEnd)} dní`}
                          </div>
                        )}
                      </div>
                    }
                    tone={
                      isAfterProbationEnd || shouldWarnThreeDays
                        ? "warning"
                        : "default"
                    }
                  />
                </div>

                <div className="grid gap-2 md:grid-cols-[1fr,1fr]">
                  <DetailTile
                    icon={
                      hasCompleteSupervisor ? (
                        <Mail className="size-3.5" />
                      ) : (
                        <AlertTriangle className="size-3.5 text-amber-600" />
                      )
                    }
                    label="Vedoucí / hodnotitel"
                    value={
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {cleanInline(effectiveSupervisorName) || "Nepřiřazen"}
                        </div>

                        <div className="break-words text-xs font-normal text-muted-foreground">
                          {effectiveSupervisorDetails ||
                            "Pozice, odbor a e-mail vedoucího nejsou vyplněny."}
                        </div>

                        {!hasSupervisorEmail && (
                          <div className="text-xs font-normal text-red-600">
                            Chybí e-mail vedoucího
                          </div>
                        )}

                        {!hasSupervisorName && (
                          <div className="text-xs font-normal text-red-600">
                            Chybí jméno vedoucího
                          </div>
                        )}
                      </div>
                    }
                    tone={hasCompleteSupervisor ? "success" : "warning"}
                  />
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadOrEnsure()}
                disabled={loading || ensuring}
                className="shrink-0 gap-2"
              >
                <RefreshCw
                  className={
                    loading || ensuring ? "size-4 animate-spin" : "size-4"
                  }
                />
                Aktualizovat stav
              </Button>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <section className="space-y-2">
              <div>
                <h4 className="text-sm font-semibold">Stav procesu</h4>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ProcessStep
                  done={Boolean(request.createdAt)}
                  label="Vytvořeno"
                  description={formatDateTime(request.createdAt)}
                />

                <ProcessStep
                  done={Boolean(request.sentAt)}
                  active={!request.sentAt && (isDraft || isReady)}
                  label="Odesláno vedoucímu"
                  description={
                    sentAtFormatted !== "—"
                      ? `${sentAtFormatted}${sentByLabel ? ` · ${sentByLabel}` : ""}${
                          lastReminderAtFormatted !== "—"
                            ? ` · připomínka ${lastReminderAtFormatted}`
                            : ""
                        }`
                      : "Zatím neodesláno"
                  }
                />

                <ProcessStep
                  done={isCompleted}
                  active={!isCompleted && isSent}
                  warning={isAfterProbationEnd}
                  label="Vyplněno"
                  description={
                    completedAtFormatted !== "—"
                      ? `${completedAtFormatted}${completedByLabel ? ` · ${completedByLabel}` : ""}`
                      : "Čeká na vyplnění"
                  }
                />

                <ProcessStep
                  done={Boolean(request.completedNotificationSentAt)}
                  active={isCompleted && !request.completedNotificationSentAt}
                  label="Odesláno HR"
                  description={
                    hrNotificationAtFormatted !== "—"
                      ? hrNotificationAtFormatted
                      : hrReminderAtFormatted !== "—"
                        ? `Připomínka HR ${hrReminderAtFormatted}`
                        : isCompleted
                          ? "Čeká na odeslání oznámení HR"
                          : "Odeslání HR po vyplnění formuláře"
                  }
                />
              </div>
            </section>

            {!hasSupervisorEmail && (
              <AlertBox
                tone="danger"
                title="Chybí e-mail vedoucího pro vyhodnocení formuláře."
              >
                Bez e-mailu nelze automaticky odeslat formulář vedoucímu k
                vyhodnocení zkušební doby.
              </AlertBox>
            )}

            {shouldWarnThreeDays && (
              <AlertBox
                tone="warning"
                title="Zkušební doba končí za 3 dny nebo méně."
              >
                Pokud formulář není vyplněný, 3 dny před koncem bude na HR a
                vedoucímu zaslána připomínka.
              </AlertBox>
            )}

            {shouldWarnNotCompleted && !shouldWarnThreeDays && (
              <AlertBox
                tone="warning"
                title={`Zkušební doba končí za ${daysToEnd} dní a vyhodnocení zkušební doby zatím není vyplněné.`}
              >
                Doporučeno zkontrolovat, zda byl formulář vedoucímu odeslán,
                případně ho odeslat ručně nebo zaslat připomínku.
              </AlertBox>
            )}

            {isAfterProbationEnd && (
              <AlertBox
                tone="danger"
                title="Zkušební doba již skončila a vyhodnocení není vyplněné."
              >
                Zkontrolujte stav zaslání ručně a případně kontaktujte
                vedoucího.
              </AlertBox>
            )}

            {isLocked && (
              <AlertBox tone="warning" title="Formulář je uzamčený.">
                HR si formulář může zobrazit, ale úpravy jsou zakázané, dokud ho
                HR znovu neodemkne. Ostatní k němu již nemají přístup.
              </AlertBox>
            )}

            <section className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">
                    Detail vyhodnocení zkušební doby
                  </h4>
                </div>

                <Badge
                  variant={recommendationVariant(
                    request.recommendation ?? storedData.recommendation
                  )}
                >
                  {recommendationLabel(
                    request.recommendation ?? storedData.recommendation
                  )}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <DetailTile
                  icon={<CheckCircle2 className="size-3.5" />}
                  label="Doporučení"
                  value={recommendationLabel(
                    request.recommendation ?? storedData.recommendation
                  )}
                  tone={request.recommendation ? "success" : "muted"}
                />

                <DetailTile
                  icon={<UserRound className="size-3.5" />}
                  label="Hodnotitel / podpis"
                  value={
                    <div className="space-y-1">
                      <div>
                        {storedData.evaluatorName ||
                          request.evaluatorName ||
                          signature?.signedByName ||
                          request.completedByName ||
                          "—"}
                      </div>
                      <div className="break-words text-xs font-normal text-muted-foreground">
                        {evaluatorDetails ||
                          storedData.evaluatorEmail ||
                          request.evaluatorEmail ||
                          signature?.signedByEmail ||
                          "—"}
                      </div>
                      {signature?.signedAt && (
                        <div className="text-xs font-normal text-muted-foreground">
                          Podepsáno {formatDateTime(signature.signedAt)}
                        </div>
                      )}
                    </div>
                  }
                />

                <DetailTile
                  icon={<History className="size-3.5" />}
                  label="Poslední úprava"
                  value={
                    lastEditedAtFormatted !== "—" ? (
                      <div className="space-y-0.5">
                        <div>{lastEditedAtFormatted}</div>
                        {lastEditedByLabel && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {lastEditedByLabel}
                          </div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )
                  }
                  tone={lastEditedAtFormatted !== "—" ? "muted" : "default"}
                />

                <DetailTile
                  icon={<Bell className="size-3.5" />}
                  label="Připomínky / zaslání"
                  value={
                    <div className="space-y-0.5">
                      <div>Vedoucímu {request.reminderCount ?? 0}×</div>
                      {lastReminderAtFormatted !== "—" && (
                        <div className="text-xs font-normal text-muted-foreground">
                          naposledy {lastReminderAtFormatted}
                        </div>
                      )}
                      {hrReminderAtFormatted !== "—" && (
                        <div className="text-xs font-normal text-muted-foreground">
                          HR připomínka {hrReminderAtFormatted}
                        </div>
                      )}
                    </div>
                  }
                />
              </div>

              {revisionOpen && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  Formulář je otevřený k úpravě
                  {revision.openedByName || revision.openedByEmail
                    ? ` – ${revision.openedByName || revision.openedByEmail}`
                    : ""}
                  {revision.openedAt
                    ? ` (${formatDateTime(revision.openedAt)})`
                    : ""}
                  .
                </div>
              )}
            </section>

            <section className="border-t pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={openForm}
                  className="gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]"
                >
                  <FileText className="size-4" />
                  {isCompleted
                    ? "Zobrazit / upravit formulář"
                    : "Otevřít formulář"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openSendDialog("send")}
                  disabled={!canSend || sending || isReadonly}
                  className="gap-2"
                >
                  {sending ? (
                    <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Odeslat vedoucímu
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openSendDialog("remind")}
                  disabled={!canRemind || reminding || isReadonly}
                  className="gap-2"
                >
                  {reminding ? (
                    <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Bell className="size-4" />
                  )}
                  Poslat připomínku
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={openPdf}
                  disabled={!canOpenPdf}
                  className="gap-2"
                >
                  <FileText className="size-4" />
                  PDF otevřít
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSendPdfOpen(true)}
                  disabled={!canSendPdf || sendingPdf || isReadonly}
                  className="gap-2"
                >
                  <Mail className="size-4" />
                  Odeslat PDF
                </Button>

                <Button
                  size="sm"
                  variant={request.isLocked ? "default" : "outline"}
                  onClick={() => void handleToggleLock()}
                  disabled={locking || isReadonly}
                  className="gap-2"
                >
                  {request.isLocked ? (
                    <Lock className="size-4" />
                  ) : (
                    <Unlock className="size-4" />
                  )}
                  {request.isLocked ? "Odemknout" : "Zamknout"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHistoryOpen(true)}
                  disabled={!request.events?.length}
                  className="gap-2"
                >
                  <History className="size-4" />
                  Historie
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmReset(true)}
                  disabled={!canReset || resetting || isReadonly}
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {resetting ? (
                    <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Vymazat data
                </Button>
              </div>
            </section>
          </div>
        </div>
      )}

      {request && (
        <ProbationEvaluationDialog
          onboardingId={onboardingId}
          employeeName={onboarding?.fullName ?? null}
          open={formDialogOpen}
          onOpenChange={setFormDialogOpen}
          onSaved={(submitMode) => {
            void loadOrEnsure({ silent: true })

            if (submitMode === "final" || submitMode === "revision") {
              onSent?.()
            }
          }}
          onClosed={() => {
            void loadOrEnsure({ silent: true })
          }}
        />
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historie vyhodnocení zkušební doby</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {request?.events?.length ? (
              request.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border bg-muted/30 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{eventLabel(event)}</span>
                    <span className="text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>

                  {event.message && (
                    <p className="mt-1 text-muted-foreground">
                      {event.message}
                    </p>
                  )}

                  {(event.byName || event.byEmail) && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Provedl(a): {event.byName || event.byEmail}
                    </p>
                  )}

                  {event.mailQueueId && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ID e-mailové fronty: {event.mailQueueId}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Zatím není zaznamenaná žádná událost.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(sendDialogMode)}
        onOpenChange={(open) => {
          if (!open) setSendDialogMode(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {sendDialogMode === "remind"
                ? "Poslat připomínku"
                : "Odeslat formulář vyhodnocení"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">
                {effectiveSupervisorName || "Vedoucí není vyplněn"}
              </div>
              <div className="break-words text-xs text-muted-foreground">
                {effectiveSupervisorDetails ||
                  "E-mail je možné před odesláním ručně upravit."}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">E-mail příjemce</label>
              <Input
                type="email"
                value={manualEmail}
                onChange={(event) => setManualEmail(event.target.value)}
                placeholder="vedouci@praha6.cz"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendDialogMode(null)}
              >
                Zrušit
              </Button>

              <Button
                type="button"
                onClick={() => void handleSendConfirmed()}
                disabled={!manualEmail.trim() || sending || reminding}
                className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              >
                {sendDialogMode === "remind"
                  ? "Poslat připomínku"
                  : "Odeslat formulář vyhodnocení"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sendPdfOpen} onOpenChange={setSendPdfOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Odeslat PDF formuláře k vyhodnocení zkušební doby
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">E-mail příjemce</label>
              <Input
                type="email"
                value={pdfEmail}
                onChange={(event) => setPdfEmail(event.target.value)}
                placeholder="prijemce@praha6.cz"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSendPdfOpen(false)}
              >
                Zrušit
              </Button>

              <Button
                type="button"
                onClick={() => void handleSendPdfConfirmed()}
                disabled={!pdfEmail.trim() || sendingPdf}
                className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              >
                {sendingPdf ? "Odesílám…" : "Odeslat PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Vymazat vyplněná data formuláře k vyhodnocení zkušební doby?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vyplněná data vyhodnocení zkušební doby budou odstraněna a
              formulář se vrátí do stavu čekání. Historie událostí zůstane
              zachována.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleResetConfirmed()}
            >
              Vymazat data formuláře
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
