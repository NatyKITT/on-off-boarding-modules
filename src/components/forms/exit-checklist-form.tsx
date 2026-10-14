"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  History as HistoryIcon,
  Info,
  Loader2,
  Lock,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Send,
  Undo2,
  X,
  XCircle,
} from "lucide-react"
import { useSession } from "next-auth/react"

import type {
  ExitAssetItem,
  ExitChecklistData,
  ExitChecklistItem,
  ExitChecklistSignatures,
  ExitChecklistSignatureValue,
  ExitResolvedValue,
  HandoverRecipient,
  HandoverSendHistoryEntry,
} from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"
import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

import { useSignatureName } from "@/hooks/use-signature-name"
import { looksLikePersonName } from "@/lib/exit-checklist-behalf-options"
import { getExitChecklistCompletionState } from "@/lib/exit-checklist-completion"
import { exitChecklistEventActionLabel } from "@/lib/exit-checklist-event-labels"
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
import { joinNameWithTitles } from "@/lib/format-name"

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EmployeeItem } from "@/components/common/employee-combobox"
import { EosPersonPickerDialog } from "@/components/common/eos-person-picker-dialog"
import {
  buildPersonFullName,
  PersonLookupCombobox,
} from "@/components/common/person-lookup-combobox"
import {
  PositionCombobox,
  type PositionSearchItem,
} from "@/components/common/position-combobox"
import { SignatureRecipientsDialog } from "@/components/common/signature-recipients-dialog"
import { DocumentHistoryDialog } from "@/components/history/document-history-dialog"

type Props = {
  offboardingId?: number
  publicToken?: string
  mode?: "internal" | "public"
  initialData: ExitChecklistData
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: (data: ExitChecklistData, requestClose?: boolean) => void
  externalSaveTrigger?: number
  onRequestSave?: () => void
}

type HeaderSignatureKey = "employee" | "manager" | "issuer"

type FeedbackDialogState = {
  open: boolean
  type: "success" | "error"
  title: string
  message: string
}

const emptySignature = (): ExitChecklistSignatureValue => ({
  signedByName: null,
  signedByEmail: null,
  signedAt: null,
})

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultIssuedDate(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : getTodayIsoDate()
}

function createTempId() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID()
    }
  } catch {}

  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function mergeItemsWithConfig(
  dataItems: ExitChecklistItem[]
): ExitChecklistItem[] {
  const existingByKey = new Map(dataItems.map((i) => [i.key, i]))

  return EXIT_CHECKLIST_ROWS.map((row) => {
    const found = existingByKey.get(row.key)

    return {
      ...row,
      resolved: found?.resolved ?? null,
      note: found?.note ?? null,
      signedByName: found?.signedByName ?? null,
      signedByEmail: found?.signedByEmail ?? null,
      signedAt: found?.signedAt ?? null,
    }
  })
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function cleanPositionName(value?: string | null, positionNum?: string | null) {
  const rawValue = (value ?? "").trim()
  const rawPositionNum = (positionNum ?? "").trim()

  if (!rawValue || !rawPositionNum) return rawValue

  const escapedPositionNum = rawPositionNum.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  )

  return rawValue
    .replace(new RegExp(`^${escapedPositionNum}\\s*[—–-]\\s*`), "")
    .replace(new RegExp(`^${escapedPositionNum}\\s+`), "")
    .trim()
}

function formatHandoverPositionLabel(
  positionNum?: string | null,
  positionName?: string | null,
  department?: string | null,
  unitName?: string | null
) {
  const cleanName = cleanPositionName(positionName, positionNum)
  const deptUnit = [department?.trim(), unitName?.trim()]
    .filter(Boolean)
    .join(" – ")

  return [positionNum?.trim(), cleanName, deptUnit].filter(Boolean).join(" — ")
}

function renderOrganization(text: string, managerName?: string | null) {
  const lines = text.split("\n").filter(Boolean)

  if (lines.length === 0) return null

  return (
    <div className="leading-snug">
      <div className="font-semibold">{lines[0]}</div>
      {lines[0] === "Vedoucí odboru" && managerName && (
        <div className="text-xs font-medium text-foreground">{managerName}</div>
      )}
      {lines.slice(1).map((line, i) => (
        <div
          key={i}
          className={
            looksLikePersonName(line)
              ? "text-xs font-medium text-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          {line}
        </div>
      ))}
    </div>
  )
}

function HeaderDetailTile({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-background px-3 py-2.5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium leading-snug">{value || "–"}</div>
    </div>
  )
}

type HeaderSignatureBlockProps = {
  label: string
  note?: React.ReactNode
  identityName?: string | null
  identityEmail?: string | null
  interactive?: boolean
  signDisabledReason?: string
  value: ExitChecklistSignatureValue
  isLocked: boolean
  isAdmin: boolean
  currentUserName: string
  currentUserEmail: string
  onSign: () => void
  onSignBehalf?: () => void
  onRevoke: () => void
}

function HeaderSignatureBlock({
  label,
  note,
  identityName,
  identityEmail,
  interactive = true,
  signDisabledReason,
  value,
  isLocked,
  isAdmin,
  currentUserName,
  currentUserEmail,
  onSign,
  onSignBehalf,
  onRevoke,
}: HeaderSignatureBlockProps) {
  const isSigned = Boolean(value.signedAt)
  const currentUserIsSigner =
    normalizeEmail(value.signedByEmail) === normalizeEmail(currentUserEmail)

  const canRevoke =
    interactive && !isLocked && isSigned && (isAdmin || currentUserIsSigner)
  const canSign =
    interactive &&
    !isLocked &&
    !isSigned &&
    Boolean(currentUserName || currentUserEmail)

  const signedAtDate = value.signedAt
    ? format(new Date(value.signedAt), "d.M.yyyy HH:mm")
    : ""

  return (
    <div
      className={`flex flex-col rounded-md border bg-background p-3 ${
        interactive ? "" : "opacity-60"
      }`}
      style={{ minHeight: "130px" }}
    >
      <Label className="mb-2 text-sm font-medium">{label}</Label>

      {identityName && (
        <div className="mb-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <div className="font-semibold text-foreground">{identityName}</div>
          {identityEmail && (
            <div className="text-muted-foreground">{identityEmail}</div>
          )}
        </div>
      )}

      <div style={{ minHeight: "52px" }} className="flex-1">
        {isSigned ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="font-semibold text-foreground">
              {value.signedByName ?? "Podepsáno"}
            </div>
            <div className="text-xs text-muted-foreground">
              Elektronicky podepsáno
            </div>
            <div className="text-xs text-muted-foreground">{signedAtDate}</div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Nepodepsáno
          </div>
        )}
      </div>

      <div
        className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[168px_168px]"
        style={{ minHeight: "70px" }}
      >
        {canSign ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs"
              onClick={onSign}
              disabled={Boolean(signDisabledReason)}
              title={signDisabledReason}
            >
              <Check className="size-3 shrink-0" />
              <span className="text-left">Podepsat</span>
            </Button>

            {onSignBehalf ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                onClick={onSignBehalf}
                disabled={Boolean(signDisabledReason)}
                title={signDisabledReason}
              >
                <Check className="size-3 shrink-0" />
                <span className="text-left">Podepsat v zastoupení</span>
              </Button>
            ) : (
              <div className="hidden h-8 sm:block" aria-hidden="true" />
            )}
          </>
        ) : canRevoke ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
              onClick={onRevoke}
            >
              <Undo2 className="size-3 shrink-0" />
              <span className="text-left">Zrušit podpis</span>
            </Button>
            <div className="hidden h-8 sm:block" aria-hidden="true" />
          </>
        ) : (
          <>
            <div className="hidden h-8 sm:block" aria-hidden="true" />
            <div className="hidden h-8 sm:block" aria-hidden="true" />
          </>
        )}
      </div>

      {note}
    </div>
  )
}

function TableSignatureCell({
  isSigned,
  isMuted,
  signedByName,
  signedAt,
}: {
  isSigned: boolean
  isMuted: boolean
  signedByName?: string | null
  signedAt: string
}) {
  return (
    <div className="flex h-[78px] min-w-0 flex-col justify-center overflow-hidden">
      {isSigned && !isMuted ? (
        <>
          <span
            className="min-w-0 break-words text-sm font-semibold leading-tight text-foreground"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
            title={signedByName ?? undefined}
          >
            {signedByName}
          </span>
          <span className="mt-1 truncate text-[11px] text-muted-foreground">
            Elektronicky podepsáno
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {signedAt}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">
          {isMuted ? "—" : "Nepodepsáno"}
        </span>
      )}
    </div>
  )
}

function TableActionCell({
  showSignButton,
  showRevokeButton,
  isOwnRow,
  onSign,
  onSignBehalf,
  onRevoke,
}: {
  showSignButton: boolean
  showRevokeButton: boolean
  isOwnRow?: boolean
  onSign: () => void
  onSignBehalf: () => void
  onRevoke: () => void
}) {
  return (
    <div className="grid h-[68px] w-full grid-rows-2 gap-1">
      {showSignButton ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full justify-start gap-1 px-1.5 text-xs"
            onClick={onSign}
          >
            <Check className="size-3 shrink-0" />
            <span className="min-w-0 truncate text-left">Podepsat</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`h-8 w-full justify-start gap-1 px-1.5 text-xs ${
              isOwnRow
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "text-muted-foreground"
            }`}
            onClick={onSignBehalf}
          >
            <Check className="size-3 shrink-0" />
            <span className="min-w-0 truncate text-left">
              Podepsat v zastoupení
            </span>
          </Button>
        </>
      ) : showRevokeButton ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-full justify-start gap-1 px-2 text-xs text-muted-foreground"
            onClick={onRevoke}
          >
            <Undo2 className="size-3 shrink-0" />
            <span className="min-w-0 truncate text-left">Zrušit podpis</span>
          </Button>
          <div className="h-8 w-full" aria-hidden="true" />
        </>
      ) : (
        <>
          <div className="h-8 w-full" aria-hidden="true" />
          <div className="h-8 w-full" aria-hidden="true" />
        </>
      )}
    </div>
  )
}

