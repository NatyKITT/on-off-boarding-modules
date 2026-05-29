"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
  Check,
  CheckCircle,
  ChevronDown,
  Loader2,
  Lock,
  Printer,
  RefreshCcw,
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
  AlertDialog,
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SendAllDialog } from "@/components/common/send-all-dialog"
import { SendInviteBehalfDialog } from "@/components/common/send-invite-behalf-dialog"
import { SendInviteDialog } from "@/components/common/send-invite-dialog"

type Props = {
  offboardingId?: number
  publicToken?: string
  mode?: "internal" | "public"
  initialData: ExitChecklistData
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: (data: ExitChecklistData) => void
  externalSaveTrigger?: number
}

type EmployeePersonItem = {
  id: string
  personalNumber: string
  name: string
  surname: string
  email: string
  titleBefore?: string | null
  titleAfter?: string | null
  positionNum?: string
  positionName?: string
  department?: string
  unitName?: string
}

type HandoverPositionItem = {
  id?: string | number | null
  num: string
  name: string
  dept_name?: string | null
  unit_name?: string | null
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
      signedByName: found?.signedByName ?? null,
      signedByEmail: found?.signedByEmail ?? null,
      signedAt: found?.signedAt ?? null,
    }
  })
}

function normalizeStr(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function buildEmployeeFullName(person: Partial<EmployeePersonItem>) {
  return [person.titleBefore, person.name, person.surname, person.titleAfter]
    .filter(Boolean)
    .join(" ")
    .trim()
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
  positionName?: string | null
) {
  const cleanName = cleanPositionName(positionName, positionNum)

  return [positionNum?.trim(), cleanName].filter(Boolean).join(" — ")
}

type RawHandoverPositionItem = Record<string, unknown> & {
  num: string | number
}

function isRawHandoverPositionItem(
  item: unknown
): item is RawHandoverPositionItem {
  if (!item || typeof item !== "object") return false

  const num = (item as { num?: unknown }).num

  return typeof num === "string" || typeof num === "number"
}

function normalizeHandoverPositions(payload: unknown): HandoverPositionItem[] {
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? payload
      : []

  return arr
    .filter(isRawHandoverPositionItem)
    .map((item) => {
      const idValue = item.id
      const num = String(item.num)

      return {
        id:
          typeof idValue === "string" || typeof idValue === "number"
            ? idValue
            : num,
        num,
        name: typeof item.name === "string" ? item.name : "",
        dept_name: typeof item.dept_name === "string" ? item.dept_name : null,
        unit_name: typeof item.unit_name === "string" ? item.unit_name : null,
      }
    })
    .filter((item) => item.num || item.name)
}

function renderOrganization(text: string, managerName?: string | null) {
  const lines = text.split("\n").filter(Boolean)

  if (lines.length === 0) return null

  return (
    <div className="leading-snug">
      <div className="font-semibold">{lines[0]}</div>
      {lines[0] === "Vedoucí odboru" && managerName && (
        <div className="text-xs text-muted-foreground">{managerName}</div>
      )}
      {lines.slice(1).map((line, i) => (
        <div key={i} className="text-xs text-muted-foreground">
          {line}
        </div>
      ))}
    </div>
  )
}

function PersonLookupCombobox({
  valueName,
  valueEmail,
  placeholder,
  disabled,
  onSelect,
}: {
  valueName?: string
  valueEmail?: string
  placeholder?: string
  disabled?: boolean
  onSelect: (employee: EmployeePersonItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [allEmployees, setAllEmployees] = useState<EmployeePersonItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || allEmployees.length > 0) return

    const controller = new AbortController()

    ;(async () => {
      setLoading(true)
      setError(null)

      try {
        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("q", "1")
        url.searchParams.set("limit", "500")

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })

        if (!res.ok) {
          throw new Error(
            res.status === 502 ? "EOS není dostupná" : `Chyba (${res.status})`
          )
        }

        const json = await res.json().catch(() => null)
        setAllEmployees(Array.isArray(json?.data) ? json.data : [])
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "Chyba vyhledávání")
        }
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, allEmployees.length])

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const q = normalizeStr(query.trim())

    if (!q) return allEmployees

    return allEmployees.filter((e) => {
      const num = normalizeStr(e.personalNumber ?? "")
      const nm = normalizeStr(
        `${e.titleBefore ?? ""} ${e.name ?? ""} ${e.surname ?? ""} ${e.titleAfter ?? ""}`
      )
      const org = normalizeStr(
        `${e.positionName ?? ""} ${e.department ?? ""} ${e.unitName ?? ""}`
      )
      const email = normalizeStr(e.email ?? "")

      return (
        num.includes(q) ||
        nm.includes(q) ||
        org.includes(q) ||
        email.includes(q)
      )
    })
  }, [allEmployees, query])

  const selectedLabel =
    valueName || valueEmail
      ? [valueName, valueEmail].filter(Boolean).join(" · ")
      : ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-between text-xs"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedLabel || (placeholder ?? "Vyhledat v eOSu…")}
          </span>
          <ChevronDown className="ml-2 size-3 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder="Osobní číslo, jméno nebo e-mail…"
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery("")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <CommandEmpty>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-current" />
                Načítám…
              </div>
            ) : error ? (
              <div className="py-6 text-center text-sm text-destructive">
                {error}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nic nenalezeno.
              </div>
            )}
          </CommandEmpty>

          <CommandList className="max-h-80 overflow-y-auto overscroll-contain">
            <CommandGroup>
              {filtered.map((e) => (
                <CommandItem
                  key={e.id}
                  value={e.personalNumber || e.id}
                  onPointerDown={(ev) => {
                    ev.preventDefault()
                    onSelect(e)
                    setOpen(false)
                    setQuery("")
                  }}
                  onSelect={() => {}}
                  className="flex cursor-pointer items-start gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {e.personalNumber && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.personalNumber}
                        </span>
                      )}
                      <span className="truncate text-sm font-medium">
                        {buildEmployeeFullName(e)}
                      </span>
                    </div>

                    <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                      {e.positionName && (
                        <div className="truncate">{e.positionName}</div>
                      )}
                      {(e.department || e.unitName) && (
                        <div className="truncate">
                          {[e.department, e.unitName]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      {e.email && <div className="truncate">{e.email}</div>}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

type HeaderSignatureBlockProps = {
  label: string
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

  const canRevoke = !isLocked && isSigned && (isAdmin || currentUserIsSigner)
  const canSign =
    !isLocked && !isSigned && Boolean(currentUserName || currentUserEmail)

  const signedAtDate = value.signedAt
    ? format(new Date(value.signedAt), "d.M.yyyy HH:mm")
    : ""

  return (
    <div
      className="flex flex-col rounded-md border p-3"
      style={{ minHeight: "130px" }}
    >
      <Label className="mb-2 text-sm font-medium">{label}</Label>

      <div style={{ minHeight: "52px" }} className="flex-1">
        {isSigned ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="font-medium">
              {value.signedByName ?? "Podepsáno"}
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
    <div className="flex h-[68px] min-w-0 flex-col justify-center overflow-hidden">
      {isSigned && !isMuted ? (
        <>
          <span
            className="min-w-0 break-words text-sm font-medium leading-tight"
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
          <span className="mt-1 truncate text-xs text-muted-foreground">
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
  onSign,
  onSignBehalf,
  onRevoke,
}: {
  showSignButton: boolean
  showRevokeButton: boolean
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
            className="h-8 w-full justify-start gap-1 px-2 text-xs"
            onClick={onSign}
          >
            <Check className="size-3 shrink-0" />
            <span className="min-w-0 truncate text-left">Podepsat</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full justify-start gap-1 px-2 text-xs text-muted-foreground"
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
  const [conflictOfInterest, setConflictOfInterest] = useState(
    initialData.conflictOfInterest ?? false
  )

  const [includeHandoverAgenda, setIncludeHandoverAgenda] = useState(
    initialData.handover?.includeHandoverAgenda ?? false
  )
  const [handoverOption1, setHandoverOption1] = useState(
    initialData.handover?.option1 ?? false
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
  const [handoverOption3, setHandoverOption3] = useState(
    initialData.handover?.option3 ?? false
  )
  const [handoverOption3Reason, setHandoverOption3Reason] = useState(
    initialData.handover?.option3Reason ?? ""
  )
  const [, setResponsibleParty] = useState<"KITT6" | "OSS_KT" | null>(
    initialData.handover?.responsibleParty ?? null
  )
  const [handoverRecipients, setHandoverRecipients] = useState<
    HandoverRecipient[]
  >(initialData.handover?.handoverRecipients ?? [])

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

  const [managerName, setManagerName] = useState<string>(
    initialData.managerName ?? ""
  )
  const [managerEmail, setManagerEmail] = useState<string>(
    initialData.managerEmail ?? ""
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
  const [sendingHandoverInfo, setSendingHandoverInfo] = useState(false)
  const [lastSaveTrigger, setLastSaveTrigger] = useState<number | undefined>(
    externalSaveTrigger
  )
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState>({
    open: false,
    type: "success",
    title: "",
    message: "",
  })
  const [handoverSendDialogOpen, setHandoverSendDialogOpen] = useState(false)
  const [handoverSendDialogMode, setHandoverSendDialogMode] = useState<
    "first-send" | "resend"
  >("first-send")
  const [sendPdfDialogOpen, setSendPdfDialogOpen] = useState(false)
  const [pdfRecipientName, setPdfRecipientName] = useState("")
  const [pdfRecipientEmail, setPdfRecipientEmail] = useState("")
  const [pdfMessage, setPdfMessage] = useState("")
  const [sendingPdf, setSendingPdf] = useState(false)

  const [positionPickerOpen, setPositionPickerOpen] = useState(false)
  const [positionQuery, setPositionQuery] = useState("")
  const [handoverPositions, setHandoverPositions] = useState<
    HandoverPositionItem[]
  >([])
  const [loadingPositions, setLoadingPositions] = useState(false)
  const [positionLoadError, setPositionLoadError] = useState<string | null>(
    null
  )

  const isInternalMode = mode === "internal"
  const isLocked = Boolean(lockedAt)
  const resolvedOffboardingId = offboardingId ?? initialData.offboardingId
  const role = session?.user.role ?? "USER"
  const isAdmin = role === "ADMIN" || role === "HR" || role === "IT"
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

  const currentUserName = session?.user?.name ?? ""
  const currentUserEmail = session?.user?.email ?? ""
  const currentUserEmailNormalized = normalizeEmail(currentUserEmail)

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

  const handoverRecipientsWereSent = Boolean(handoverRecipientsSentAt)

  const displayedHandoverSendHistory = useMemo(() => {
    return [...handoverSendHistory].sort((a, b) => {
      const aTime = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0
      const bTime = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0

      return bTime - aTime
    })
  }, [handoverSendHistory])

  const canSendHandoverInfo =
    Boolean(resolvedOffboardingId) &&
    Boolean(currentUserEmail) &&
    !isLocked &&
    includeHandoverAgenda &&
    handoverOption3 &&
    validHandoverRecipients.length > 0

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
        handoverOption2Target
      ),
    [handoverOption2Target, handoverOption2TargetPositionNum]
  )

  const filteredPositions = useMemo(() => {
    const query = normalizeStr(positionQuery.trim())

    if (!query) return handoverPositions

    return handoverPositions.filter((position) => {
      const searchable = normalizeStr(
        [
          position.num,
          position.name,
          position.dept_name ?? "",
          position.unit_name ?? "",
        ].join(" ")
      )

      return searchable.includes(query)
    })
  }, [handoverPositions, positionQuery])

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
    setConflictOfInterest(initialData.conflictOfInterest ?? false)
    setIncludeHandoverAgenda(
      initialData.handover?.includeHandoverAgenda ?? false
    )
    setHandoverOption1(initialData.handover?.option1 ?? false)
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
    setManagerName(initialData.managerName ?? "")
    setManagerEmail(initialData.managerEmail ?? "")
    markClean()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDataIdentity])

  useEffect(() => {
    if (externalSaveTrigger === undefined) return
    if (externalSaveTrigger === lastSaveTrigger) return
    setLastSaveTrigger(externalSaveTrigger)
    if (!dirtyRef.current) return
    void handleSave(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSaveTrigger])

  useEffect(() => {
    if (!positionPickerOpen || handoverPositions.length > 0) return

    const controller = new AbortController()

    ;(async () => {
      setLoadingPositions(true)
      setPositionLoadError(null)

      try {
        const res = await fetch("/api/systemizace", {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })

        if (!res.ok) {
          throw new Error(`Pozice se nepodařilo načíst (${res.status}).`)
        }

        const json = await res.json().catch(() => null)
        setHandoverPositions(normalizeHandoverPositions(json))
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setPositionLoadError(
            err instanceof Error
              ? err.message
              : "Nepodařilo se načíst pozice ze systemizace."
          )
        }
      } finally {
        setLoadingPositions(false)
      }
    })()

    return () => controller.abort()
  }, [positionPickerOpen, handoverPositions.length])

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

    markDirty()
  }

  function signHeaderSignatureBehalf(key: HeaderSignatureKey) {
    if (isLocked || (!currentUserName && !currentUserEmail)) return

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

    markDirty()
  }

  function revokeHeaderSignature(key: HeaderSignatureKey) {
    if (isLocked) return

    setSignatures((prev) => {
      const current = prev[key]

      if (!current?.signedAt) return prev

      const signerEmail = normalizeEmail(current.signedByEmail)

      if (!isAdmin && signerEmail !== currentUserEmailNormalized) return prev

      return {
        ...prev,
        [key]: emptySignature(),
      }
    })

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

        const signerEmail = normalizeEmail(item.signedByEmail)

        if (
          !isAdmin &&
          signerEmail &&
          signerEmail !== currentUserEmailNormalized
        ) {
          return item
        }

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

  function signRow(key: ExitChecklistItem["key"]) {
    if (isLocked || !currentUserEmail || signingDisabledKeys.includes(key)) {
      return
    }

    const now = new Date().toISOString()
    let changed = false

    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (item.signedAt) return item

        changed = true

        return {
          ...item,
          resolved: "YES",
          signedByName: currentUserName || currentUserEmail,
          signedByEmail: currentUserEmail,
          signedAt: now,
        }
      })
    )

    if (changed) markDirty()
  }

  function signRowOnBehalf(key: ExitChecklistItem["key"]) {
    if (isLocked || !currentUserEmail || signingDisabledKeys.includes(key)) {
      return
    }

    const now = new Date().toISOString()
    let changed = false

    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (item.signedAt) return item

        changed = true

        return {
          ...item,
          resolved: "YES",
          signedByName: `${currentUserName || currentUserEmail} — v zastoupení`,
          signedByEmail: currentUserEmail,
          signedAt: now,
        }
      })
    )

    if (changed) markDirty()
  }

  function revokeSignature(key: ExitChecklistItem["key"]) {
    if (isLocked) return

    let changed = false

    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (!item.signedAt) return item

        const signerEmail = normalizeEmail(item.signedByEmail)

        if (!isAdmin && signerEmail !== currentUserEmailNormalized) {
          return item
        }

        changed = true

        return {
          ...item,
          resolved: null,
          signedByName: null,
          signedByEmail: null,
          signedAt: null,
        }
      })
    )

    if (changed) markDirty()
  }

  function signHandoverManagerSignature(behalf = false) {
    if (isLocked || (!currentUserName && !currentUserEmail)) return

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

    setHandoverManagerSignature((prev) => {
      if (!prev.signedAt) return prev

      const signerEmail = normalizeEmail(prev.signedByEmail)

      if (!isAdmin && signerEmail !== currentUserEmailNormalized) return prev

      return emptySignature()
    })

    markDirty()
  }

  function addAssetRow() {
    if (isLocked) return

    setAssets((prev) => [
      ...prev,
      {
        id: createTempId(),
        subject: "",
        inventoryNumber: "",
      },
    ])

    markDirty()
  }

  function updateAsset(
    id: string,
    field: "subject" | "inventoryNumber",
    value: string
  ) {
    if (isLocked) return

    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    )

    markDirty()
  }

  function removeAsset(id: string) {
    if (isLocked) return

    setAssets((prev) => prev.filter((a) => a.id !== id))
    markDirty()
  }

  function addRecipientManually() {
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
    markDirty()
  }

  function openHandoverSendDialog() {
    if (!resolvedOffboardingId || !currentUserEmail) {
      showFeedback(
        "error",
        "Odeslání není dostupné",
        "Informace může odeslat pouze přihlášený uživatel s oprávněním k výstupnímu listu."
      )
      return
    }

    if (isLocked) {
      showFeedback(
        "error",
        "Výstupní list je uzamčený",
        "Po uzamčení už nelze odesílat informace příjemcům předávané agendy."
      )
      return
    }

    if (!includeHandoverAgenda || !handoverOption3) {
      showFeedback(
        "error",
        "Předávaná agenda není připravena",
        "Nejdříve zaškrtněte možnost „Zůstává zatím na neobsazeném funkčním místě“ a doplňte osobu do pole „Za dokumenty odpovídá“."
      )
      return
    }

    if (validHandoverRecipients.length === 0) {
      showFeedback(
        "error",
        "Chybí příjemci",
        "Přidejte alespoň jednoho příjemce s platným e-mailem."
      )
      return
    }

    setHandoverSendDialogMode(
      handoverRecipientsWereSent ? "resend" : "first-send"
    )
    setHandoverSendDialogOpen(true)
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
      setSendingHandoverInfo(true)

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

      if (res.status === 409 && json?.code === "ALREADY_SENT") {
        setHandoverSendDialogMode("resend")
        setHandoverSendDialogOpen(true)
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
      setHandoverSendDialogOpen(false)

      showFeedback(
        "success",
        force ? "Informace byly odeslány znovu" : "Informace byly odeslány",
        `Informace o předávané agendě byly odeslány pro ${validHandoverRecipients.length} osobu/osob.`
      )
    } catch (err) {
      showFeedback(
        "error",
        "Chyba při odesílání",
        err instanceof Error
          ? err.message
          : "Došlo k neočekávané chybě při odesílání."
      )
    } finally {
      setSendingHandoverInfo(false)
    }
  }

  async function handleSave(lockAfterSave: boolean): Promise<boolean> {
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
          handoverManagerSignature,
          items: items.map((i) => ({
            key: i.key,
            resolved: i.resolved,
            signedByName: i.signedByName,
            signedByEmail: i.signedByEmail,
            signedAt: i.signedAt,
          })),
          assets: assets.map((a) => ({
            id: a.id,
            subject: a.subject,
            inventoryNumber: a.inventoryNumber,
          })),
          handover: {
            includeHandoverAgenda,
            option1: handoverOption1,
            option2: handoverOption2,
            option2Target: cleanHandoverOption2Target,
            option2TargetPositionNum: handoverOption2TargetPositionNum,
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
        setLockedAt(payload.data.lockedAt ?? null)
        setConflictOfInterest(payload.data.conflictOfInterest ?? false)
        setSignatures({
          employee: payload.data.signatures?.employee ?? emptySignature(),
          manager: payload.data.signatures?.manager ?? emptySignature(),
          issuer: payload.data.signatures?.issuer ?? emptySignature(),
          issuedDate: getDefaultIssuedDate(payload.data.signatures?.issuedDate),
        })
        setHandoverManagerSignature(
          payload.data.handoverManagerSignature ?? emptySignature()
        )
        setIncludeHandoverAgenda(
          payload.data.handover?.includeHandoverAgenda ?? false
        )
        setHandoverOption1(payload.data.handover?.option1 ?? false)
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

        onSaved?.(payload.data)
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

  async function requestGeneratePdf() {
    if (dirtyRef.current && !isLocked) {
      const saved = await handleSave(false)

      if (!saved) return
    }

    openPdf()
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

  async function handleSendPdf() {
    if (!resolvedOffboardingId || !canSendPdf) return

    const email = pdfRecipientEmail.trim().toLowerCase()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFeedback("error", "Chybí e-mail", "Zadejte platný e-mail příjemce.")
      return
    }

    try {
      setSendingPdf(true)

      if (dirtyRef.current && !isLocked) {
        const saved = await handleSave(false)

        if (!saved) return
      }

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

  const isLockedBadge = isLocked ? (
    <Badge variant="outline" className="flex items-center gap-1">
      <Lock className="size-3" /> Uzamčeno k úpravám
    </Badge>
  ) : (
    <Badge variant="secondary">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Výstupní list</span>
            {isLockedBadge}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6 text-sm">
          <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
            <div>
              <span className="font-medium text-muted-foreground">
                Zaměstnanec:
              </span>{" "}
              {header.employeeName}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Osobní číslo:
              </span>{" "}
              {header.personalNumber ?? "–"}
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
            <div>
              <span className="font-medium text-muted-foreground">
                Odbor / oddělení:
              </span>{" "}
              {header.department} – {header.unitName}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Datum skončení:
              </span>{" "}
              {formattedDate || "–"}
            </div>
          </div>

          {isInternalMode && !isLocked && (
            <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <Checkbox
                id="conflictOfInterest"
                checked={conflictOfInterest}
                onCheckedChange={(checked) => {
                  setConflictOfInterest(Boolean(checked))
                  markDirty()
                }}
              />
              <Label
                htmlFor="conflictOfInterest"
                className="cursor-pointer text-sm"
              >
                Obsahuje střet zájmů{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (aktivuje řádek Právního odboru k podpisu)
                </span>
              </Label>
            </div>
          )}

          {isInternalMode && isLocked && conflictOfInterest && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Střet zájmů: zahrnut řádek Právního odboru
            </div>
          )}

          <div className="grid items-stretch gap-4 border-t pt-4 md:grid-cols-2">
            <HeaderSignatureBlock
              label="Podpis zaměstnance"
              value={signatures.employee}
              isLocked={isLocked}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              onSign={() => signHeaderSignature("employee")}
              onSignBehalf={() => signHeaderSignatureBehalf("employee")}
              onRevoke={() => revokeHeaderSignature("employee")}
            />

            <div
              className="flex flex-col rounded-md border p-3"
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
                    valueName={managerName || undefined}
                    valueEmail={managerEmail || undefined}
                    placeholder="Vyhledejte vedoucího v eOSu…"
                    onSelect={(employee) => {
                      setManagerName(buildEmployeeFullName(employee))
                      setManagerEmail(employee.email ?? "")
                      setManagerLoadError(null)
                      markDirty()
                    }}
                  />

                  {managerName && (
                    <div className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                      <div>
                        <div className="font-medium">{managerName}</div>
                        {managerEmail && (
                          <div className="text-muted-foreground">
                            {managerEmail}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setManagerName("")
                          setManagerEmail("")
                          markDirty()
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(isLocked || !isInternalMode) && managerName && (
                <div className="mb-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <div className="font-medium">{managerName}</div>
                  {managerEmail && (
                    <div className="text-muted-foreground">{managerEmail}</div>
                  )}
                </div>
              )}

              <div style={{ minHeight: "52px" }} className="flex-1">
                {signatures.manager.signedAt ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <div className="font-medium">
                      {signatures.manager.signedByName ?? "Podepsáno"}
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
                        <Check className="size-3" /> Podepsat
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                        onClick={() => signHeaderSignatureBehalf("manager")}
                      >
                        <Check className="size-3" /> Podepsat v zastoupení
                      </Button>
                    </>
                  )}

                {!isLocked &&
                  signatures.manager.signedAt &&
                  (isAdmin ||
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            A. Vyrovnání závazků zaměstnance k zaměstnavateli
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0 sm:p-6">
          <div className="divide-y lg:hidden">
            {items.map((item) => {
              const isSigned = Boolean(item.signedAt)
              const signedAtDate = item.signedAt
                ? format(new Date(item.signedAt), "d.M.yyyy HH:mm")
                : ""
              const currentUserIsSigner =
                normalizeEmail(item.signedByEmail) ===
                currentUserEmailNormalized
              const isSigningDisabled = signingDisabledKeys.includes(item.key)
              const isLawInfoGreyed = item.key === "lawInfo" && lawInfoGreyed
              const showSignButton =
                !isLocked && !isSigned && !isSigningDisabled
              const showRevokeButton =
                !isLocked &&
                isSigned &&
                !isSigningDisabled &&
                !isLawInfoGreyed &&
                (isAdmin || currentUserIsSigner)

              return (
                <div
                  key={item.key}
                  className={`space-y-2 px-4 py-3 ${
                    isLawInfoGreyed ? "opacity-50" : ""
                  }`}
                >
                  <div className="text-xs">
                    {renderOrganization(
                      item.organization,
                      item.key === "handoverProtocol" ? managerName : null
                    )}
                  </div>

                  <div className="text-sm">{item.obligation}</div>

                  <div className="flex flex-col gap-2 pt-1 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                    {!isLocked && !isSigningDisabled ? (
                      <div className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-1 py-0.5 text-xs">
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 ${
                            item.resolved === "YES"
                              ? "bg-green-600 text-white"
                              : "hover:bg-green-100"
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
                              : "hover:bg-red-100"
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
                            onClick={() => signRow(item.key)}
                          >
                            <Check className="size-3" /> Podepsat
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 whitespace-nowrap px-2 text-xs text-muted-foreground"
                            onClick={() => signRowOnBehalf(item.key)}
                          >
                            <Check className="size-3" /> Podepsat
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

                  {isSigned && !isLawInfoGreyed && (
                    <div className="text-xs text-muted-foreground">
                      {item.signedByName} · {signedAtDate}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="hidden lg:block">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/5">Odbor / organizace</TableHead>
                  <TableHead className="w-[24%]">Závazek</TableHead>
                  <TableHead className="w-[8%] text-center">Vyrovnán</TableHead>
                  <TableHead className="w-[30%] pl-10">
                    Datum a podpis
                  </TableHead>
                  <TableHead className="w-[22%] pl-3 text-left">Akce</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {items.map((item) => {
                  const isSigned = Boolean(item.signedAt)
                  const signedAtDate = item.signedAt
                    ? format(new Date(item.signedAt), "d.M.yyyy HH:mm")
                    : ""
                  const currentUserIsSigner =
                    normalizeEmail(item.signedByEmail) ===
                    currentUserEmailNormalized
                  const isSigningDisabled = signingDisabledKeys.includes(
                    item.key
                  )
                  const isLawInfoGreyed =
                    item.key === "lawInfo" && lawInfoGreyed
                  const showSignButton =
                    !isLocked && !isSigned && !isSigningDisabled
                  const showRevokeButton =
                    !isLocked &&
                    isSigned &&
                    !isSigningDisabled &&
                    !isLawInfoGreyed &&
                    (isAdmin || currentUserIsSigner)

                  return (
                    <TableRow
                      key={item.key}
                      className={isLawInfoGreyed ? "opacity-50" : ""}
                      style={{ height: "92px" }}
                    >
                      <TableCell className="w-[18%] align-middle text-sm">
                        {renderOrganization(
                          item.organization,
                          item.key === "handoverProtocol" ? managerName : null
                        )}
                      </TableCell>
                      <TableCell className="w-[22%] whitespace-normal break-words align-middle text-sm leading-snug">
                        {item.obligation}
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        {!isLocked && !isSigningDisabled ? (
                          <div className="inline-flex items-center gap-1 rounded-md bg-muted px-1 py-0.5 text-xs">
                            <button
                              type="button"
                              className={`rounded px-2 py-0.5 ${
                                item.resolved === "YES"
                                  ? "bg-green-600 text-white"
                                  : "hover:bg-green-100"
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
                                  : "hover:bg-red-100"
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
                      </TableCell>
                      <TableCell className="w-[30%] pl-10 align-middle">
                        <TableSignatureCell
                          isSigned={isSigned}
                          isMuted={isLawInfoGreyed}
                          signedByName={item.signedByName}
                          signedAt={signedAtDate}
                        />
                      </TableCell>
                      <TableCell className="w-[22%] pl-3 align-middle">
                        <TableActionCell
                          showSignButton={showSignButton}
                          showRevokeButton={showRevokeButton}
                          onSign={() => signRow(item.key)}
                          onSignBehalf={() => signRowOnBehalf(item.key)}
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

      <Card>
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
                  {!isLocked && (
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
                    {!isLocked ? (
                      <Input
                        value={asset.subject}
                        onChange={(e) =>
                          updateAsset(asset.id, "subject", e.target.value)
                        }
                        placeholder="např. mobilní telefon"
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
                    {!isLocked ? (
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
                      {!isLocked ? (
                        <Input
                          value={asset.subject}
                          onChange={(e) =>
                            updateAsset(asset.id, "subject", e.target.value)
                          }
                          placeholder="např. mobilní telefon"
                        />
                      ) : (
                        <span>{asset.subject}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isLocked ? (
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
                        />
                      ) : (
                        <span>{asset.inventoryNumber}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isLocked && (
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

          {!isLocked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAssetRow}
            >
              Přidat položku
            </Button>
          )}

          <div className="border-t pt-4">
            <HeaderSignatureBlock
              label="Za Odbor služeb potvrzuje správnost Výpisu"
              value={signatures.issuer}
              isLocked={isLocked}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              onSign={() => signHeaderSignature("issuer")}
              onSignBehalf={() => signHeaderSignatureBehalf("issuer")}
              onRevoke={() => revokeHeaderSignature("issuer")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>C. Předávaná agenda</span>

            {!isLocked && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeHandover"
                  checked={includeHandoverAgenda}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked)
                    setIncludeHandoverAgenda(next)

                    if (!next) {
                      setHandoverOption1(false)
                      setHandoverOption2(false)
                      setHandoverOption2Target("")
                      setHandoverOption2TargetPositionNum("")
                      setHandoverOption3(false)
                      setHandoverOption3Reason("")
                      setResponsibleParty(null)
                      setHandoverRecipients([])
                    }

                    markDirty()
                  }}
                />
                <Label
                  htmlFor="includeHandover"
                  className="cursor-pointer text-sm font-normal text-muted-foreground"
                >
                  Zahrnout předávanou agendu
                </Label>
              </div>
            )}

            {isLocked && includeHandoverAgenda && (
              <Badge variant="secondary">Zahrnuto</Badge>
            )}
          </CardTitle>
        </CardHeader>

        {includeHandoverAgenda && (
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">
              Elektronické dokumenty v e-spisu — elektronické předání dokumentů
              proběhne/proběhlo následujícím způsobem:
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="handover1"
                  checked={handoverOption1}
                  onCheckedChange={(checked) => {
                    setHandoverOption1(Boolean(checked))
                    markDirty()
                  }}
                  disabled={isLocked}
                />
                <Label
                  htmlFor="handover1"
                  className={`text-sm ${
                    isLocked ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  Předáno zaměstnancem do spisovny v e-spise nebo předáno na
                  jiné funkční místo
                </Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="handover2"
                    checked={handoverOption2}
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked)
                      setHandoverOption2(next)

                      if (!next) {
                        setHandoverOption2Target("")
                        setHandoverOption2TargetPositionNum("")
                      }

                      markDirty()
                    }}
                    disabled={isLocked}
                  />
                  <Label
                    htmlFor="handover2"
                    className={`text-sm ${
                      isLocked ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    OI-KITT6 předá na jiné funkční místo
                  </Label>
                </div>

                {handoverOption2 && (
                  <div className="ml-7 space-y-2">
                    <Popover
                      open={positionPickerOpen}
                      onOpenChange={setPositionPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-between"
                          disabled={isLocked || loadingPositions}
                        >
                          <span className="truncate">
                            {selectedHandoverOption2PositionLabel ||
                              "Vyberte funkční místo ze systemizace"}
                          </span>
                          <ChevronDown className="ml-2 size-4 opacity-60" />
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Hledat číslo nebo název pozice..."
                            value={positionQuery}
                            onValueChange={setPositionQuery}
                          />

                          <CommandEmpty>
                            {loadingPositions
                              ? "Načítám pozice..."
                              : positionLoadError || "Žádná pozice nenalezena"}
                          </CommandEmpty>

                          <CommandList className="max-h-80 overflow-y-auto">
                            <CommandGroup>
                              {filteredPositions.map((position) => (
                                <CommandItem
                                  key={position.id ?? position.num}
                                  value={`${position.num} ${position.name}`}
                                  onSelect={() => {
                                    setHandoverOption2TargetPositionNum(
                                      position.num
                                    )
                                    setHandoverOption2Target(position.name)
                                    setPositionPickerOpen(false)
                                    setPositionQuery("")
                                    markDirty()
                                  }}
                                  className="flex items-start gap-3 py-3"
                                >
                                  <span className="min-w-[80px] rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                                    {position.num}
                                  </span>

                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                      {position.name}
                                    </div>

                                    <div className="truncate text-xs text-muted-foreground">
                                      {[position.dept_name, position.unit_name]
                                        .filter(Boolean)
                                        .join(" • ")}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

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
                    checked={handoverOption3}
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked)
                      setHandoverOption3(next)

                      if (!next) {
                        setHandoverOption3Reason("")
                        setResponsibleParty(null)
                        setHandoverRecipients([])
                        setNewRecipientName("")
                        setNewRecipientEmail("")
                        setNewRecipientPersonalNumber("")
                        setNewRecipientDepartment("")
                        setNewRecipientError(null)
                      }

                      markDirty()
                    }}
                    disabled={isLocked}
                  />
                  <Label
                    htmlFor="handover3"
                    className={`text-sm ${
                      isLocked ? "cursor-default" : "cursor-pointer"
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
                        markDirty()
                      }}
                      placeholder="např. do doby nástupu nového zaměstnance"
                      disabled={isLocked}
                    />

                    <div className="space-y-3 rounded-md border p-3">
                      <div>
                        <Label className="text-sm font-medium">
                          Za dokumenty odpovídá
                        </Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Vyberte odpovědnou osobu z EOS nebo ji doplňte ručně.
                          Pokud osoba není v EOS, vyplňte celé jméno a e-mail.
                          Uložení výstupního listu e-maily neposílá; informaci
                          odešlete ručně tlačítkem níže.
                        </p>
                      </div>

                      {!isLocked && (
                        <>
                          <PersonLookupCombobox
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
                                  name: buildEmployeeFullName(employee),
                                  email: employee.email ?? "",
                                  personalNumber: employee.personalNumber,
                                  department: employee.department,
                                },
                              ])

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
                                className="h-8 text-sm"
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
                                className="h-8 text-sm"
                              />

                              <Input
                                placeholder="Osobní číslo"
                                value={newRecipientPersonalNumber}
                                onChange={(e) => {
                                  setNewRecipientPersonalNumber(e.target.value)
                                  setNewRecipientError(null)
                                }}
                                className="h-8 text-sm"
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
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 shrink-0"
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

                              {!isLocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHandoverRecipients((prev) =>
                                      prev.filter((x) => x.id !== recipient.id)
                                    )
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
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-0.5">
                                <p className="font-medium">
                                  Informace se neodesílají automaticky při
                                  uložení.
                                </p>
                                <p>
                                  Osobu uvedenou v poli „Za dokumenty odpovídá“
                                  informujte co nejdříve.
                                </p>
                              </div>

                              <Button
                                type="button"
                                size="sm"
                                className="
                                  h-auto
                                  min-h-9
                                  w-full
                                  max-w-full
                                  justify-center
                                  gap-2
                                  whitespace-normal
                                  rounded-md
                                  bg-[#00847C]
                                  px-3
                                  py-2
                                  text-center
                                  text-sm
                                  font-medium
                                  leading-snug
                                  text-white
                                  hover:bg-[#0B6D73]
                                  disabled:bg-[#00847C]/50
                                  disabled:text-white/80
                                  sm:w-auto
                                  sm:whitespace-nowrap
                                "
                                onClick={openHandoverSendDialog}
                                disabled={
                                  sendingHandoverInfo || !canSendHandoverInfo
                                }
                              >
                                {sendingHandoverInfo ? (
                                  <>
                                    <Loader2 className="size-4 shrink-0 animate-spin" />
                                    <span className="min-w-0">Odesílám…</span>
                                  </>
                                ) : handoverRecipientsWereSent ? (
                                  <>
                                    <Send className="size-4 shrink-0" />
                                    <span className="min-w-0">
                                      Odeslat znovu
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="size-4 shrink-0" />
                                    <span className="min-w-0">
                                      Odeslat informace odpovědným osobám
                                    </span>
                                  </>
                                )}
                              </Button>
                            </div>

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
                                          <span className="font-medium">
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
                                Zasláno{" "}
                                {formatDateTime(handoverRecipientsSentAt)}{" "}
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

                            {!canSendHandoverInfo &&
                              validHandoverRecipients.length === 0 && (
                                <p className="mt-2 text-[11px] text-blue-700">
                                  Tlačítko se aktivuje po přidání alespoň jedné
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

            <div className="border-t pt-4">
              <div
                className="flex flex-col rounded-md border p-3"
                style={{ minHeight: "110px" }}
              >
                <Label className="mb-2 text-sm font-medium">
                  Způsob předání agendy potvrzuje — Vedoucí odboru
                  {managerName && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({managerName})
                    </span>
                  )}
                </Label>

                <div style={{ minHeight: "52px" }} className="flex-1">
                  {handoverManagerSignature.signedAt ? (
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <div className="font-medium">
                        {handoverManagerSignature.signedByName ?? "Podepsáno"}
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

                {!isLocked && (
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
                          >
                            <Check className="size-3" /> Podepsat
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-full justify-start gap-1 whitespace-nowrap text-xs text-muted-foreground"
                            onClick={() => signHandoverManagerSignature(true)}
                          >
                            <Check className="size-3" /> Podepsat v zastoupení
                          </Button>
                        </>
                      )}

                    {handoverManagerSignature.signedAt &&
                      (isAdmin ||
                        normalizeEmail(
                          handoverManagerSignature.signedByEmail
                        ) === currentUserEmailNormalized) && (
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
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {isLocked
              ? "Výstupní list je uzamčený. Lze vygenerovat PDF, odeslat PDF nebo jej odemknout pro úpravy."
              : isInternalMode
                ? "Po uzamčení formuláře již nepůjde běžným uživatelům měnit."
                : "Výstupní list můžete doplnit, podepsat a uložit pod svým přihlášeným účtem."}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canInvite && initialData.publicToken && (
              <SendAllDialog
                offboardingId={resolvedOffboardingId}
                employeeName={header.employeeName ?? ""}
                employeeEmail={header.employeeEmail ?? null}
                publicToken={initialData.publicToken}
                conflictOfInterest={conflictOfInterest}
                managerEmail={managerEmail || null}
                managerName={managerName || null}
              />
            )}

            {canInvite && (
              <>
                <SendInviteDialog
                  offboardingId={resolvedOffboardingId}
                  employeeName={header.employeeName ?? ""}
                />
                <SendInviteBehalfDialog
                  offboardingId={resolvedOffboardingId}
                  employeeName={header.employeeName ?? ""}
                  managerName={managerName || null}
                />
              </>
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
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSave(false)}
                  disabled={saving}
                >
                  {saving ? "Ukládám…" : "Uložit"}
                </Button>

                {canLock && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
                    onClick={() => void handleSave(true)}
                    disabled={saving}
                  >
                    Uzamknout
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={handoverSendDialogOpen}
        onOpenChange={(open) => {
          if (!sendingHandoverInfo) {
            setHandoverSendDialogOpen(open)
          }
        }}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-0">
          <div className="p-6 sm:px-8 sm:py-7">
            <AlertDialogHeader className="space-y-3 text-left">
              <AlertDialogTitle className="text-xl font-semibold">
                {handoverSendDialogMode === "resend"
                  ? "Odeslat informace znovu?"
                  : "Odeslat informace odpovědným osobám?"}
              </AlertDialogTitle>

              <AlertDialogDescription asChild>
                <div className="space-y-4 text-sm leading-6 text-muted-foreground">
                  {handoverSendDialogMode === "resend" ? (
                    <p>
                      Informace pro osoby uvedené v poli „Za dokumenty odpovídá“
                      už byly odeslány. Pokud je odešlete znovu, příjemci
                      dostanou nový e-mail.
                    </p>
                  ) : (
                    <p>
                      Osobám uvedeným v poli „Za dokumenty odpovídá“ bude
                      odeslán e-mail s informací, že u nich byla uvedena
                      odpovědnost za dokumenty/agendu uvedeného zaměstnance,
                      který ukončuje pracovní poměr. Tato akce se uloží hned,
                      nezávisle na uložení celého formuláře.
                    </p>
                  )}

                  {handoverRecipientsSentAt && (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs">
                      <p className="font-medium text-foreground">
                        Poslední odeslání
                      </p>
                      <p className="mt-1">
                        {format(
                          new Date(handoverRecipientsSentAt),
                          "d.M.yyyy HH:mm"
                        )}
                        {" · "}
                        {handoverRecipientsSentByName ??
                          handoverRecipientsSentByEmail ??
                          "neznámý uživatel"}
                      </p>
                    </div>
                  )}

                  <div className="rounded-md border bg-background p-3 text-xs">
                    <p className="mb-2 font-medium text-foreground">
                      Osoby uvedené v poli „Za dokumenty odpovídá“
                    </p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {validHandoverRecipients.map((recipient) => (
                        <li key={recipient.id} className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {recipient.name}
                          </span>
                          <span>{recipient.email}</span>
                          {recipient.department && (
                            <span className="text-muted-foreground/80">
                              {recipient.department}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
              <AlertDialogCancel
                disabled={sendingHandoverInfo}
                className="h-10 min-w-[120px]"
              >
                Zrušit
              </AlertDialogCancel>

              <Button
                type="button"
                className="h-10 min-w-[150px] bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={() =>
                  void handleSendHandoverRecipientInfo(
                    handoverSendDialogMode === "resend"
                  )
                }
                disabled={sendingHandoverInfo}
              >
                {sendingHandoverInfo ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Odesílám…
                  </>
                ) : handoverSendDialogMode === "resend" ? (
                  <>
                    <Send className="mr-2 size-4" />
                    Odeslat znovu
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" />
                    Odeslat
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  )
}