function buildHandoverRecipientSendKey(recipients: HandoverRecipient[]) {
  return recipients
    .filter((recipient) => {
      const email = normalizeEmail(recipient.email)
      return (
        Boolean(recipient.name?.trim()) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
    })
    .map((recipient) => ({
      email: normalizeEmail(recipient.email),
      name: recipient.name?.trim() ?? "",
      personalNumber: recipient.personalNumber?.trim() ?? "",
      department: recipient.department?.trim() ?? "",
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((recipient) =>
      [
        recipient.email,
        recipient.name,
        recipient.personalNumber,
        recipient.department,
      ].join("|")
    )
    .join(";;")
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return format(date, "d.M.yyyy HH:mm")
}

function mergeHandoverSendHistory(
  currentHistory: HandoverSendHistoryEntry[],
  sentRecipients: HandoverRecipient[],
  sentAt: string,
  sentByName: string | null,
  sentByEmail: string | null
): HandoverSendHistoryEntry[] {
  const historyByEmail = new Map<string, HandoverSendHistoryEntry>()

  currentHistory.forEach((entry) => {
    const email = normalizeEmail(entry.email)
    if (!email) return

    historyByEmail.set(email, entry)
  })

  sentRecipients.forEach((recipient) => {
    const email = normalizeEmail(recipient.email)
    if (!email) return

    const previous = historyByEmail.get(email)

    historyByEmail.set(email, {
      id: previous?.id ?? recipient.id ?? createTempId(),
      name: recipient.name || previous?.name || email,
      email,
      personalNumber:
        recipient.personalNumber ?? previous?.personalNumber ?? null,
      department: recipient.department ?? previous?.department ?? null,
      lastSentAt: sentAt,
      lastSentByName: sentByName,
      lastSentByEmail: sentByEmail,
      sentCount: (previous?.sentCount ?? 0) + 1,
    })
  })

  return Array.from(historyByEmail.values())
}

export function ExitChecklistForm({
  offboardingId,
  publicToken,
  mode = "internal",
  initialData,
  onDirtyChange,
  onSaved,
  externalSaveTrigger,
  onRequestSave,
}: Props) {
  const { data: session } = useSession()

  const [lockedAt, setLockedAt] = useState<string | null>(
    initialData.lockedAt ?? null
  )
  const [items, setItems] = useState<ExitChecklistItem[]>(
    mergeItemsWithConfig(initialData.items ?? [])
  )
  const [assets, setAssets] = useState<ExitAssetItem[]>(
    initialData.assets ?? []
  )
  const [noAssets, setNoAssets] = useState(initialData.noAssets ?? false)
  const [confirmClearAssetsOpen, setConfirmClearAssetsOpen] = useState(false)
  const [conflictOfInterest, setConflictOfInterest] = useState<boolean | null>(
    initialData.conflictOfInterest ?? null
  )

  const [handoverOption1, setHandoverOption1] = useState(
    initialData.handover?.option1 ?? false
  )
  const [handoverOption1Note, setHandoverOption1Note] = useState(
    initialData.handover?.option1Note ?? ""
  )
  const [handoverOption2, setHandoverOption2] = useState(
    initialData.handover?.option2 ?? false
  )
  const [handoverOption2Target, setHandoverOption2Target] = useState(
    cleanPositionName(
      initialData.handover?.option2Target,
      initialData.handover?.option2TargetPositionNum
    )
  )
  const [
    handoverOption2TargetPositionNum,
    setHandoverOption2TargetPositionNum,
  ] = useState(initialData.handover?.option2TargetPositionNum ?? "")
  const [handoverOption2TargetDepartment, setHandoverOption2TargetDepartment] =
    useState(initialData.handover?.option2TargetDepartment ?? "")
  const [handoverOption2TargetUnitName, setHandoverOption2TargetUnitName] =
    useState(initialData.handover?.option2TargetUnitName ?? "")
  const [handoverOption3, setHandoverOption3] = useState(
    initialData.handover?.option3 ?? false
  )
  const [handoverOption3Reason, setHandoverOption3Reason] = useState(
    initialData.handover?.option3Reason ?? ""
  )
  const [handoverRecipients, setHandoverRecipients] = useState<
    HandoverRecipient[]
  >(initialData.handover?.handoverRecipients ?? [])
  const includeHandoverAgenda =
    handoverOption1 || handoverOption2 || handoverOption3
  const assetsComplete = noAssets || assets.length > 0
  const handoverChoiceReady =
    handoverOption1 ||
    (handoverOption2 &&
      Boolean(
        handoverOption2Target.trim() || handoverOption2TargetPositionNum.trim()
      )) ||
    (handoverOption3 &&
      Boolean(handoverOption3Reason.trim()) &&
      handoverRecipients.length > 0)
  const handoverSignReady = includeHandoverAgenda && handoverChoiceReady
  const handoverSignBlockedReason = !includeHandoverAgenda
    ? "Nejdřív v sekci C vyberte způsob předání agendy."
    : !handoverChoiceReady
      ? handoverOption2
        ? "Nejdřív vyberte cílové funkční místo pro předání agendy."
        : !handoverOption3Reason.trim()
          ? "Nejdřív vyplňte důvod, proč agenda zatím zůstává na neobsazeném funkčním místě."
          : "Nejdřív vyplňte, kdo za dokumenty odpovídá."
      : undefined
  const [, setResponsibleParty] = useState<"KITT6" | "OSS_KT" | null>(
    initialData.handover?.responsibleParty ?? null
  )

  const [handoverSendHistory, setHandoverSendHistory] = useState<
    HandoverSendHistoryEntry[]
  >(initialData.handover?.handoverSendHistory ?? [])

  const [handoverRecipientsSentAt, setHandoverRecipientsSentAt] = useState<
    string | null
  >(initialData.handover?.handoverRecipientsSentAt ?? null)
  const [handoverRecipientsSentByName, setHandoverRecipientsSentByName] =
    useState<string | null>(
      initialData.handover?.handoverRecipientsSentByName ?? null
    )
  const [handoverRecipientsSentByEmail, setHandoverRecipientsSentByEmail] =
    useState<string | null>(
      initialData.handover?.handoverRecipientsSentByEmail ?? null
    )
  const [handoverRecipientsSentHash, setHandoverRecipientsSentHash] = useState<
    string | null
  >(initialData.handover?.handoverRecipientsSentHash ?? null)
  const [handoverRecipientsSentCount, setHandoverRecipientsSentCount] =
    useState<number | null>(
      initialData.handover?.handoverRecipientsSentCount ?? null
    )

  const [signatures, setSignatures] = useState<ExitChecklistSignatures>({
    employee: initialData.signatures?.employee ?? emptySignature(),
    manager: initialData.signatures?.manager ?? emptySignature(),
    issuer: initialData.signatures?.issuer ?? emptySignature(),
    issuedDate: getDefaultIssuedDate(initialData.signatures?.issuedDate),
  })
  const [handoverManagerSignature, setHandoverManagerSignature] =
    useState<ExitChecklistSignatureValue>(
      initialData.handoverManagerSignature ?? emptySignature()
    )
  const [assetsEditedByHR, setAssetsEditedByHR] = useState(
    initialData.assetsEditedByHR ?? null
  )
  const [handoverEditedByHR, setHandoverEditedByHR] = useState(
    initialData.handoverEditedByHR ?? null
  )

  const [managerName, setManagerName] = useState<string>(
    initialData.managerName ?? ""
  )
  const [managerEmail, setManagerEmail] = useState<string>(
    initialData.managerEmail ?? ""
  )
  const [managerPosition, setManagerPosition] = useState<string>(
    initialData.managerPosition ?? ""
  )
  const [managerDepartment, setManagerDepartment] = useState<string>(
    initialData.managerDepartment ?? ""
  )
  const [sectionBResponsible, setSectionBResponsible] = useState(
    initialData.sectionBResponsible ?? null
  )
  const [kitt6OptionContact, setKitt6OptionContact] = useState(
    initialData.kitt6OptionContact ?? null
  )
  const [managerLoading, setManagerLoading] = useState(false)
  const [managerLoadError, setManagerLoadError] = useState<string | null>(null)

  const [newRecipientName, setNewRecipientName] = useState("")
  const [newRecipientEmail, setNewRecipientEmail] = useState("")
  const [newRecipientPersonalNumber, setNewRecipientPersonalNumber] =
    useState("")
  const [newRecipientDepartment, setNewRecipientDepartment] = useState("")
  const [newRecipientError, setNewRecipientError] = useState<string | null>(
    null
  )

  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [lastSaveTrigger, setLastSaveTrigger] = useState<number | undefined>(
    externalSaveTrigger
  )
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState>({
    open: false,
    type: "success",
    title: "",
    message: "",
  })
  const [sendPdfDialogOpen, setSendPdfDialogOpen] = useState(false)
  const [pendingDirtyAction, setPendingDirtyAction] = useState<
    { type: "generate" } | { type: "send" } | null
  >(null)
  const [pdfRecipientName, setPdfRecipientName] = useState("")
  const [pdfRecipientEmail, setPdfRecipientEmail] = useState("")
  const [pdfMessage, setPdfMessage] = useState("")
  const [sendingPdf, setSendingPdf] = useState(false)
  const [pdfPickerOpen, setPdfPickerOpen] = useState(false)
  const [foreignSignTarget, setForeignSignTarget] = useState<{
    key: ExitChecklistItem["key"]
    behalf: boolean
  } | null>(null)
  const [pendingSaveAction, setPendingSaveAction] = useState<
    (() => void) | null
  >(null)

  function handlePdfPersonSelected(employee: EmployeeItem) {
    setPdfRecipientName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setPdfRecipientEmail(employee.email ?? "")
  }

  const isInternalMode = mode === "internal"
  const isLocked = Boolean(lockedAt)
  const resolvedOffboardingId = offboardingId ?? initialData.offboardingId
  const role = session?.user.role ?? "USER"
  const isAdmin = role === "ADMIN" || role === "HR" || role === "IT"
  const canOverrideOthersSignature = isInternalMode && isAdmin
  const canInvite =
    isInternalMode && isAdmin && Boolean(resolvedOffboardingId) && !isLocked

  const canLock = isInternalMode && isAdmin
  const canUnlock = canLock && isLocked
  const canGeneratePdf = isInternalMode && Boolean(resolvedOffboardingId)
  const canSendPdf = isInternalMode && isAdmin && Boolean(resolvedOffboardingId)
  const signingDisabledKeys = conflictOfInterest ? [] : ["lawInfo"]
  const lawInfoGreyed = !conflictOfInterest

  const header = useMemo(
    () => ({
      employeeName: initialData.employeeName,
      personalNumber: initialData.personalNumber,
      department: initialData.department,
      unitName: initialData.unitName,
      positionNum: initialData.positionNum ?? null,
      positionName: initialData.positionName ?? null,
      employmentEndDate: initialData.employmentEndDate,
      employeeEmail: initialData.employeeEmail ?? null,
    }),
    [initialData]
  )

  const formattedDate = useMemo(
    () =>
      header.employmentEndDate
        ? format(new Date(header.employmentEndDate), "d.M.yyyy")
        : "",
    [header.employmentEndDate]
  )

  const currentUserName = useSignatureName()
  const currentUserEmail = session?.user?.email ?? ""
  const currentUserEmailNormalized = normalizeEmail(currentUserEmail)

  const isEmployeeVisitor =
    !isInternalMode &&
    Boolean(initialData.employeeEmail) &&
    currentUserEmailNormalized === normalizeEmail(initialData.employeeEmail)

  const signatureRecipients = useMemo(
    () => initialData.signatureRecipients ?? [],
    [initialData.signatureRecipients]
  )

  function isVisitorOrSubstituteFor(targetEmail: string | null | undefined) {
    if (!targetEmail) return false
    const targetEmailNormalized = normalizeEmail(targetEmail)
    if (currentUserEmailNormalized === targetEmailNormalized) return true

    const targetKey = recipientIdentityKey({
      email: targetEmailNormalized,
      behalfLabel: undefined,
    })
    return signatureRecipients.some(
      (recipient) =>
        !recipient.revokedAt &&
        recipient.substituteForKey === targetKey &&
        normalizeEmail(recipient.email) === currentUserEmailNormalized
    )
  }

  const isManagerVisitor =
    !isInternalMode && isVisitorOrSubstituteFor(managerEmail)

  const isSectionBResponsibleVisitor =
    !isInternalMode &&
    (isManagerVisitor || isVisitorOrSubstituteFor(sectionBResponsible?.email))

  const assetsSignedByOther =
    Boolean(signatures.issuer.signedAt) &&
    normalizeEmail(signatures.issuer.signedByEmail) !==
      currentUserEmailNormalized
  const assetsFieldsLocked =
    isLocked ||
    isEmployeeVisitor ||
    (assetsSignedByOther && !canOverrideOthersSignature)

  const handoverSignedByOther =
    Boolean(handoverManagerSignature.signedAt) &&
    normalizeEmail(handoverManagerSignature.signedByEmail) !==
      currentUserEmailNormalized
  const handoverFieldsLocked =
    isLocked ||
    isEmployeeVisitor ||
    (handoverSignedByOther && !canOverrideOthersSignature) ||
    (!isInternalMode && !isManagerVisitor)

  function markAssetsHrEdit() {
    if (isInternalMode && isAdmin && assetsSignedByOther) {
      setAssetsEditedByHR({
        name: currentUserName || currentUserEmail,
        email: currentUserEmail,
        role,
        at: new Date().toISOString(),
      })
    }
  }

  function markHandoverHrEdit() {
    if (isInternalMode && isAdmin && handoverSignedByOther) {
      setHandoverEditedByHR({
        name: currentUserName || currentUserEmail,
        email: currentUserEmail,
        role,
        at: new Date().toISOString(),
      })
    }
  }

  function hrEditRoleLabel(marker: { role?: string }) {
    if (marker.role === "ADMIN") return "administrátorem"
    if (marker.role === "IT") return "IT"
    return "Personálním oddělením"
  }

  const isPrivilegedRole = isInternalMode && role !== "USER"
  const isCurrentUserAuthorizedSigner =
    isPrivilegedRole ||
    signatureRecipients.some(
      (recipient) =>
        normalizeEmail(recipient.email) === currentUserEmailNormalized &&
        !recipient.revokedAt
    )

  const validHandoverRecipients = useMemo(
    () =>
      handoverRecipients.filter((recipient) => {
        const email = normalizeEmail(recipient.email)
        return (
          Boolean(recipient.name?.trim()) &&
          Boolean(email) &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        )
      }),
    [handoverRecipients]
  )

  const handoverRecipientsSendKey = useMemo(
    () => buildHandoverRecipientSendKey(validHandoverRecipients),
    [validHandoverRecipients]
  )

  const displayedHandoverSendHistory = useMemo(() => {
    return [...handoverSendHistory].sort((a, b) => {
      const aTime = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0
      const bTime = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0

      return bTime - aTime
    })
  }, [handoverSendHistory])

  const cleanHandoverOption2Target = useMemo(
    () =>
      cleanPositionName(
        handoverOption2Target,
        handoverOption2TargetPositionNum
      ),
    [handoverOption2Target, handoverOption2TargetPositionNum]
  )

  const selectedHandoverOption2PositionLabel = useMemo(
    () =>
      formatHandoverPositionLabel(
        handoverOption2TargetPositionNum,
        handoverOption2Target,
        handoverOption2TargetDepartment,
        handoverOption2TargetUnitName
      ),
    [
      handoverOption2Target,
      handoverOption2TargetPositionNum,
      handoverOption2TargetDepartment,
      handoverOption2TargetUnitName,
    ]
  )

  const initialDataIdentity = useMemo(
    () =>
      [
        initialData.id ?? "new",
        initialData.offboardingId,
        initialData.publicToken ?? "",
      ].join(":"),
    [initialData.id, initialData.offboardingId, initialData.publicToken]
  )

  const setFormDirty = useCallback(
    (nextDirty: boolean) => {
      dirtyRef.current = nextDirty
      setDirty(nextDirty)
      onDirtyChange?.(nextDirty)
    },
    [onDirtyChange]
  )

  function markDirty() {
    setFormDirty(true)
  }

  function markClean() {
    setFormDirty(false)
  }

  useEffect(() => {
    setLockedAt(initialData.lockedAt ?? null)
    setItems(mergeItemsWithConfig(initialData.items ?? []))
    setAssets(initialData.assets ?? [])
    setNoAssets(initialData.noAssets ?? false)
    setConflictOfInterest(initialData.conflictOfInterest ?? null)
    setHandoverOption1(initialData.handover?.option1 ?? false)
    setHandoverOption1Note(initialData.handover?.option1Note ?? "")
    setHandoverOption2(initialData.handover?.option2 ?? false)
    setHandoverOption2Target(
      cleanPositionName(
        initialData.handover?.option2Target,
        initialData.handover?.option2TargetPositionNum
      )
    )
    setHandoverOption2TargetPositionNum(
      initialData.handover?.option2TargetPositionNum ?? ""
    )
    setHandoverOption2TargetDepartment(
      initialData.handover?.option2TargetDepartment ?? ""
    )
    setHandoverOption2TargetUnitName(
      initialData.handover?.option2TargetUnitName ?? ""
    )
    setHandoverOption3(initialData.handover?.option3 ?? false)
    setHandoverOption3Reason(initialData.handover?.option3Reason ?? "")
    setResponsibleParty(initialData.handover?.responsibleParty ?? null)
    setHandoverRecipients(initialData.handover?.handoverRecipients ?? [])
    setHandoverSendHistory(initialData.handover?.handoverSendHistory ?? [])
    setHandoverRecipientsSentAt(
      initialData.handover?.handoverRecipientsSentAt ?? null
    )
    setHandoverRecipientsSentByName(
      initialData.handover?.handoverRecipientsSentByName ?? null
    )
    setHandoverRecipientsSentByEmail(
      initialData.handover?.handoverRecipientsSentByEmail ?? null
    )
    setHandoverRecipientsSentHash(
      initialData.handover?.handoverRecipientsSentHash ?? null
    )
    setHandoverRecipientsSentCount(
      initialData.handover?.handoverRecipientsSentCount ?? null
    )
    setSignatures({
      employee: initialData.signatures?.employee ?? emptySignature(),
      manager: initialData.signatures?.manager ?? emptySignature(),
      issuer: initialData.signatures?.issuer ?? emptySignature(),
      issuedDate: getDefaultIssuedDate(initialData.signatures?.issuedDate),
    })
    setHandoverManagerSignature(
      initialData.handoverManagerSignature ?? emptySignature()
    )
    setAssetsEditedByHR(initialData.assetsEditedByHR ?? null)
    setHandoverEditedByHR(initialData.handoverEditedByHR ?? null)
    setManagerName(initialData.managerName ?? "")
    setManagerEmail(initialData.managerEmail ?? "")
    setManagerPosition(initialData.managerPosition ?? "")
    setManagerDepartment(initialData.managerDepartment ?? "")
    setSectionBResponsible(initialData.sectionBResponsible ?? null)
    setKitt6OptionContact(initialData.kitt6OptionContact ?? null)
    markClean()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDataIdentity])

  useEffect(() => {
    if (externalSaveTrigger === undefined) return
    if (externalSaveTrigger === lastSaveTrigger) return
    setLastSaveTrigger(externalSaveTrigger)
    if (!dirtyRef.current) return
    requestSave(() => void handleSave(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSaveTrigger])

  function showFeedback(
    type: FeedbackDialogState["type"],
    title: string,
    message: string
  ) {
    setFeedbackDialog({
      open: true,
      type,
      title,
      message,
    })
  }

  async function reloadManagerFromPosition() {
    const positionNum = initialData.positionNum

    if (!positionNum) return

    setManagerLoading(true)
    setManagerLoadError(null)

    try {
      const res = await fetch(
        `/api/systemizace/superior?positionNum=${encodeURIComponent(positionNum)}`,
        { cache: "no-store" }
      )

      if (!res.ok) {
        setManagerLoadError("Vedoucí nebyl nalezen.")
        return
      }

      const json = await res.json().catch(() => null)
      const sup = json?.supervisor

      if (!sup) {
        setManagerLoadError("Vedoucí nebyl nalezen.")
        return
      }

      const fullName = [sup.titleBefore, sup.name, sup.surname, sup.titleAfter]
        .filter(Boolean)
        .join(" ")
        .trim()

      if (!fullName) {
        setManagerLoadError("Vedoucí nebyl nalezen.")
        return
      }

      setManagerName(fullName)
      setManagerEmail(sup.email ?? "")
      setManagerPosition(sup.position ?? "")
      setManagerDepartment(sup.department ?? "")
      setManagerLoadError(null)
      markDirty()
    } catch {
      setManagerLoadError("Nepodařilo se načíst vedoucího.")
    } finally {
      setManagerLoading(false)
    }
  }

  function signHeaderSignature(key: HeaderSignatureKey) {
    if (isLocked || (!currentUserName && !currentUserEmail)) return

    if (
      key === "employee" &&
      !isInternalMode &&
      normalizeEmail(initialData.employeeEmail) &&
      currentUserEmailNormalized !== normalizeEmail(initialData.employeeEmail)
    ) {
      showFeedback(
        "error",
        "Nesouhlasí e-mail",
        "Podpis zaměstnance může provést jen odcházející zaměstnanec, přihlášený přes Google se svým vlastním e-mailem."
      )
      return
    }

    if (!isCurrentUserAuthorizedSigner) {
      showFeedback(
        "error",
        "Nejste v seznamu příjemců",
        "Byli jste odebráni ze seznamu příjemců k podpisu tohoto výstupního listu. Požádejte Personální oddělení o opětovné přidání do seznamu."
      )
      return
    }

    if (key === "issuer" && !assetsComplete) {
      showFeedback(
        "error",
        "Nelze podepsat",
        "Nejdřív v sekci B vyplňte zapůjčený majetek, nebo zaškrtněte, že zaměstnanec žádný nemá."
      )
      return
    }

    const now = new Date().toISOString()

    setSignatures((prev) => {
      if (prev[key]?.signedAt) return prev

      return {
        ...prev,
        [key]: {
          signedByName: currentUserName || currentUserEmail,
          signedByEmail: currentUserEmail || null,
          signedAt: now,
        },
      }
    })

    if (key === "manager") {
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== "handoverProtocol" || item.signedAt) return item

          return {
            ...item,
            resolved: "YES",
            signedByName: currentUserName || currentUserEmail,
            signedByEmail: currentUserEmail || null,
            signedAt: now,
          }
        })
      )
    }

    markDirty()
  }

  function signHeaderSignatureBehalf(key: HeaderSignatureKey) {
    if (isLocked || (!currentUserName && !currentUserEmail)) return

    if (!isCurrentUserAuthorizedSigner) {
      showFeedback(
        "error",
        "Nejste v seznamu příjemců",
        "Byli jste odebráni ze seznamu příjemců k podpisu tohoto výstupního listu. Požádejte Personální oddělení o opětovné přidání do seznamu."
      )
      return
    }

    if (key === "issuer" && !assetsComplete) {
      showFeedback(
        "error",
        "Nelze podepsat",
        "Nejdřív v sekci B vyplňte zapůjčený majetek, nebo zaškrtněte, že zaměstnanec žádný nemá."
      )
      return
    }

    const now = new Date().toISOString()

    setSignatures((prev) => {
      if (prev[key]?.signedAt) return prev

      return {
        ...prev,
        [key]: {
          signedByName: `${currentUserName || currentUserEmail} — v zastoupení`,
          signedByEmail: currentUserEmail || null,
          signedAt: now,
        },
      }
    })

    if (key === "manager") {
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== "handoverProtocol" || item.signedAt) return item

          return {
            ...item,
            resolved: "YES",
            signedByName: `${currentUserName || currentUserEmail} — v zastoupení`,
            signedByEmail: currentUserEmail || null,
            signedAt: now,
          }
        })
      )
    }

    markDirty()
  }

  function revokeHeaderSignature(key: HeaderSignatureKey) {
    if (isLocked) return

    setSignatures((prev) => {
      const current = prev[key]

      if (!current?.signedAt) return prev

      const signerEmail = normalizeEmail(current.signedByEmail)

      if (
        !canOverrideOthersSignature &&
        signerEmail !== currentUserEmailNormalized
      )
        return prev

      return {
        ...prev,
        [key]: emptySignature(),
      }
    })

    if (key === "issuer") {
      setAssetsEditedByHR(null)
    }

    if (key === "manager") {
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== "handoverProtocol" || !item.signedAt) return item

          const signerEmail = normalizeEmail(item.signedByEmail)

          if (
            !canOverrideOthersSignature &&
            signerEmail !== currentUserEmailNormalized
          ) {
            return item
          }

          return {
            ...item,
            resolved: null,
            signedByName: null,
            signedByEmail: null,
            signedAt: null,
          }
        })
      )
    }

    markDirty()
  }

  function updateResolved(
    key: ExitChecklistItem["key"],
    value: ExitResolvedValue
  ) {
    if (isLocked || signingDisabledKeys.includes(key)) return

    let changed = false

    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (item.signedAt) return item
        if (item.resolved === value) return item

        changed = true

        return {
          ...item,
          resolved: value,
        }
      })
    )

    if (changed) markDirty()
  }

  function updateItemNote(key: ExitChecklistItem["key"], value: string) {
    if (isLocked || signingDisabledKeys.includes(key)) return

    setItems((prev) =>
      prev.map((item) =>
        item.key === key && !item.signedAt ? { ...item, note: value } : item
      )
    )
    markDirty()
  }

  function signRow(key: ExitChecklistItem["key"]) {
    if (isLocked || !currentUserEmail || signingDisabledKeys.includes(key)) {
      return
    }

    if (!isCurrentUserAuthorizedSigner) {
      showFeedback(
        "error",
        "Nejste v seznamu příjemců",
        "Byli jste odebráni ze seznamu příjemců k podpisu tohoto výstupního listu. Požádejte Personální oddělení o opětovné přidání do seznamu."
      )
      return
    }

    const target = items.find((item) => item.key === key)
    if (!target || target.signedAt) return

    const now = new Date().toISOString()

    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: "YES",
              signedByName: currentUserName || currentUserEmail,
              signedByEmail: currentUserEmail,
              signedAt: now,
            }
          : item
      )
    )

    if (key === "handoverProtocol") {
      setSignatures((prev) => {
        if (prev.manager?.signedAt) return prev

        return {
          ...prev,
          manager: {
            signedByName: currentUserName || currentUserEmail,
            signedByEmail: currentUserEmail || null,
            signedAt: now,
          },
        }
      })
    }

    markDirty()
  }

  function signRowOnBehalf(key: ExitChecklistItem["key"]) {
    if (isLocked || !currentUserEmail || signingDisabledKeys.includes(key)) {
      return
    }

    if (!isCurrentUserAuthorizedSigner) {
      showFeedback(
        "error",
        "Nejste v seznamu příjemců",
        "Byli jste odebráni ze seznamu příjemců k podpisu tohoto výstupního listu. Požádejte Personální oddělení o opětovné přidání do seznamu."
      )
      return
    }

    const behalfTarget = items.find((item) => item.key === key)
    if (!behalfTarget || behalfTarget.signedAt) return

    const now = new Date().toISOString()

    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: "YES",
              signedByName: `${currentUserName || currentUserEmail} — v zastoupení`,
              signedByEmail: currentUserEmail,
              signedAt: now,
            }
          : item
      )
    )

    if (key === "handoverProtocol") {
      setSignatures((prev) => {
        if (prev.manager?.signedAt) return prev

        return {
          ...prev,
          manager: {
            signedByName: `${currentUserName || currentUserEmail} — v zastoupení`,
            signedByEmail: currentUserEmail || null,
            signedAt: now,
          },
        }
      })
    }

    markDirty()
  }

  function revokeSignature(key: ExitChecklistItem["key"]) {
    if (isLocked) return

    const target = items.find((item) => item.key === key)
    if (!target?.signedAt) return

    const signerEmail = normalizeEmail(target.signedByEmail)
    if (
      !canOverrideOthersSignature &&
      signerEmail !== currentUserEmailNormalized
    )
      return

    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: null,
              signedByName: null,
              signedByEmail: null,
              signedAt: null,
            }
          : item
      )
    )

    if (key === "handoverProtocol") {
      setSignatures((prev) => {
        const current = prev.manager

        if (!current?.signedAt) return prev

        const managerSignerEmail = normalizeEmail(current.signedByEmail)

        if (
          !canOverrideOthersSignature &&
          managerSignerEmail !== currentUserEmailNormalized
        ) {
          return prev
        }

        return {
          ...prev,
          manager: emptySignature(),
        }
      })
    }

    markDirty()
  }

  function signHandoverManagerSignature(behalf = false) {
    if (isLocked || (!currentUserName && !currentUserEmail)) return
    if (!isInternalMode && !isManagerVisitor) return

    if (!isCurrentUserAuthorizedSigner) {
      showFeedback(
        "error",
        "Nejste v seznamu příjemců",
        "Byli jste odebráni ze seznamu příjemců k podpisu tohoto výstupního listu. Požádejte Personální oddělení o opětovné přidání do seznamu."
      )
      return
    }

    if (!handoverSignReady) {
      showFeedback("error", "Nelze podepsat", handoverSignBlockedReason ?? "")
      return
    }

    const now = new Date().toISOString()

    setHandoverManagerSignature((prev) => {
      if (prev.signedAt) return prev

      return {
        signedByName: behalf
          ? `${currentUserName || currentUserEmail} — v zastoupení`
          : currentUserName || currentUserEmail,
        signedByEmail: currentUserEmail || null,
        signedAt: now,
      }
    })

    markDirty()
  }

  function revokeHandoverManagerSignature() {
    if (isLocked) return
    if (!isInternalMode && !isManagerVisitor) return

    setHandoverManagerSignature((prev) => {
      if (!prev.signedAt) return prev

      const signerEmail = normalizeEmail(prev.signedByEmail)

      if (
        !canOverrideOthersSignature &&
        signerEmail !== currentUserEmailNormalized
      )
        return prev

      return emptySignature()
    })

    setHandoverEditedByHR(null)
    markDirty()
  }

  function addAssetRow() {
    if (assetsFieldsLocked) return

    setAssets((prev) => [
      ...prev,
      {
        id: createTempId(),
        subject: "",
        inventoryNumber: "",
      },
    ])

    markAssetsHrEdit()
    markDirty()
  }

  function updateAsset(
    id: string,
    field: "subject" | "inventoryNumber",
    value: string
  ) {
    if (assetsFieldsLocked) return

    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    )

    markAssetsHrEdit()
    markDirty()
  }

  function removeAsset(id: string) {
    if (assetsFieldsLocked) return

    setAssets((prev) => prev.filter((a) => a.id !== id))
    markAssetsHrEdit()
    markDirty()
  }

  function addRecipientManually() {
    if (handoverFieldsLocked) return
    setNewRecipientError(null)

    const name = newRecipientName.trim()
    const email = newRecipientEmail.trim().toLowerCase()
    const personalNumber = newRecipientPersonalNumber.trim()
    const department = newRecipientDepartment.trim()

    if (!name) {
      setNewRecipientError("Jméno je povinné.")
      return
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNewRecipientError("Zadejte platný e-mail.")
      return
    }

    if (
      handoverRecipients.some(
        (recipient) => normalizeEmail(recipient.email) === email
      )
    ) {
      setNewRecipientError("Tento příjemce je již v seznamu.")
      return
    }

    setHandoverRecipients((prev) => [
      ...prev,
      {
        id: createTempId(),
        name,
        email,
        personalNumber: personalNumber || null,
        department: department || null,
      },
    ])

    setNewRecipientName("")
    setNewRecipientEmail("")
    setNewRecipientPersonalNumber("")
    setNewRecipientDepartment("")
    markHandoverHrEdit()
    markDirty()
  }

  async function handleSendHandoverRecipientInfo(force = false) {
    if (!resolvedOffboardingId || !currentUserEmail) {
      showFeedback(
        "error",
        "Odeslání není dostupné",
        "Informace může odeslat pouze přihlášený uživatel s oprávněním k výstupnímu listu."
      )
      return
    }

    try {
      const res = await fetch(
        `/api/odchody/${resolvedOffboardingId}/exit-checklist/handover-recipients/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            force,
            handover: {
              includeHandoverAgenda,
              option1: handoverOption1,
              option2: handoverOption2,
              option2Target: cleanHandoverOption2Target,
              option2TargetPositionNum: handoverOption2TargetPositionNum,
              option2TargetDepartment: handoverOption2TargetDepartment,
              option2TargetUnitName: handoverOption2TargetUnitName,
              option3: handoverOption3,
              option3Reason: handoverOption3Reason,
              responsibleParty: null,
            },
            recipients: validHandoverRecipients.map((recipient) => ({
              id: recipient.id,
              name: recipient.name,
              email: recipient.email,
              personalNumber: recipient.personalNumber ?? null,
              department: recipient.department ?? null,
            })),
          }),
        }
      )

      const json = await res.json().catch(() => null)

      if (res.status === 409 && json?.code === "ALREADY_SENT" && !force) {
        return
      }

      if (!res.ok) {
        throw new Error(
          json?.message ??
            json?.error ??
            "Nepodařilo se odeslat informace příjemcům."
        )
      }

      const sentAt =
        json?.sentAt ?? json?.data?.sentAt ?? new Date().toISOString()
      const sentByName =
        json?.sentByName ??
        json?.data?.sentByName ??
        currentUserName ??
        currentUserEmail
      const sentByEmail =
        json?.sentByEmail ?? json?.data?.sentByEmail ?? currentUserEmail
      const sentHash =
        json?.sentHash ?? json?.data?.sentHash ?? handoverRecipientsSendKey
      const sentCount =
        typeof json?.sentCount === "number"
          ? json.sentCount
          : typeof json?.data?.sentCount === "number"
            ? json.data.sentCount
            : (handoverRecipientsSentCount ?? 0) + 1

      const updatedRecipientsFromApi =
        json?.recipients ?? json?.data?.recipients ?? null

      const updatedHistoryFromApi =
        json?.handoverSendHistory ??
        json?.data?.handoverSendHistory ??
        json?.history ??
        json?.data?.history ??
        null

      if (Array.isArray(updatedRecipientsFromApi)) {
        setHandoverRecipients(updatedRecipientsFromApi)
      } else {
        const sentEmails = new Set(
          validHandoverRecipients.map((recipient) =>
            normalizeEmail(recipient.email)
          )
        )

        setHandoverRecipients((prev) =>
          prev.map((recipient) => {
            if (!sentEmails.has(normalizeEmail(recipient.email))) {
              return recipient
            }

            return {
              ...recipient,
              handoverInfoLastSentAt: sentAt,
              handoverInfoLastSentByName: sentByName,
              handoverInfoLastSentByEmail: sentByEmail,
              handoverInfoSentCount: (recipient.handoverInfoSentCount ?? 0) + 1,
            }
          })
        )
      }

      if (Array.isArray(updatedHistoryFromApi)) {
        setHandoverSendHistory(updatedHistoryFromApi)
      } else {
        setHandoverSendHistory((prev) =>
          mergeHandoverSendHistory(
            prev,
            validHandoverRecipients,
            sentAt,
            sentByName,
            sentByEmail
          )
        )
      }

      setHandoverRecipientsSentAt(sentAt)
      setHandoverRecipientsSentByName(sentByName)
      setHandoverRecipientsSentByEmail(sentByEmail)
      setHandoverRecipientsSentHash(sentHash)
      setHandoverRecipientsSentCount(sentCount)

      showFeedback(
        "success",
        force ? "Informace byly odeslány znovu" : "Informace byly odeslány",
        `Informace o předávané agendě byly odeslány pro ${validHandoverRecipients.length} osobu/osob.`
      )
    } catch (err) {
      console.warn(
        "[EXIT-CHECKLIST] Informace o předávané agendě se nepodařilo odeslat:",
        err
      )
    }
  }

  async function handleSendHandoverKitt6Info(force = false) {
    if (!resolvedOffboardingId) return

    try {
      const res = await fetch(
        `/api/odchody/${resolvedOffboardingId}/exit-checklist/handover-kitt6-notify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ force }),
        }
      )

      const json = await res.json().catch(() => null)

      if (res.status === 409 && json?.code === "ALREADY_SENT" && !force) {
        return
      }

      if (!res.ok) {
        throw new Error(
          json?.message ?? json?.error ?? "Nepodařilo se odeslat informaci."
        )
      }

      showFeedback(
        "success",
        "Informace byla odeslána",
        `Informace o předání agendy byla odeslána na ${json?.sentTo ?? "KITT6"}.`
      )
    } catch (err) {
      console.warn(
        "[EXIT-CHECKLIST] Informace pro KITT6 se nepodařilo odeslat:",
        err
      )
    }
  }

  async function handleSave(
    lockAfterSave: boolean,
    options?: { requestClose?: boolean }
  ): Promise<boolean> {
    try {
      setSaving(true)

      const saveUrl = isInternalMode
        ? `/api/odchody/${resolvedOffboardingId}/exit-checklist`
        : `/api/odchody/public/${publicToken}`

      const res = await fetch(saveUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lock: isInternalMode ? lockAfterSave : false,
          conflictOfInterest,
          managerEmail: managerEmail || null,
          managerName: managerName || null,
          managerPosition: managerPosition || null,
          managerDepartment: managerDepartment || null,
          handoverManagerSignature,
          assetsEditedByHR,
          handoverEditedByHR,
          items: items.map((i) => ({
            key: i.key,
            resolved: i.resolved,
            note: i.note,
            signedByName: i.signedByName,
            signedByEmail: i.signedByEmail,
            signedAt: i.signedAt,
          })),
          assets: assets.map((a) => ({
            id: a.id,
            subject: a.subject,
            inventoryNumber: a.inventoryNumber,
          })),
          noAssets,
          handover: {
            includeHandoverAgenda,
            option1: handoverOption1,
            option1Note: handoverOption1Note,
            option2: handoverOption2,
            option2Target: cleanHandoverOption2Target,
            option2TargetPositionNum: handoverOption2TargetPositionNum,
            option2TargetDepartment: handoverOption2TargetDepartment,
            option2TargetUnitName: handoverOption2TargetUnitName,
            option3: handoverOption3,
            option3Reason: handoverOption3Reason,
            responsibleParty: null,
            handoverRecipients,
            handoverSendHistory,
            handoverRecipientsSentAt,
            handoverRecipientsSentByName,
            handoverRecipientsSentByEmail,
            handoverRecipientsSentHash,
            handoverRecipientsSentCount,
          },
          signatures,
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        showFeedback(
          "error",
          "Nepodařilo se uložit výstupní list",
          json?.message ?? json?.error ?? "Zkuste akci zopakovat."
        )
        return false
      }

      const payload = json as {
        status?: string
        data?: ExitChecklistData
      }

      if (payload.data) {
        setItems(mergeItemsWithConfig(payload.data.items ?? []))
        setAssets(payload.data.assets ?? [])
        setNoAssets(payload.data.noAssets ?? false)
        setLockedAt(payload.data.lockedAt ?? null)
        setConflictOfInterest(payload.data.conflictOfInterest ?? null)
        setSignatures({
          employee: payload.data.signatures?.employee ?? emptySignature(),
          manager: payload.data.signatures?.manager ?? emptySignature(),
          issuer: payload.data.signatures?.issuer ?? emptySignature(),
          issuedDate: getDefaultIssuedDate(payload.data.signatures?.issuedDate),
        })
        setHandoverManagerSignature(
          payload.data.handoverManagerSignature ?? emptySignature()
        )
        setAssetsEditedByHR(payload.data.assetsEditedByHR ?? null)
        setHandoverEditedByHR(payload.data.handoverEditedByHR ?? null)
        setHandoverOption1(payload.data.handover?.option1 ?? false)
        setHandoverOption1Note(payload.data.handover?.option1Note ?? "")
        setHandoverOption2(payload.data.handover?.option2 ?? false)
        setHandoverOption2Target(
          cleanPositionName(
            payload.data.handover?.option2Target,
            payload.data.handover?.option2TargetPositionNum
          )
        )
        setHandoverOption2TargetPositionNum(
          payload.data.handover?.option2TargetPositionNum ?? ""
        )
        setHandoverOption2TargetDepartment(
          payload.data.handover?.option2TargetDepartment ?? ""
        )
        setHandoverOption2TargetUnitName(
          payload.data.handover?.option2TargetUnitName ?? ""
        )
        setHandoverOption3(payload.data.handover?.option3 ?? false)
        setHandoverOption3Reason(payload.data.handover?.option3Reason ?? "")
        setResponsibleParty(payload.data.handover?.responsibleParty ?? null)
        setHandoverRecipients(payload.data.handover?.handoverRecipients ?? [])
        setHandoverSendHistory(
          payload.data.handover?.handoverSendHistory ?? handoverSendHistory
        )
        setHandoverRecipientsSentAt(
          payload.data.handover?.handoverRecipientsSentAt ??
            handoverRecipientsSentAt
        )
        setHandoverRecipientsSentByName(
          payload.data.handover?.handoverRecipientsSentByName ??
            handoverRecipientsSentByName
        )
        setHandoverRecipientsSentByEmail(
          payload.data.handover?.handoverRecipientsSentByEmail ??
            handoverRecipientsSentByEmail
        )
        setHandoverRecipientsSentHash(
          payload.data.handover?.handoverRecipientsSentHash ??
            handoverRecipientsSentHash
        )
        setHandoverRecipientsSentCount(
          payload.data.handover?.handoverRecipientsSentCount ??
            handoverRecipientsSentCount
        )
        setManagerName(payload.data.managerName ?? "")
        setManagerEmail(payload.data.managerEmail ?? "")
        setManagerPosition(payload.data.managerPosition ?? "")
        setManagerDepartment(payload.data.managerDepartment ?? "")
        markClean()

        showFeedback(
          "success",
          lockAfterSave
            ? "Výstupní list byl uzamčen"
            : "Výstupní list byl uložen",
          lockAfterSave
            ? "Formulář je uložený a uzamčený k dalším úpravám."
            : "Všechny změny a podpisy byly úspěšně zaznamenány."
        )

        if (Boolean(payload.data.handoverManagerSignature?.signedAt)) {
          if (
            payload.data.handover?.option3 &&
            (payload.data.handover?.handoverRecipients?.length ?? 0) > 0
          ) {
            void handleSendHandoverRecipientInfo()
          } else if (
            payload.data.handover?.option2 &&
            Boolean(
              payload.data.handover?.option2Target ||
                payload.data.handover?.option2TargetPositionNum
            ) &&
            !payload.data.handover?.handoverNotifiedAt
          ) {
            void handleSendHandoverKitt6Info()
          }
        }

        onSaved?.(payload.data, options?.requestClose)
        return true
      }

      return false
    } catch (err) {
      console.error("Chyba při ukládání:", err)

      showFeedback(
        "error",
        "Chyba při ukládání",
        err instanceof Error
          ? err.message
          : "Došlo k neočekávané chybě při ukládání."
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  function openPdf() {
    if (!resolvedOffboardingId) return

    window.open(
      `/api/odchody/${resolvedOffboardingId}/vystupni-list`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  function requestGeneratePdf() {
    if (dirtyRef.current && !isLocked) {
      setPendingDirtyAction({ type: "generate" })
      return
    }

    openPdf()
  }

  async function confirmDirtySaveAndProceed() {
    const action = pendingDirtyAction
    setPendingDirtyAction(null)
    if (!action) return

    const saved = await handleSave(false)
    if (!saved) return

    if (action.type === "generate") {
      openPdf()
    } else if (action.type === "send") {
      await sendPdfNow()
    }
  }

  async function handleUnlock() {
    if (!resolvedOffboardingId || !canUnlock) return

    try {
      setSaving(true)

      const res = await fetch(
        `/api/odchody/${resolvedOffboardingId}/exit-checklist`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ unlock: true }),
        }
      )

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(
          json?.message ??
            json?.error ??
            "Výstupní list se nepodařilo odemknout."
        )
      }

      const payload = json as {
        status?: string
        data?: ExitChecklistData
      }

      if (payload.data) {
        setLockedAt(payload.data.lockedAt ?? null)
        onSaved?.(payload.data)
      } else {
        setLockedAt(null)
      }

      markClean()

      showFeedback(
        "success",
        "Výstupní list byl odemknut",
        "Formulář je znovu dostupný pro úpravy."
      )
    } catch (err) {
      showFeedback(
        "error",
        "Nepodařilo se odemknout výstupní list",
        err instanceof Error ? err.message : "Zkuste akci zopakovat."
      )
    } finally {
      setSaving(false)
    }
  }

  function handleSendPdf() {
    if (!resolvedOffboardingId || !canSendPdf) return

    const email = pdfRecipientEmail.trim().toLowerCase()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFeedback("error", "Chybí e-mail", "Zadejte platný e-mail příjemce.")
      return
    }

    if (dirtyRef.current && !isLocked) {
      setPendingDirtyAction({ type: "send" })
      return
    }

    void sendPdfNow()
  }

  async function sendPdfNow() {
    if (!resolvedOffboardingId || !canSendPdf) return

    const email = pdfRecipientEmail.trim().toLowerCase()

    try {
      setSendingPdf(true)

      const res = await fetch(
        `/api/odchody/${resolvedOffboardingId}/exit-checklist/send-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            to: email,
            recipientName: pdfRecipientName.trim() || null,
            message: pdfMessage.trim() || null,
          }),
        }
      )

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(
          json?.message ?? json?.error ?? "PDF se nepodařilo odeslat."
        )
      }

      setSendPdfDialogOpen(false)
      setPdfRecipientName("")
      setPdfRecipientEmail("")
      setPdfMessage("")

      showFeedback(
        "success",
        "PDF bylo odesláno",
        `Výstupní list byl odeslán jako příloha na adresu ${email}.`
      )
    } catch (err) {
      showFeedback(
        "error",
        "PDF se nepodařilo odeslat",
        err instanceof Error ? err.message : "Zkuste akci zopakovat."
      )
    } finally {
      setSendingPdf(false)
    }
  }

  const pdfButtonLabel =
    dirty && !isLocked ? "Uložit a vygenerovat PDF" : "Vygenerovat PDF"

  const ownRowKeys = useMemo(() => {
    const keys = new Set<string>()
    if (isInternalMode || !currentUserEmailNormalized) return keys

    EXIT_CHECKLIST_SIGNATORIES.forEach((signatory) => {
      if (
        signatory.emails.some(
          (email) => normalizeEmail(email) === currentUserEmailNormalized
        )
      ) {
        signatory.rowKeys.forEach((key) => keys.add(key))
      }
    })

    if (
      LAW_SIGNATORY.emails.some(
        (email) => normalizeEmail(email) === currentUserEmailNormalized
      )
    ) {
      LAW_SIGNATORY.rowKeys.forEach((key) => keys.add(key))
    }

    signatureRecipients.forEach((recipient) => {
      if (
        !recipient.revokedAt &&
        normalizeEmail(recipient.email) === currentUserEmailNormalized
      ) {
        ;(recipient.rowKeys ?? []).forEach((key) => keys.add(key))
      }
    })

    return keys
  }, [isInternalMode, currentUserEmailNormalized, signatureRecipients])

  const remainingOwnRowsCount = items.filter(
    (item) =>
      ownRowKeys.has(item.key) &&
      !item.signedAt &&
      !signingDisabledKeys.includes(item.key)
  ).length

  function buildSaveSummary(): { sendLines: string[]; missingLines: string[] } {
    const sendLines: string[] = []

    if (Boolean(handoverManagerSignature.signedAt)) {
      const nextOption2Target = handoverOption2
        ? cleanHandoverOption2Target || handoverOption2TargetPositionNum
        : ""
      const previousNotifiedTo = initialData.handover?.handoverNotifiedTo
      const previousNotifiedTarget =
        initialData.handover?.handoverNotifiedTarget ?? null

      if (
        previousNotifiedTo &&
        (!handoverOption2 || nextOption2Target !== previousNotifiedTarget)
      ) {
        sendLines.push(
          `Kontaktu KITT6 (${previousNotifiedTo}) bude oznámeno, že dříve zvolené předání agendy je zrušené.`
        )
      }

      if (
        handoverOption2 &&
        Boolean(nextOption2Target) &&
        (!previousNotifiedTo || nextOption2Target !== previousNotifiedTarget)
      ) {
        sendLines.push(
          `Informace o předání agendy na jiné funkční místo bude odeslána na kontakt KITT6.`
        )
      }

      const previousSentEmails = (
        initialData.handover?.handoverSendHistory ?? []
      ).filter((entry) => (entry.sentCount ?? 0) > 0 && !entry.cancelledAt)
      const nextRecipientEmails = new Set(
        handoverOption3
          ? validHandoverRecipients.map((r) => normalizeEmail(r.email))
          : []
      )
      const droppedRecipients = previousSentEmails.filter(
        (entry) => !nextRecipientEmails.has(normalizeEmail(entry.email))
      )

      if (droppedRecipients.length > 0) {
        sendLines.push(
          `Osobám, které už dříve dostaly informaci o odpovědnosti za dokumenty, ale v nové volbě už nejsou (${droppedRecipients.map((r) => r.name || r.email).join(", ")}), bude oznámeno zrušení.`
        )
      }

      if (handoverOption3 && validHandoverRecipients.length > 0) {
        const previousSentEmailSet = new Set(
          previousSentEmails.map((entry) => normalizeEmail(entry.email))
        )
        const newlyAdded = validHandoverRecipients.filter(
          (r) => !previousSentEmailSet.has(normalizeEmail(r.email))
        )

        if (newlyAdded.length > 0) {
          sendLines.push(
            `Informace o odpovědnosti za dokumenty bude odeslána: ${newlyAdded.map((r) => r.name || r.email).join(", ")}.`
          )
        }
      }
    }

    const missingLines: string[] = []

    if (!isInternalMode && remainingOwnRowsCount > 0) {
      missingLines.push(
        `Ještě máte ${remainingOwnRowsCount} ${remainingOwnRowsCount === 1 ? "nepodepsanou položku" : "nepodepsané položky"} ve výstupním listu – dokud je nepodepíšete, budou vám dál chodit automatické připomínky.`
      )
    }

    return { sendLines, missingLines }
  }

  function requestSave(action: () => void) {
    setPendingSaveAction(() => action)
  }

  function requestSignRow(key: ExitChecklistItem["key"], behalf: boolean) {
    if (!isInternalMode && ownRowKeys.size > 0 && !ownRowKeys.has(key)) {
      setForeignSignTarget({ key, behalf })
      return
    }
    if (behalf) signRowOnBehalf(key)
    else signRow(key)
  }

  function confirmForeignSign() {
    if (!foreignSignTarget) return
    const { key, behalf } = foreignSignTarget
    setForeignSignTarget(null)
    if (behalf) signRowOnBehalf(key)
    else signRow(key)
  }

  const completion = getExitChecklistCompletionState({
    ...initialData,
    items,
    assets,
    noAssets,
    conflictOfInterest,
    handover: {
      ...initialData.handover,
      includeHandoverAgenda,
      option1: handoverOption1,
      option2: handoverOption2,
      option2Target: cleanHandoverOption2Target,
      option2TargetPositionNum: handoverOption2TargetPositionNum,
      option2TargetDepartment: handoverOption2TargetDepartment,
      option2TargetUnitName: handoverOption2TargetUnitName,
      option3: handoverOption3,
      option3Reason: handoverOption3Reason,
    },
    handoverManagerSignature,
    signatures,
  })

  const signedEmails = useMemo(() => {
    const emails = new Set<string>()
    items.forEach((item) => {
      if (item.signedByEmail) emails.add(normalizeEmail(item.signedByEmail))
    })
    ;[signatures.employee, signatures.manager, signatures.issuer].forEach(
      (value) => {
        if (value.signedByEmail) emails.add(normalizeEmail(value.signedByEmail))
      }
    )
    if (handoverManagerSignature.signedByEmail) {
      emails.add(normalizeEmail(handoverManagerSignature.signedByEmail))
    }
    return Array.from(emails)
  }, [items, signatures, handoverManagerSignature])

  const isLockedBadge = isLocked ? (
    <Badge
      variant="outline"
      className="flex items-center gap-1 border-emerald-200 bg-emerald-50 text-emerald-800"
    >
      <Lock className="size-3" /> Uzamčeno k úpravám
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className={
        isInternalMode
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800"
      }
    >
      {isInternalMode ? "Rozpracováno" : "Podpisový režim"}
    </Badge>
  )

  return (
    <div className="space-y-6">
      <Dialog
        open={feedbackDialog.open}
        onOpenChange={(open) =>
          setFeedbackDialog((prev) => ({
            ...prev,
            open,
          }))
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
              {feedbackDialog.type === "success" ? (
                <CheckCircle className="size-7 text-green-600" />
              ) : (
                <XCircle className="size-7 text-red-600" />
              )}
            </div>
            <DialogTitle className="text-center">
              {feedbackDialog.title}
            </DialogTitle>
            <DialogDescription className="text-center">
              {feedbackDialog.message}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              onClick={() =>
                setFeedbackDialog((prev) => ({
                  ...prev,
                  open: false,
                }))
              }
            >
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isInternalMode && (
        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="border-b bg-background p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                Správa výstupního listu
              </h3>

              {isLockedBadge}

              <Badge
                variant="outline"
                className={
                  completion.percent === 100
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }
              >
                {completion.percent} % dokončeno
              </Badge>

              <Badge
                variant="outline"
                className={
                  conflictOfInterest === true
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : conflictOfInterest === false
                      ? "text-muted-foreground"
                      : "border-red-200 bg-red-50 text-red-700"
                }
              >
                {conflictOfInterest === true
                  ? "Střet zájmů: Ano – Právní odbor podepisuje"
                  : conflictOfInterest === false
                    ? "Střet zájmů: Ne"
                    : "Střet zájmů: nerozhodnuto"}
              </Badge>

              <Badge
                variant="outline"
                className={
                  initialData.signatureRecipientsSentAt
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }
              >
                {initialData.signatureRecipientsSentAt
                  ? "Odesláno k podpisu"
                  : "Čeká na odeslání k podpisu"}
              </Badge>

              {!isInternalMode && ownRowKeys.size > 0 && (
                <Badge
                  variant="outline"
                  className={
                    remainingOwnRowsCount === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }
                >
                  {remainingOwnRowsCount === 0
                    ? "0 – vše podepsáno"
                    : `Zbývá ${remainingOwnRowsCount} ${
                        remainingOwnRowsCount === 1 ? "řádek" : "řádků"
                      } k podpisu`}
                </Badge>
              )}
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              Odeslání k podpisu, přehled osob k podpisu, PDF a historie.
            </p>
          </div>

          <div className="space-y-4 p-5">
            {canInvite && !initialData.signatureRecipientsSentAt && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Seznam osob k podpisu ještě nebyl potvrzen a odeslán. Otevřete
                  „Seznam a správa osob k podpisu“ níže a odešlete pozvánky
                  vybraným osobám.
                </span>
              </div>
            )}

            {completion.missingSections.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Nedokončeno: {completion.missingSections.join(", ")}.
                </span>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {isLocked
                ? "Výstupní list je uzamčený. Lze vygenerovat PDF, odeslat PDF nebo jej odemknout pro úpravy."
                : isInternalMode
                  ? "Po uzamčení formuláře již nepůjde běžným uživatelům měnit."
                  : "Výstupní list můžete doplnit, podepsat a uložit pod svým přihlášeným účtem."}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {canInvite && resolvedOffboardingId && (
                <SignatureRecipientsDialog
                  offboardingId={resolvedOffboardingId}
                  employeeName={header.employeeName ?? ""}
                  employeeEmail={header.employeeEmail ?? null}
                  publicToken={initialData.publicToken ?? null}
                  conflictOfInterest={conflictOfInterest}
                  managerEmail={managerEmail || null}
                  managerName={managerName || null}
                  managerPosition={managerPosition || null}
                  managerDepartment={managerDepartment || null}
                  signedEmails={signedEmails}
                  isLocked={isLocked}
                  sectionBResponsible={sectionBResponsible}
                  kitt6OptionContact={kitt6OptionContact}
                  onManagerChange={(value) => {
                    setManagerName(value.name)
                    setManagerEmail(value.email)
                    setManagerPosition(value.position ?? "")
                    setManagerDepartment(value.department ?? "")
                  }}
                  onSectionBResponsibleChange={setSectionBResponsible}
                  onKitt6ContactChange={setKitt6OptionContact}
                  onConflictOfInterestChange={setConflictOfInterest}
                />
              )}

              {canGeneratePdf && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={requestGeneratePdf}
                  className="gap-1"
                  disabled={saving || sendingPdf}
                >
                  <Printer className="size-4" /> {pdfButtonLabel}
                </Button>
              )}

              {canSendPdf && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSendPdfDialogOpen(true)}
                  className="gap-1"
                  disabled={saving || sendingPdf}
                >
                  <Send className="size-4" /> Odeslat PDF
                </Button>
              )}

              {canUnlock && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleUnlock()}
                  disabled={saving}
                  className="gap-1"
                >
                  <Undo2 className="size-4" />
                  Odemknout pro úpravy
                </Button>
              )}

              {!isLocked && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
                    onClick={() =>
                      requestSave(
                        () => void handleSave(false, { requestClose: true })
                      )
                    }
                    disabled={saving}
                  >
                    {saving ? "Ukládám…" : "Uložit"}
                  </Button>

                  {canLock && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 bg-background"
                      onClick={() =>
                        requestSave(
                          () => void handleSave(true, { requestClose: true })
                        )
                      }
                      disabled={saving || completion.percent < 100}
                      title={
                        completion.percent < 100
                          ? "Nejdřív dokončete všechny sekce (viz Nedokončeno výše)"
                          : undefined
                      }
                    >
                      <Lock className="size-4" />
                      Dokončit a uzamknout
                    </Button>
                  )}
                </>
              )}

              {((isInternalMode && isAdmin) || isEmployeeVisitor) &&
                resolvedOffboardingId && (
                  <DocumentHistoryDialog
                    title="Historie výstupního listu"
                    fetchUrl={`/api/odchody/${resolvedOffboardingId}/exit-checklist/history`}
                    actionLabel={exitChecklistEventActionLabel}
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                      >
                        <HistoryIcon className="size-4" />
                        Historie
                      </Button>
                    }
                  />
                )}
            </div>
          </div>
        </div>
      )}

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xl font-semibold">Výstupní list</span>
            <div className="flex flex-wrap items-center gap-2">
              {isLockedBadge}
              {!isInternalMode && (
                <>
                  <Badge
                    variant="outline"
                    className={
                      completion.percent === 100
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }
                  >
                    {completion.percent} % dokončeno
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      conflictOfInterest === true
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : conflictOfInterest === false
                          ? "text-muted-foreground"
                          : "border-red-200 bg-red-50 text-red-700"
                    }
                  >
                    {conflictOfInterest === true
                      ? "Střet zájmů: Ano"
                      : conflictOfInterest === false
                        ? "Střet zájmů: Ne"
                        : "Střet zájmů: nerozhodnuto"}
                  </Badge>
                  {!isLocked && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1 bg-background"
                      onClick={requestGeneratePdf}
                    >
                      <Printer className="size-4" />
                      Stáhnout PDF
                    </Button>
                  )}
                  {!isLocked && onRequestSave && (
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1 bg-[#00847C] text-white hover:bg-[#0B6D73]"
                      onClick={onRequestSave}
                      disabled={!dirty}
                    >
                      <Save className="size-4" />
                      Uložit
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6 text-sm">
          {!isInternalMode && isEmployeeVisitor && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Než bude moct být vyrovnání závazků elektronicky podepsáno,
                musíte fyzicky vrátit zapůjčený majetek, předat agendu a
                vyrovnat případné závazky. Podepsat můžete pouze svoje pole
                (Podpis zaměstnance) – ostatní pole a sekce vyplňují a
                podepisují ostatní zúčastnění.
              </span>
            </div>
          )}

          {!isInternalMode && isManagerVisitor && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Jste vedoucí odboru u tohoto výstupního listu (případně jeho
                zástupce). Zkontrolujte prosím všechny sekce
                {!includeHandoverAgenda
                  ? ", v sekci C vyberte způsob předání agendy"
                  : ""}{" "}
                a podepište ji – bez vyplnění a podpisu zůstane výstupní list
                nekompletní.
              </span>
            </div>
          )}

          {!isInternalMode &&
            isSectionBResponsibleVisitor &&
            !assetsComplete && (
              <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Jste odpovědná osoba za sekci B (vyrovnání majetku), nebo ji
                  zastupujete. Prosím zkontrolujte a podepište vyrovnání
                  majetku, dokud nebude vyplněné, bude výstupní list zůstávat
                  nekompletní.
                </span>
              </div>
            )}

          {!isInternalMode && !isCurrentUserAuthorizedSigner && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Byli jste odebráni ze seznamu příjemců k podpisu tohoto
                výstupního listu, takže ho aktuálně nemůžete podepsat. Výstupní
                list si můžete prohlédnout, ale pro obnovení možnosti podepsat
                požádejte Personální oddělení o opětovné přidání do seznamu
                příjemců.
              </span>
            </div>
          )}

          <div className="rounded-xl border bg-background px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Zaměstnanec
            </div>
            <div className="text-lg font-semibold leading-snug">
              {header.employeeName || "–"}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <HeaderDetailTile
              label="Osobní číslo"
              value={header.personalNumber}
            />
            <HeaderDetailTile label="Datum skončení" value={formattedDate} />
            <HeaderDetailTile label="Odbor" value={header.department} />
            <HeaderDetailTile label="Oddělení" value={header.unitName} />
            <HeaderDetailTile label="Pozice" value={header.positionName} />
            <HeaderDetailTile label="Číslo funkce" value={header.positionNum} />
          </div>

          {isInternalMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span>
                Střet zájmů:{" "}
                {conflictOfInterest === true
                  ? "Ano – zahrnut řádek Právního odboru"
                  : conflictOfInterest === false
                    ? "Ne"
                    : "nerozhodnuto"}
              </span>
              {!isLocked && (
                <span className="text-xs font-normal text-muted-foreground">
                  Rozhodnutí proveďte v okně „Seznam a správa osob k podpisu“.
                </span>
              )}
            </div>
          )}

          <div className="grid items-stretch gap-4 border-t pt-4 md:grid-cols-2">
            <HeaderSignatureBlock
              label="Podpis zaměstnance"
              identityName={initialData.employeeName}
              identityEmail={initialData.employeeEmail}
              value={signatures.employee}
              isLocked={isLocked}
              isAdmin={canOverrideOthersSignature}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              interactive={isInternalMode || isEmployeeVisitor}
              onSign={() => signHeaderSignature("employee")}
              onSignBehalf={() => signHeaderSignatureBehalf("employee")}
              onRevoke={() => revokeHeaderSignature("employee")}
            />

            <div
              className={`flex flex-col rounded-md border bg-background p-3 ${
                isEmployeeVisitor ? "opacity-60" : ""
              }`}
              style={{ minHeight: "130px" }}
            >
              <Label className="mb-2 text-sm font-medium">
                Podpis vedoucího odboru
              </Label>

              {isInternalMode && !isLocked && (
                <div className="mb-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">
                      Vybrat vedoucího z eOSu
                    </Label>

                    {initialData.positionNum && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => void reloadManagerFromPosition()}
                        disabled={managerLoading}
                      >
                        <RefreshCcw
                          className={`size-3 ${
                            managerLoading ? "animate-spin" : ""
                          }`}
                        />
                        {managerLoading ? "Načítám…" : "Načíst dle pozice"}
                      </Button>
                    )}
                  </div>

                  {managerLoadError && (
                    <p className="text-xs text-amber-600">{managerLoadError}</p>
                  )}

                  <PersonLookupCombobox
                    variant="button"
                    valueName={managerName || undefined}
                    valueEmail={managerEmail || undefined}
                    placeholder="Vyhledejte vedoucího v eOSu…"
                    onSelect={(employee) => {
                      setManagerName(buildPersonFullName(employee))
                      setManagerEmail(employee.email ?? "")
                      setManagerPosition(employee.positionName ?? "")
                      setManagerDepartment(employee.department ?? "")
                      setManagerLoadError(null)
                      markDirty()
                    }}
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={managerName}
                        onChange={(event) => {
                          setManagerName(event.target.value)
                          markDirty()
                        }}
                        placeholder="Jméno a příjmení vedoucího (lze vyplnit i ručně)"
                        className="h-8 text-xs"
                      />
                      {managerName && (
                        <button
                          type="button"
                          onClick={() => {
                            setManagerName("")
                            setManagerEmail("")
                            markDirty()
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title="Vymazat vedoucího"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    <Input
                      type="email"
                      value={managerEmail}
                      onChange={(event) => {
                        setManagerEmail(event.target.value)
                        markDirty()
                      }}
                      placeholder="E-mail vedoucího"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {(isLocked || !isInternalMode) && managerName && (
                <div className="mb-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <div className="font-semibold text-foreground">
                    {managerName}
                  </div>
                  {managerEmail && (
                    <div className="text-muted-foreground">{managerEmail}</div>
                  )}
                </div>
              )}

              <div style={{ minHeight: "52px" }} className="flex-1">
                {signatures.manager.signedAt ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="font-semibold text-foreground">
                      {signatures.manager.signedByName ?? "Podepsáno"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Elektronicky podepsáno
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(
                        new Date(signatures.manager.signedAt),
                        "d.M.yyyy HH:mm"
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    Nepodepsáno
                  </div>
                )}
              </div>

              <div
                className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[168px_168px]"
                style={{ minHeight: "70px" }}
              >
                {!isLocked &&
                  (isInternalMode || isManagerVisitor) &&
                  !isEmployeeVisitor &&
                  !signatures.manager.signedAt &&
                  Boolean(currentUserName || currentUserEmail) && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs"
                        onClick={() => signHeaderSignature("manager")}
                      >
                        <Check className="size-3 shrink-0" /> Podepsat
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                        onClick={() => signHeaderSignatureBehalf("manager")}
                      >
                        <Check className="size-3 shrink-0" /> Podepsat v
                        zastoupení
                      </Button>
                    </>
                  )}

                {!isLocked &&
                  (isInternalMode || isManagerVisitor) &&
                  !isEmployeeVisitor &&
                  signatures.manager.signedAt &&
                  (canOverrideOthersSignature ||
                    normalizeEmail(signatures.manager.signedByEmail) ===
                      currentUserEmailNormalized) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                      onClick={() => revokeHeaderSignature("manager")}
                    >
                      <Undo2 className="size-3" /> Zrušit podpis
                    </Button>
                  )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-green-50">
        <CardHeader>
          <CardTitle className="text-base">
            A. Vyrovnání závazků zaměstnance k zaměstnavateli
          </CardTitle>
        </CardHeader>

        <CardContent className="bg-background p-0 sm:p-6">
          <div className="divide-y lg:hidden">
            {items.map((item) => {
              const isSigned = Boolean(item.signedAt)
              const signedAtDate = item.signedAt
                ? format(new Date(item.signedAt), "d.M.yyyy HH:mm")
                : ""
              const isSigningDisabled = signingDisabledKeys.includes(item.key)
              const isLawInfoGreyed = item.key === "lawInfo" && lawInfoGreyed
              const isOwnRow = ownRowKeys.has(item.key)
              const currentUserIsSigner =
                normalizeEmail(item.signedByEmail) ===
                currentUserEmailNormalized
              const showSignButton =
                !isLocked &&
                !isSigned &&
                !isSigningDisabled &&
                !isEmployeeVisitor
              const showRevokeButton =
                !isLocked &&
                isSigned &&
                !isSigningDisabled &&
                !isLawInfoGreyed &&
                !isEmployeeVisitor &&
                (canOverrideOthersSignature || currentUserIsSigner)
              const resolutionEditable =
                !isLocked &&
                !isSigningDisabled &&
                !isSigned &&
                !isEmployeeVisitor

              return (
                <div
                  key={item.key}
                  className={`space-y-2 px-4 py-3 ${
                    isLawInfoGreyed ? "opacity-50" : ""
                  } ${isOwnRow ? "bg-emerald-50/40" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    {renderOrganization(
                      item.organization,
                      item.key === "handoverProtocol" ? managerName : null
                    )}
                    {isOwnRow && (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800"
                      >
                        Vaše agenda
                      </Badge>
                    )}
                  </div>

                  <div className="text-sm">{item.obligation}</div>

                  <div className="flex flex-col gap-2 pt-1 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                    {resolutionEditable ? (
                      <div className="inline-flex w-fit items-center gap-2 rounded-md bg-muted px-1 py-0.5 text-[11px]">
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 ${
                            item.resolved === "YES"
                              ? "bg-green-600 text-white"
                              : "bg-background hover:bg-green-100"
                          }`}
                          onClick={() => updateResolved(item.key, "YES")}
                        >
                          Ano
                        </button>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 ${
                            item.resolved === "NO"
                              ? "bg-red-600 text-white"
                              : "bg-background hover:bg-red-100"
                          }`}
                          onClick={() => updateResolved(item.key, "NO")}
                        >
                          Ne
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium">
                        {isLawInfoGreyed
                          ? "–"
                          : item.resolved === "YES"
                            ? "✓ Ano"
                            : item.resolved === "NO"
                              ? "✗ Ne"
                              : "–"}
                      </span>
                    )}

                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {showSignButton && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
                            onClick={() => requestSignRow(item.key, false)}
                          >
                            <Check className="size-3 shrink-0" /> Podepsat
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={`h-7 gap-1 whitespace-nowrap px-2 text-xs ${
                              isOwnRow
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "text-muted-foreground"
                            }`}
                            onClick={() => requestSignRow(item.key, true)}
                          >
                            <Check className="size-3 shrink-0" /> Podepsat
                            v&nbsp;zastoupení
                          </Button>
                        </>
                      )}

                      {showRevokeButton && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 whitespace-nowrap px-2 text-xs text-muted-foreground"
                          onClick={() => revokeSignature(item.key)}
                        >
                          <Undo2 className="size-3" /> Zrušit
                        </Button>
                      )}
                    </div>
                  </div>

                  {resolutionEditable && item.resolved !== null && (
                    <Input
                      value={item.note ?? ""}
                      onChange={(e) => updateItemNote(item.key, e.target.value)}
                      placeholder="poznámka"
                      className="h-7 bg-background py-1 text-[11px] leading-4"
                    />
                  )}

                  {!resolutionEditable && item.note && (
                    <p className="text-[11px] text-muted-foreground">
                      {item.note}
                    </p>
                  )}

                  {isSigned && !isLawInfoGreyed && (
                    <div className="text-xs">
                      <span className="font-medium text-foreground">
                        {item.signedByName}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · Elektronicky podepsáno · {signedAtDate}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <Table className="w-full min-w-[780px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[24%]">Odbor / organizace</TableHead>
                  <TableHead className="w-[18%]">Závazek</TableHead>
                  <TableHead className="w-[16%] text-center">
                    Vyrovnán
                  </TableHead>
                  <TableHead className="w-1/5 pl-2">Datum a podpis</TableHead>
                  <TableHead className="w-[22%] pl-2 text-left">Akce</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {items.map((item) => {
                  const isSigned = Boolean(item.signedAt)
                  const signedAtDate = item.signedAt
                    ? format(new Date(item.signedAt), "d.M.yyyy HH:mm")
                    : ""
                  const isSigningDisabled = signingDisabledKeys.includes(
                    item.key
                  )
                  const isLawInfoGreyed =
                    item.key === "lawInfo" && lawInfoGreyed
                  const isOwnRow = ownRowKeys.has(item.key)
                  const currentUserIsSigner =
                    normalizeEmail(item.signedByEmail) ===
                    currentUserEmailNormalized
                  const showSignButton =
                    !isLocked &&
                    !isSigned &&
                    !isSigningDisabled &&
                    !isEmployeeVisitor
                  const showRevokeButton =
                    !isLocked &&
                    isSigned &&
                    !isSigningDisabled &&
                    !isLawInfoGreyed &&
                    !isEmployeeVisitor &&
                    (canOverrideOthersSignature || currentUserIsSigner)
                  const resolutionEditable =
                    !isLocked &&
                    !isSigningDisabled &&
                    !isSigned &&
                    !isEmployeeVisitor

                  return (
                    <TableRow
                      key={item.key}
                      className={`${isLawInfoGreyed ? "opacity-50" : ""} ${
                        isOwnRow ? "bg-emerald-50/40" : ""
                      }`}
                      style={{ height: "92px" }}
                    >
                      <TableCell className="w-[24%] align-middle text-sm">
                        <div className="flex items-center gap-1.5">
                          {renderOrganization(
                            item.organization,
                            item.key === "handoverProtocol" ? managerName : null
                          )}
                          {isOwnRow && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800"
                            >
                              Vaše agenda
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-[18%] whitespace-normal break-words align-middle text-sm leading-snug">
                        {item.obligation}
                      </TableCell>
                      <TableCell className="w-[16%] text-center align-middle">
                        {resolutionEditable ? (
                          <div className="inline-flex w-fit items-center gap-2 rounded-md bg-muted px-1 py-0.5 text-[11px]">
                            <button
                              type="button"
                              className={`rounded px-2 py-0.5 ${
                                item.resolved === "YES"
                                  ? "bg-green-600 text-white"
                                  : "bg-background hover:bg-green-100"
                              }`}
                              onClick={() => updateResolved(item.key, "YES")}
                            >
                              Ano
                            </button>
                            <button
                              type="button"
                              className={`rounded px-2 py-0.5 ${
                                item.resolved === "NO"
                                  ? "bg-red-600 text-white"
                                  : "bg-background hover:bg-red-100"
                              }`}
                              onClick={() => updateResolved(item.key, "NO")}
                            >
                              Ne
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm font-medium">
                            {isLawInfoGreyed
                              ? "–"
                              : item.resolved === "YES"
                                ? "Ano"
                                : item.resolved === "NO"
                                  ? "Ne"
                                  : "–"}
                          </span>
                        )}

                        {resolutionEditable && item.resolved !== null && (
                          <Input
                            value={item.note ?? ""}
                            onChange={(e) =>
                              updateItemNote(item.key, e.target.value)
                            }
                            placeholder="poznámka"
                            className="mt-2 h-6 bg-background px-2 py-0.5 text-[10px] leading-4"
                          />
                        )}

                        {!resolutionEditable && item.note && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {item.note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="w-1/5 pl-2 align-middle">
                        <TableSignatureCell
                          isSigned={isSigned}
                          isMuted={isLawInfoGreyed}
                          signedByName={item.signedByName}
                          signedAt={signedAtDate}
                        />
                      </TableCell>
                      <TableCell className="w-[22%] pl-2 align-middle">
                        <TableActionCell
                          showSignButton={showSignButton}
                          showRevokeButton={showRevokeButton}
                          isOwnRow={isOwnRow}
                          onSign={() => requestSignRow(item.key, false)}
                          onSignBehalf={() => requestSignRow(item.key, true)}
                          onRevoke={() => revokeSignature(item.key)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-amber-50">
        <CardHeader>
          <CardTitle className="text-base">
            B. Výpis z osobní karty zaměstnance o zapůjčení movitého majetku
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            (mobilní telefon, fotopřístroje) evidovaného Odborem služeb k datu
            vystavení:
          </p>

          {assetsSignedByOther && !canOverrideOthersSignature && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Tuto sekci už potvrdil(a) {signatures.issuer.signedByName} a
                nelze ji dál upravovat. V případě potřeby kontaktujte Personální
                oddělení.
              </span>
            </div>
          )}

          {!assetsFieldsLocked && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="noAssets"
                className="bg-background"
                checked={noAssets}
                onCheckedChange={(checked) => {
                  const next = Boolean(checked)
                  if (next && assets.length > 0) {
                    setConfirmClearAssetsOpen(true)
                    return
                  }
                  setNoAssets(next)
                  markAssetsHrEdit()
                  markDirty()
                }}
              />
              <Label htmlFor="noAssets" className="cursor-pointer text-sm">
                Zaměstnanec nemá žádný zapůjčený majetek
              </Label>
            </div>
          )}

          {!noAssets && assets.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Není vyplněný žádný majetek. Zaškrtněte, že žádný nemá, nebo
                přidejte položky.
              </span>
            </div>
          )}

          <div className="space-y-3 sm:hidden">
            {assets.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                Zatím žádné položky. Přidejte je tlačítkem níže.
              </p>
            )}

            {assets.map((asset, index) => (
              <div key={asset.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Položka {index + 1}
                  </p>
                  {!assetsFieldsLocked && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={() => removeAsset(asset.id)}
                      aria-label="Odebrat položku"
                    >
                      ×
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Předmět
                    </Label>
                    {!assetsFieldsLocked ? (
                      <Input
                        value={asset.subject}
                        onChange={(e) =>
                          updateAsset(asset.id, "subject", e.target.value)
                        }
                        placeholder="např. mobilní telefon"
                        className="bg-background"
                      />
                    ) : (
                      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                        {asset.subject || "—"}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Inventární číslo
                    </Label>
                    {!assetsFieldsLocked ? (
                      <Input
                        value={asset.inventoryNumber}
                        onChange={(e) =>
                          updateAsset(
                            asset.id,
                            "inventoryNumber",
                            e.target.value
                          )
                        }
                        placeholder="např. 123456"
                        className="bg-background"
                      />
                    ) : (
                      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                        {asset.inventoryNumber || "—"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Předmět</TableHead>
                  <TableHead className="w-[200px]">Inventární číslo</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {assets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <p className="text-sm text-muted-foreground">
                        Zatím žádné položky. Přidejte je tlačítkem níže.
                      </p>
                    </TableCell>
                  </TableRow>
                )}

                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      {!assetsFieldsLocked ? (
                        <Input
                          value={asset.subject}
                          onChange={(e) =>
                            updateAsset(asset.id, "subject", e.target.value)
                          }
                          placeholder="např. mobilní telefon"
                          className="bg-background"
                        />
                      ) : (
                        <span>{asset.subject}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!assetsFieldsLocked ? (
                        <Input
                          value={asset.inventoryNumber}
                          onChange={(e) =>
                            updateAsset(
                              asset.id,
                              "inventoryNumber",
                              e.target.value
                            )
                          }
                          placeholder="např. 123456"
                          className="bg-background"
                        />
                      ) : (
                        <span>{asset.inventoryNumber}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!assetsFieldsLocked && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeAsset(asset.id)}
                          aria-label="Odebrat"
                        >
                          ×
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!assetsFieldsLocked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAssetRow}
              className="gap-1 border-2 border-dashed border-[#00847C] text-[#00847C] hover:bg-[#00847C]/10"
            >
              <Plus className="size-4" />
              Přidat položku
            </Button>
          )}

          {assetsEditedByHR && (
            <div className="flex justify-end">
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-800"
              >
                Upraveno {hrEditRoleLabel(assetsEditedByHR)}
                {" · "}
                {format(new Date(assetsEditedByHR.at), "d.M.yyyy HH:mm")}
              </Badge>
            </div>
          )}

          <div className="border-t pt-4">
            <HeaderSignatureBlock
              label="Za Odbor služeb potvrzuje správnost Výpisu"
              value={signatures.issuer}
              isLocked={isLocked}
              isAdmin={canOverrideOthersSignature}
              interactive={isInternalMode || !isEmployeeVisitor}
              signDisabledReason={
                !assetsComplete
                  ? "Nejdřív v sekci B vyplňte zapůjčený majetek, nebo zaškrtněte, že zaměstnanec žádný nemá."
                  : undefined
              }
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              onSign={() => signHeaderSignature("issuer")}
              onSignBehalf={() => signHeaderSignatureBehalf("issuer")}
              onRevoke={() => revokeHeaderSignature("issuer")}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>C. Předávaná agenda</span>

            {includeHandoverAgenda && (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-800"
              >
                Vybráno
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm font-medium">
            Elektronické dokumenty v e-spisu — elektronické předání dokumentů
            proběhne/proběhlo následujícím způsobem (vyberte jeden ze tří
            způsobů):
          </p>

          {!includeHandoverAgenda && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Je potřeba vybrat jeden ze způsobů předání agendy, jinak nebude
                výstupní list považován za dokončený.
              </span>
            </div>
          )}

          {handoverSignedByOther && !canOverrideOthersSignature && (
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                Tuto sekci už potvrdil(a){" "}
                {handoverManagerSignature.signedByName} a nelze ji dál
                upravovat. V případě potřeby kontaktujte Personální oddělení.
              </span>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="handover1"
                className="bg-background"
                checked={handoverOption1}
                onCheckedChange={(checked) => {
                  const next = Boolean(checked)
                  setHandoverOption1(next)

                  if (next) {
                    setHandoverOption2(false)
                    setHandoverOption2Target("")
                    setHandoverOption2TargetPositionNum("")
                    setHandoverOption2TargetDepartment("")
                    setHandoverOption2TargetUnitName("")
                    setHandoverOption3(false)
                    setHandoverOption3Reason("")
                    setResponsibleParty(null)
                    setHandoverRecipients([])
                  } else {
                    setHandoverOption1Note("")
                  }

                  markHandoverHrEdit()
                  markDirty()
                }}
                disabled={handoverFieldsLocked}
              />
              <Label
                htmlFor="handover1"
                className={`text-sm ${
                  handoverFieldsLocked ? "cursor-default" : "cursor-pointer"
                }`}
              >
                Předáno zaměstnancem do spisovny v e-spise nebo předáno na jiné
                funkční místo
              </Label>
            </div>

            {handoverOption1 && (
              <div className="ml-7">
                <Input
                  value={handoverOption1Note}
                  onChange={(e) => {
                    setHandoverOption1Note(e.target.value)
                    markHandoverHrEdit()
                    markDirty()
                  }}
                  placeholder="Poznámka (nepovinné)"
                  disabled={handoverFieldsLocked}
                  className="h-8 bg-background py-1 text-xs"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="handover2"
                  className="bg-background"
                  checked={handoverOption2}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked)
                    setHandoverOption2(next)

                    if (next) {
                      setHandoverOption1(false)
                      setHandoverOption1Note("")
                      setHandoverOption3(false)
                      setHandoverOption3Reason("")
                      setResponsibleParty(null)
                      setHandoverRecipients([])
                    } else {
                      setHandoverOption2Target("")
                      setHandoverOption2TargetPositionNum("")
                      setHandoverOption2TargetDepartment("")
                      setHandoverOption2TargetUnitName("")
                    }

                    markHandoverHrEdit()
                    markDirty()
                  }}
                  disabled={handoverFieldsLocked}
                />
                <Label
                  htmlFor="handover2"
                  className={`text-sm ${
                    handoverFieldsLocked ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  KITT6 předá na jiné funkční místo
                </Label>
              </div>

              {handoverOption2 && (
                <div className="ml-7 space-y-2">
                  <PositionCombobox<PositionSearchItem>
                    positions={[]}
                    showOccupantInfo={false}
                    disabled={handoverFieldsLocked}
                    popoverClassName="w-[420px] p-0"
                    onSelect={(position) => {
                      setHandoverOption2TargetPositionNum(position.num)
                      setHandoverOption2Target(position.name)
                      setHandoverOption2TargetDepartment(
                        position.dept_name ?? ""
                      )
                      setHandoverOption2TargetUnitName(position.unit_name ?? "")
                      markHandoverHrEdit()
                      markDirty()
                    }}
                    trigger={() => (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between bg-background"
                        disabled={handoverFieldsLocked}
                      >
                        <span className="truncate">
                          {selectedHandoverOption2PositionLabel ||
                            "Vyberte funkční místo ze systemizace"}
                        </span>
                        <ChevronDown className="ml-2 size-4 opacity-60" />
                      </Button>
                    )}
                  />

                  {selectedHandoverOption2PositionLabel && (
                    <p className="text-xs text-muted-foreground">
                      Vybrané funkční místo:{" "}
                      <span className="font-medium">
                        {selectedHandoverOption2PositionLabel}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="handover3"
                  className="bg-background"
                  checked={handoverOption3}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked)
                    setHandoverOption3(next)

                    if (next) {
                      setHandoverOption1(false)
                      setHandoverOption1Note("")
                      setHandoverOption2(false)
                      setHandoverOption2Target("")
                      setHandoverOption2TargetPositionNum("")
                      setHandoverOption2TargetDepartment("")
                      setHandoverOption2TargetUnitName("")
                    } else {
                      setHandoverOption3Reason("")
                      setResponsibleParty(null)
                      setHandoverRecipients([])
                      setNewRecipientName("")
                      setNewRecipientEmail("")
                      setNewRecipientPersonalNumber("")
                      setNewRecipientDepartment("")
                      setNewRecipientError(null)
                    }

                    markHandoverHrEdit()
                    markDirty()
                  }}
                  disabled={handoverFieldsLocked}
                />
                <Label
                  htmlFor="handover3"
                  className={`text-sm ${
                    handoverFieldsLocked ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  Zůstává zatím na neobsazeném funkčním místě z důvodu:
                </Label>
              </div>

              {handoverOption3 && (
                <div className="ml-7 space-y-3">
                  <Input
                    value={handoverOption3Reason}
                    onChange={(e) => {
                      setHandoverOption3Reason(e.target.value)
                      markHandoverHrEdit()
                      markDirty()
                    }}
                    placeholder="Důvod (povinné) – např. do doby nástupu nového zaměstnance"
                    disabled={handoverFieldsLocked}
                    className="bg-background"
                  />

                  <div className="space-y-3 rounded-md border bg-background p-3">
                    <div>
                      <Label className="text-sm font-medium">
                        Za dokumenty odpovídá (povinné)
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vyberte odpovědnou osobu z EOS nebo ji doplňte ručně.
                        Pokud osoba není v EOS, vyplňte celé jméno a e-mail.
                        Informace se odešle automaticky po vyplnění, podpisu a
                        uložení sekce C.
                      </p>
                    </div>

                    {!handoverFieldsLocked && (
                      <>
                        <PersonLookupCombobox
                          variant="button"
                          placeholder="Vyhledat odpovědnou osobu v eOSu…"
                          onSelect={(employee) => {
                            const id = employee.id
                            const email = normalizeEmail(employee.email)

                            if (
                              handoverRecipients.some(
                                (recipient) =>
                                  recipient.id === id ||
                                  normalizeEmail(recipient.email) === email
                              )
                            ) {
                              return
                            }

                            setHandoverRecipients((prev) => [
                              ...prev,
                              {
                                id,
                                name: buildPersonFullName(employee),
                                email: employee.email ?? "",
                                personalNumber: employee.personalNumber,
                                department: employee.department,
                              },
                            ])

                            markHandoverHrEdit()
                            markDirty()
                          }}
                        />

                        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                          <Label className="text-xs font-medium">
                            Přidat osobu ručně
                          </Label>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              placeholder="Celé jméno a příjmení *"
                              value={newRecipientName}
                              onChange={(e) => {
                                setNewRecipientName(e.target.value)
                                setNewRecipientError(null)
                              }}
                              className="h-8 bg-background text-sm"
                            />

                            <Input
                              placeholder="email@praha6.cz *"
                              value={newRecipientEmail}
                              onChange={(e) => {
                                setNewRecipientEmail(e.target.value)
                                setNewRecipientError(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addRecipientManually()
                                }
                              }}
                              className="h-8 bg-background text-sm"
                            />

                            <Input
                              placeholder="Osobní číslo"
                              value={newRecipientPersonalNumber}
                              onChange={(e) => {
                                setNewRecipientPersonalNumber(e.target.value)
                                setNewRecipientError(null)
                              }}
                              className="h-8 bg-background text-sm"
                            />

                            <Input
                              placeholder="Odbor / oddělení"
                              value={newRecipientDepartment}
                              onChange={(e) => {
                                setNewRecipientDepartment(e.target.value)
                                setNewRecipientError(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addRecipientManually()
                                }
                              }}
                              className="h-8 bg-background text-sm"
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 bg-background"
                              onClick={addRecipientManually}
                            >
                              Přidat
                            </Button>
                          </div>

                          {newRecipientError && (
                            <p className="text-xs text-red-600">
                              {newRecipientError}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {handoverRecipients.length > 0 ? (
                      <div className="space-y-1">
                        {handoverRecipients.map((recipient) => (
                          <div
                            key={recipient.id}
                            className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {recipient.name}
                                </span>
                                {recipient.personalNumber && (
                                  <span className="font-mono text-muted-foreground">
                                    {recipient.personalNumber}
                                  </span>
                                )}
                              </div>

                              <div className="flex gap-3 text-muted-foreground">
                                {recipient.department && (
                                  <span>{recipient.department}</span>
                                )}
                                {recipient.email && (
                                  <span>{recipient.email}</span>
                                )}
                              </div>
                            </div>

                            {!handoverFieldsLocked && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHandoverRecipients((prev) =>
                                    prev.filter((x) => x.id !== recipient.id)
                                  )
                                  markHandoverHrEdit()
                                  markDirty()
                                }}
                                className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                                aria-label="Odebrat příjemce"
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Zatím není uvedena žádná odpovědná osoba.
                      </p>
                    )}

                    {Boolean(currentUserEmail) &&
                      Boolean(resolvedOffboardingId) && (
                        <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                          <p className="font-medium">
                            Informace se odešlou automaticky osobám uvedeným v
                            poli „Za dokumenty odpovídá“, jakmile vedoucí odboru
                            sekci C vyplní, podepíše a uloží.
                          </p>

                          {displayedHandoverSendHistory.length > 0 ? (
                            <div className="mt-3 rounded-md border border-blue-200 bg-white/70 p-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-900">
                                Historie odeslání informací
                              </p>

                              <div className="space-y-2">
                                {displayedHandoverSendHistory.map((entry) => (
                                  <div
                                    key={`${entry.id}-${entry.email}`}
                                    className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800"
                                  >
                                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                      <div className="min-w-0">
                                        <span className="font-semibold text-foreground">
                                          {entry.name}
                                        </span>
                                        {entry.email && (
                                          <span className="text-blue-700">
                                            {" "}
                                            · {entry.email}
                                          </span>
                                        )}
                                      </div>

                                      <div className="shrink-0 text-blue-700">
                                        odesláno {entry.sentCount || 1}×
                                      </div>
                                    </div>

                                    <div className="mt-1 text-blue-700">
                                      Naposledy{" "}
                                      <span className="font-medium">
                                        {formatDateTime(entry.lastSentAt)}
                                      </span>
                                      {entry.lastSentByName ||
                                      entry.lastSentByEmail ? (
                                        <>
                                          {" "}
                                          uživatelem{" "}
                                          <span className="font-medium">
                                            {entry.lastSentByName ??
                                              entry.lastSentByEmail}
                                          </span>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : handoverRecipientsSentAt ? (
                            <p className="mt-2 text-[11px] text-blue-700">
                              Zasláno {formatDateTime(handoverRecipientsSentAt)}{" "}
                              uživatelem{" "}
                              <span className="font-medium">
                                {handoverRecipientsSentByName ??
                                  handoverRecipientsSentByEmail ??
                                  "neznámý uživatel"}
                              </span>
                              {handoverRecipientsSentCount &&
                              handoverRecipientsSentCount > 1
                                ? ` · odesláno ${handoverRecipientsSentCount}×`
                                : ""}
                            </p>
                          ) : null}

                          {validHandoverRecipients.length === 0 && (
                            <p className="mt-2 text-[11px] text-blue-700">
                              Informace se odešlou po přidání alespoň jedné
                              odpovědné osoby s platným e-mailem.
                            </p>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {handoverEditedByHR && (
            <div className="flex justify-end">
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-800"
              >
                Upraveno {hrEditRoleLabel(handoverEditedByHR)}
                {" · "}
                {format(new Date(handoverEditedByHR.at), "d.M.yyyy HH:mm")}
              </Badge>
            </div>
          )}

          <div className="border-t pt-4">
            <div
              className="flex flex-col rounded-md border bg-background p-3"
              style={{ minHeight: "110px" }}
            >
              <Label className="mb-2 text-sm font-medium">
                Způsob předání agendy potvrzuje — Vedoucí odboru
                {managerName && (
                  <span className="ml-2 font-semibold text-foreground">
                    {managerName}
                  </span>
                )}
              </Label>

              <div style={{ minHeight: "52px" }} className="flex-1">
                {handoverManagerSignature.signedAt ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="font-semibold text-foreground">
                      {handoverManagerSignature.signedByName ?? "Podepsáno"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Elektronicky podepsáno
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(
                        new Date(handoverManagerSignature.signedAt),
                        "d.M.yyyy HH:mm"
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    Nepodepsáno
                  </div>
                )}
              </div>

              {!isLocked && (isInternalMode || isManagerVisitor) && (
                <div
                  className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-[168px_168px]"
                  style={{ minHeight: "70px" }}
                >
                  {!handoverManagerSignature.signedAt &&
                    Boolean(currentUserName || currentUserEmail) && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs"
                          onClick={() => signHandoverManagerSignature(false)}
                          disabled={!handoverSignReady}
                          title={
                            !handoverSignReady
                              ? handoverSignBlockedReason
                              : undefined
                          }
                        >
                          <Check className="size-3 shrink-0" /> Podepsat
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                          onClick={() => signHandoverManagerSignature(true)}
                          disabled={!handoverSignReady}
                          title={
                            !handoverSignReady
                              ? handoverSignBlockedReason
                              : undefined
                          }
                        >
                          <Check className="size-3 shrink-0" /> Podepsat v
                          zastoupení
                        </Button>
                      </>
                    )}

                  {handoverManagerSignature.signedAt &&
                    (canOverrideOthersSignature ||
                      normalizeEmail(handoverManagerSignature.signedByEmail) ===
                        currentUserEmailNormalized) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                        onClick={revokeHandoverManagerSignature}
                      >
                        <Undo2 className="size-3" /> Zrušit podpis
                      </Button>
                    )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={sendPdfDialogOpen}
        onOpenChange={(open) => {
          if (!sendingPdf) {
            setSendPdfDialogOpen(open)
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-0">
          <div className="p-6 sm:px-8 sm:py-7">
            <AlertDialogHeader className="space-y-3 text-left">
              <AlertDialogTitle className="text-xl font-semibold">
                Odeslat PDF výstupního listu
              </AlertDialogTitle>

              <AlertDialogDescription className="text-sm leading-6">
                Výstupní list bude vygenerován jako PDF a odeslán vybrané osobě
                jako příloha e-mailu.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="mt-5 space-y-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPdfPickerOpen(true)}
                disabled={sendingPdf}
              >
                <Search className="size-3.5" />
                Vybrat ze zaměstnanců
              </Button>

              <div className="space-y-1.5">
                <Label>Jméno příjemce</Label>
                <Input
                  value={pdfRecipientName}
                  onChange={(e) => setPdfRecipientName(e.target.value)}
                  placeholder="např. Jana Nováková"
                  disabled={sendingPdf}
                />
              </div>

              <div className="space-y-1.5">
                <Label>E-mail příjemce *</Label>
                <Input
                  value={pdfRecipientEmail}
                  onChange={(e) => setPdfRecipientEmail(e.target.value)}
                  placeholder="email@praha6.cz"
                  disabled={sendingPdf}
                />
              </div>

              <EosPersonPickerDialog
                open={pdfPickerOpen}
                onOpenChange={setPdfPickerOpen}
                title="Vybrat zaměstnance"
                onSelect={handlePdfPersonSelected}
                excludeActiveOffboardings={false}
              />

              <div className="space-y-1.5">
                <Label>Doplňující zpráva</Label>
                <Input
                  value={pdfMessage}
                  onChange={(e) => setPdfMessage(e.target.value)}
                  placeholder="Volitelná zpráva k e-mailu"
                  disabled={sendingPdf}
                />
              </div>
            </div>

            <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
              <AlertDialogCancel
                disabled={sendingPdf}
                className="h-10 min-w-[120px]"
              >
                Zrušit
              </AlertDialogCancel>

              <Button
                type="button"
                className="h-10 min-w-[150px] bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={() => void handleSendPdf()}
                disabled={sendingPdf}
              >
                {sendingPdf ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Odesílám…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" />
                    Odeslat PDF
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={foreignSignTarget !== null}
        onOpenChange={(open) => {
          if (!open) setForeignSignTarget(null)
        }}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-0">
          <div className="p-6 sm:px-8 sm:py-7">
            <AlertDialogHeader className="space-y-3 text-left">
              <AlertDialogTitle className="text-xl font-semibold">
                Toto není vaše agenda
              </AlertDialogTitle>

              <AlertDialogDescription className="text-sm leading-6">
                Tento řádek obvykle podepisuje jiná osoba. Opravdu ho chcete
                podepsat i přesto?
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
              <AlertDialogCancel
                onClick={() => setForeignSignTarget(null)}
                className="h-10 min-w-[120px]"
              >
                Zpět
              </AlertDialogCancel>

              <Button
                type="button"
                className="h-10 min-w-[150px] bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={confirmForeignSign}
              >
                Přesto podepsat
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingSaveAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSaveAction(null)
        }}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-0">
          <div className="p-6 sm:px-8 sm:py-7">
            <AlertDialogHeader className="space-y-3 text-left">
              <AlertDialogTitle className="text-xl font-semibold">
                Uložit výstupní list?
              </AlertDialogTitle>

              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm leading-6">
                  {(() => {
                    const { sendLines, missingLines } = buildSaveSummary()

                    if (sendLines.length === 0 && missingLines.length === 0) {
                      return (
                        <p>
                          Změny se uloží. Tímto uložením se nikomu nic odesílat
                          nebude.
                        </p>
                      )
                    }

                    return (
                      <>
                        {sendLines.length > 0 && (
                          <div>
                            <p className="font-medium text-foreground">
                              Po uložení se odešle:
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {sendLines.map((line, index) => (
                                <li key={index}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {missingLines.length > 0 && (
                          <div>
                            <p className="font-medium text-amber-800">
                              Upozornění:
                            </p>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-800">
                              {missingLines.map((line, index) => (
                                <li key={index}>{line}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
              <AlertDialogCancel
                onClick={() => setPendingSaveAction(null)}
                className="h-10 min-w-[120px]"
              >
                Zpět k úpravě
              </AlertDialogCancel>

              <Button
                type="button"
                className="h-10 min-w-[150px] bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={() => {
                  const action = pendingSaveAction
                  setPendingSaveAction(null)
                  action?.()
                }}
              >
                Uložit a odeslat
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmClearAssetsOpen}
        onOpenChange={setConfirmClearAssetsOpen}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-0">
          <div className="p-6 sm:px-8 sm:py-7">
            <AlertDialogHeader className="space-y-3 text-left">
              <AlertDialogTitle className="text-xl font-semibold">
                Vymazat vypsaný majetek?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-6">
                Je vypsáno {assets.length}{" "}
                {assets.length === 1 ? "položka" : "položek"} majetku.
                Zaškrtnutím &bdquo;Zaměstnanec nemá žádný zapůjčený
                majetek&ldquo; se tyto položky vymažou.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
              <AlertDialogCancel className="h-10 min-w-[120px]">
                Zrušit
              </AlertDialogCancel>

              <Button
                type="button"
                className="h-10 min-w-[150px] bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={() => {
                  setAssets([])
                  setNoAssets(true)
                  markAssetsHrEdit()
                  markDirty()
                  setConfirmClearAssetsOpen(false)
                }}
              >
                Vymazat a zaškrtnout
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDirtyAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDirtyAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
            <AlertDialogDescription>
              Výstupní list má neuložené změny. Aby{" "}
              {pendingDirtyAction?.type === "send"
                ? "odeslané PDF odpovídalo"
                : "vygenerované PDF odpovídalo"}{" "}
              aktuálnímu stavu, je potřeba je nejdřív uložit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDirtyAction(null)}>
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={() => void confirmDirtySaveAndProceed()}
            >
              Uložit a pokračovat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
