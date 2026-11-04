"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ClipboardCopy,
  History as HistoryIcon,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Repeat,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"

import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"
import { buildBehalfOptions } from "@/lib/exit-checklist-behalf-options"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { EmployeeItem } from "@/components/common/employee-combobox"
import { EosPersonPickerDialog } from "@/components/common/eos-person-picker-dialog"
import {
  ManagerNotifyDialog,
  type ManagerNotifyPrompt,
} from "@/components/common/manager-notify-dialog"
import { UnsavedChangesDialog } from "@/components/common/unsaved-changes-dialog"
import { DocumentHistoryDialog } from "@/components/history/document-history-dialog"

type Recipient = {
  name: string
  email: string
  rowKeys?: string[]
  behalfLabel?: string
  invitedAt?: string
  revokedAt?: string
  substituteForKey?: string
  position?: string
  department?: string
}

const DEFAULT_SECTION_B_RESPONSIBLE = {
  name: "Ing. Martina Krýzová",
  position: "vedoucí Oddělení vnitřní správy",
  department: "Odbor služeb",
  email: "mkryzova@praha6.cz",
}

type ResponsiblePerson = {
  name: string
  position?: string
  department?: string
  email: string
}

type Props = {
  offboardingId: number
  employeeName: string
  employeeEmail?: string | null
  publicToken?: string | null
  conflictOfInterest: boolean | null
  managerEmail?: string | null
  managerName?: string | null
  managerPosition?: string | null
  managerDepartment?: string | null
  signedEmails?: string[]
  signedRowKeys?: string[]
  employeeSigned?: boolean
  managerHeaderSigned?: boolean
  sectionBSigned?: boolean
  sectionCSigned?: boolean
  isLocked?: boolean
  sectionBResponsible?: ResponsiblePerson | null
  sectionCResponsible?: ResponsiblePerson | null
  kitt6OptionContact?: ResponsiblePerson | null
  onManagerChange?: (value: ResponsiblePerson) => void
  onSectionBResponsibleChange?: (value: ResponsiblePerson) => void
  onSectionCResponsibleChange?: (value: ResponsiblePerson) => void
  onKitt6ContactChange?: (value: ResponsiblePerson) => void
  onConflictOfInterestChange?: (value: boolean) => void
}

function buildInitialRecipients(
  conflictOfInterest: boolean | null,
  employeeName: string,
  employeeEmail?: string | null,
  managerEmail?: string | null,
  managerName?: string | null,
  managerPosition?: string | null,
  managerDepartment?: string | null
): Recipient[] {
  const base: Recipient[] = []

  if (employeeEmail?.trim()) {
    base.push({
      name: employeeName || employeeEmail,
      email: employeeEmail.trim(),
    })
  }

  const signatories = EXIT_CHECKLIST_SIGNATORIES.filter(
    (s) => s.emails.length > 0
  ).flatMap((s) => {
    const parsed = parseSignatoryName(s.name)
    return s.emails.map((email) => ({
      name: parsed.name,
      email,
      rowKeys: s.rowKeys,
      ...(parsed.position ? { position: parsed.position } : {}),
      ...(parsed.department ? { department: parsed.department } : {}),
    }))
  })

  base.push(...signatories)

  if (managerEmail?.trim()) {
    const managerRecipient: Recipient = {
      name: managerName ?? "Vedoucí odboru",
      email: managerEmail.trim(),
      rowKeys: ["handoverProtocol"],
      ...(managerPosition?.trim() ? { position: managerPosition.trim() } : {}),
      ...(managerDepartment?.trim()
        ? { department: managerDepartment.trim() }
        : {}),
    }
    const idx = base.findIndex((r) => r.name === "Vedoucí odboru")
    if (idx >= 0) {
      base[idx] = managerRecipient
    } else {
      base.splice(1, 0, managerRecipient)
    }
  } else {
    const empIdx = base.findIndex(
      (r) => r.name === "Vedoucí odboru" && r.email === ""
    )
    if (empIdx >= 0) base.splice(empIdx, 1)
  }

  if (conflictOfInterest) {
    const parsedLaw = parseSignatoryName(LAW_SIGNATORY.name)
    LAW_SIGNATORY.emails.forEach((email) => {
      base.push({
        name: parsedLaw.name,
        email,
        ...(parsedLaw.position ? { position: parsedLaw.position } : {}),
        ...(parsedLaw.department ? { department: parsedLaw.department } : {}),
      })
    })
  }

  const seenEmails = new Set<string>()
  return base.filter((r) => {
    const key = r.email.trim().toLowerCase()
    if (!key || seenEmails.has(key)) return false
    seenEmails.add(key)
    return true
  })
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function parseSignatoryName(fullName: string): {
  name: string
  position?: string
  department?: string
} {
  const match = fullName.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  if (!match) return { name: fullName.trim() }
  const parts = match[2]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    name: match[1].trim(),
    position: parts[0] || undefined,
    department: parts[1] || undefined,
  }
}

function formatPositionDepartment(
  position?: string,
  department?: string
): string {
  return [position, department].filter(Boolean).join(" - ")
}

export function SignatureRecipientsDialog({
  offboardingId,
  employeeName,
  employeeEmail,
  publicToken,
  conflictOfInterest,
  managerEmail,
  managerName,
  managerPosition,
  managerDepartment,
  signedEmails,
  signedRowKeys,
  employeeSigned = false,
  managerHeaderSigned = false,
  sectionBSigned = false,
  sectionCSigned = false,
  isLocked = false,
  sectionBResponsible,
  sectionCResponsible,
  kitt6OptionContact,
  onManagerChange,
  onSectionBResponsibleChange,
  onSectionCResponsibleChange,
  onKitt6ContactChange,
  onConflictOfInterestChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [sectionBPickerOpen, setSectionBPickerOpen] = useState(false)
  const [sectionCPickerOpen, setSectionCPickerOpen] = useState(false)
  const [managerContactPickerOpen, setManagerContactPickerOpen] =
    useState(false)
  const [kitt6PickerOpen, setKitt6PickerOpen] = useState(false)
  const [managerCardEditing, setManagerCardEditing] = useState(false)
  const [sectionBCardEditing, setSectionBCardEditing] = useState(false)
  const [sectionCCardEditing, setSectionCCardEditing] = useState(false)
  const [kitt6CardEditing, setKitt6CardEditing] = useState(false)
  const [employeeCardEditing, setEmployeeCardEditing] = useState(false)
  const [respEmployeeEmail, setRespEmployeeEmail] = useState("")
  const [respManagerName, setRespManagerName] = useState("")
  const [respManagerPosition, setRespManagerPosition] = useState("")
  const [respManagerDepartment, setRespManagerDepartment] = useState("")
  const [respManagerEmail, setRespManagerEmail] = useState("")
  const [respSectionBName, setRespSectionBName] = useState("")
  const [respSectionBPosition, setRespSectionBPosition] = useState("")
  const [respSectionBDepartment, setRespSectionBDepartment] = useState("")
  const [respSectionBEmail, setRespSectionBEmail] = useState("")
  const [respSectionCName, setRespSectionCName] = useState("")
  const [respSectionCPosition, setRespSectionCPosition] = useState("")
  const [respSectionCDepartment, setRespSectionCDepartment] = useState("")
  const [respSectionCEmail, setRespSectionCEmail] = useState("")
  const [respKitt6Name, setRespKitt6Name] = useState("")
  const [respKitt6Position, setRespKitt6Position] = useState("")
  const [respKitt6Department, setRespKitt6Department] = useState("")
  const [respKitt6Email, setRespKitt6Email] = useState("")
  const [respError, setRespError] = useState<string | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState<
    "none" | "manual" | "unconfirmed" | "all"
  >("none")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [infoTone, setInfoTone] = useState<"success" | "warning">("success")

  useEffect(() => {
    if (!info) return
    const timeout = setTimeout(() => setInfo(null), 6000)
    return () => clearTimeout(timeout)
  }, [info])
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [signedRemovalConfirm, setSignedRemovalConfirm] = useState<
    Recipient[] | null
  >(null)
  const [pendingSaveConfirm, setPendingSaveConfirm] = useState(false)
  const [substituteRemovalConfirm, setSubstituteRemovalConfirm] = useState<{
    original: Recipient
    substitute: Recipient
  } | null>(null)
  const [lastSentByName, setLastSentByName] = useState<string | null>(null)
  const [hasExistingList, setHasExistingList] = useState(false)

  const [resendingAll, setResendingAll] = useState(false)
  const [resendAllConfirmOpen, setResendAllConfirmOpen] = useState(false)
  const [managerNotifyPrompt, setManagerNotifyPrompt] =
    useState<ManagerNotifyPrompt>(null)
  const [confirmDefaultTarget, setConfirmDefaultTarget] = useState<{
    row: AgendaRow
    contact: {
      name: string
      email: string
      position?: string
      department?: string
    }
  } | null>(null)

  const [sending, setSending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [sendErrors, setSendErrors] = useState<Map<string, string>>(new Map())

  const [copied, setCopied] = useState(false)

  const [substituteTarget, setSubstituteTarget] = useState<Recipient | null>(
    null
  )
  const [substituteName, setSubstituteName] = useState("")
  const [substituteEmail, setSubstituteEmail] = useState("")
  const [substitutePosition, setSubstitutePosition] = useState<
    string | undefined
  >()
  const [substituteDepartment, setSubstituteDepartment] = useState<
    string | undefined
  >()
  const [substitutePickerOpen, setSubstitutePickerOpen] = useState(false)
  const [substituteError, setSubstituteError] = useState<string | null>(null)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editError, setEditError] = useState<string | null>(null)

  const [replaceTarget, setReplaceTarget] = useState<Recipient | null>(null)
  const [replaceName, setReplaceName] = useState("")
  const [replaceEmail, setReplaceEmail] = useState("")
  const [replacePosition, setReplacePosition] = useState<string | undefined>()
  const [replaceDepartment, setReplaceDepartment] = useState<
    string | undefined
  >()
  const [replacePickerOpen, setReplacePickerOpen] = useState(false)
  const [replaceError, setReplaceError] = useState<string | null>(null)

  const [addPersonRowKey, setAddPersonRowKey] = useState<string | null>(null)
  const [addPersonRowKeys, setAddPersonRowKeys] = useState<string[]>([])
  const [addPersonName, setAddPersonName] = useState("")
  const [addPersonEmail, setAddPersonEmail] = useState("")
  const [addPersonPickerOpen, setAddPersonPickerOpen] = useState(false)
  const [addPersonError, setAddPersonError] = useState<string | null>(null)

  const [localConflictOfInterest, setLocalConflictOfInterest] =
    useState(conflictOfInterest)
  const [draftConflictOfInterest, setDraftConflictOfInterest] =
    useState(conflictOfInterest)

  const behalfOptions = useMemo(
    () => buildBehalfOptions(managerName),
    [managerName]
  )

  function findAgendaLabelForRowKeys(rowKeys?: string[]): string | null {
    if (!rowKeys || rowKeys.length === 0) return null
    const match = behalfOptions.find((option) =>
      option.rowKeys.some((key) => rowKeys.includes(key))
    )
    return match?.departmentLabel ?? null
  }

  const signUrl =
    publicToken && typeof window !== "undefined"
      ? `${window.location.origin}/odchody-public/${publicToken}`
      : publicToken
        ? `/odchody-public/${publicToken}`
        : null

  const activeRecipients = recipients.filter((r) => !r.revokedAt)

  const allRecipientsSelected =
    activeRecipients.length > 0 &&
    activeRecipients.every((r) => selectedKeys.has(recipientIdentityKey(r)))

  const substitutesByOriginalKey = new Map<string, Recipient>()
  activeRecipients.forEach((r) => {
    if (r.substituteForKey) substitutesByOriginalKey.set(r.substituteForKey, r)
  })

  const toInviteNew = activeRecipients.filter(
    (r) => selectedKeys.has(recipientIdentityKey(r)) && !r.invitedAt
  )
  const toRevoke = activeRecipients.filter(
    (r) => !selectedKeys.has(recipientIdentityKey(r)) && r.invitedAt
  )
  const pendingNewInvites = toInviteNew.length
  const pendingRemovals = toRevoke.length

  function normalizeCompare(value?: string | null): string {
    return (value ?? "").trim().toLowerCase()
  }

  const coiDirty = draftConflictOfInterest !== localConflictOfInterest

  const lawSignatoryEmail = (LAW_SIGNATORY.emails[0] ?? "").toLowerCase()
  const lawSignatoryRecipient = recipients.find(
    (r) => !r.behalfLabel && r.email.trim().toLowerCase() === lawSignatoryEmail
  )
  const lawSignatoryWasInvited = Boolean(
    lawSignatoryRecipient?.invitedAt && !lawSignatoryRecipient?.revokedAt
  )
  const coiChangeSendsEmail =
    coiDirty && (draftConflictOfInterest ? true : lawSignatoryWasInvited)
  const willSendAnyEmail = toInviteNew.length > 0 || coiChangeSendsEmail

  const employeeCardDirty =
    normalizeCompare(respEmployeeEmail) !== normalizeCompare(employeeEmail)

  const managerCardDirty =
    normalizeCompare(respManagerName) !== normalizeCompare(managerName) ||
    normalizeCompare(respManagerPosition) !==
      normalizeCompare(managerPosition) ||
    normalizeCompare(respManagerDepartment) !==
      normalizeCompare(managerDepartment) ||
    normalizeCompare(respManagerEmail) !== normalizeCompare(managerEmail)

  const sectionBCardDirty =
    normalizeCompare(respSectionBName) !==
      normalizeCompare(sectionBResponsible?.name) ||
    normalizeCompare(respSectionBPosition) !==
      normalizeCompare(sectionBResponsible?.position) ||
    normalizeCompare(respSectionBDepartment) !==
      normalizeCompare(sectionBResponsible?.department) ||
    normalizeCompare(respSectionBEmail) !==
      normalizeCompare(sectionBResponsible?.email)

  const sectionCCardDirty =
    normalizeCompare(respSectionCName) !==
      normalizeCompare(sectionCResponsible?.name) ||
    normalizeCompare(respSectionCPosition) !==
      normalizeCompare(sectionCResponsible?.position) ||
    normalizeCompare(respSectionCDepartment) !==
      normalizeCompare(sectionCResponsible?.department) ||
    normalizeCompare(respSectionCEmail) !==
      normalizeCompare(sectionCResponsible?.email)

  const kitt6CardDirty =
    normalizeCompare(respKitt6Name) !==
      normalizeCompare(kitt6OptionContact?.name) ||
    normalizeCompare(respKitt6Position) !==
      normalizeCompare(kitt6OptionContact?.position) ||
    normalizeCompare(respKitt6Department) !==
      normalizeCompare(kitt6OptionContact?.department) ||
    normalizeCompare(respKitt6Email) !==
      normalizeCompare(kitt6OptionContact?.email)

  const contactsDirty =
    employeeCardDirty ||
    managerCardDirty ||
    sectionBCardDirty ||
    sectionCCardDirty ||
    kitt6CardDirty

  const hasUnsavedDialogChanges =
    toInviteNew.length > 0 || toRevoke.length > 0 || coiDirty || contactsDirty

  const selectionVisible = selectionMode !== "none" || hasUnsavedDialogChanges

  useUnsavedChangesGuard(open && hasUnsavedDialogChanges)

  const signedEmailSet = useMemo(
    () => new Set((signedEmails ?? []).map((e) => e.trim().toLowerCase())),
    [signedEmails]
  )
  const signedRowKeysSet = useMemo(
    () => new Set(signedRowKeys ?? []),
    [signedRowKeys]
  )

  function isRowFullySigned(rowKeys?: string[]): boolean {
    if (!rowKeys || rowKeys.length === 0) return false
    return rowKeys.every((k) => signedRowKeysSet.has(k))
  }

  const removalLocked = isLocked
  const removalLockedReason =
    "Výstupní list je uzamčený – osoby k podpisu nelze odebrat."

  async function loadRecipients() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/odchody/${offboardingId}/exit-checklist`, {
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      const data = json?.data as
        | {
            signatureRecipients?: Recipient[]
            signatureRecipientsSentAt?: string | null
            signatureRecipientsSentByName?: string | null
          }
        | undefined

      const existing = Array.isArray(data?.signatureRecipients)
        ? data.signatureRecipients
        : []

      if (existing.length > 0) {
        const employeeKey = employeeEmail?.trim().toLowerCase()
        const hasEmployee = employeeKey
          ? existing.some((r) => r.email.trim().toLowerCase() === employeeKey)
          : true

        const merged =
          !hasEmployee && employeeKey
            ? [
                {
                  name: employeeName || employeeEmail || "",
                  email: employeeKey,
                },
                ...existing,
              ]
            : existing

        const managerEmailNormalized = managerEmail?.trim().toLowerCase()
        const mergedWithManagerInfo = managerEmailNormalized
          ? merged.map((r) =>
              !r.behalfLabel &&
              r.email.trim().toLowerCase() === managerEmailNormalized &&
              (!r.position || !r.department)
                ? {
                    ...r,
                    position:
                      r.position || managerPosition?.trim() || undefined,
                    department:
                      r.department || managerDepartment?.trim() || undefined,
                  }
                : r
            )
          : merged

        setRecipients(mergedWithManagerInfo)
        setSelectedKeys(
          new Set(
            mergedWithManagerInfo
              .filter((r) => !r.revokedAt)
              .map((r) => recipientIdentityKey(r))
          )
        )
        setHasExistingList(true)
        setLastSentAt(data?.signatureRecipientsSentAt ?? null)
        setLastSentByName(data?.signatureRecipientsSentByName ?? null)
        void enrichMissingPositions()
      } else {
        const fallback = buildInitialRecipients(
          localConflictOfInterest,
          employeeName,
          employeeEmail,
          managerEmail,
          managerName,
          managerPosition,
          managerDepartment
        )
        setRecipients(fallback)
        setSelectedKeys(new Set(fallback.map((r) => recipientIdentityKey(r))))
        setHasExistingList(false)
        setLastSentAt(null)
        setLastSentByName(null)
        void enrichMissingPositions()
      }
    } catch {
      setError("Nepodařilo se načíst seznam příjemců.")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && hasUnsavedDialogChanges) {
      setCloseConfirmOpen(true)
      return
    }

    setOpen(next)
    if (next) {
      setInfo(null)
      setError(null)
      setSaveError(null)
      setSendErrors(new Map())
      setCopied(false)
      setSubstituteTarget(null)
      setSubstituteName("")
      setSubstituteEmail("")
      setSubstituteError(null)
      setEditingKey(null)
      setEditError(null)
      setLocalConflictOfInterest(conflictOfInterest)
      setDraftConflictOfInterest(conflictOfInterest)
      setManagerCardEditing(false)
      setSectionBCardEditing(false)
      setSectionCCardEditing(false)
      setKitt6CardEditing(false)
      setEmployeeCardEditing(false)
      setRespEmployeeEmail(employeeEmail ?? "")
      setRespManagerName(managerName ?? "")
      setRespManagerPosition(managerPosition ?? "")
      setRespManagerDepartment(managerDepartment ?? "")
      setRespManagerEmail(managerEmail ?? "")
      setRespSectionBName(sectionBResponsible?.name ?? "")
      setRespSectionBPosition(sectionBResponsible?.position ?? "")
      setRespSectionBDepartment(sectionBResponsible?.department ?? "")
      setRespSectionBEmail(sectionBResponsible?.email ?? "")
      setRespSectionCName(sectionCResponsible?.name ?? managerName ?? "")
      setRespSectionCPosition(
        sectionCResponsible?.position ?? managerPosition ?? ""
      )
      setRespSectionCDepartment(
        sectionCResponsible?.department ?? managerDepartment ?? ""
      )
      setRespSectionCEmail(sectionCResponsible?.email ?? managerEmail ?? "")
      setRespKitt6Name(kitt6OptionContact?.name ?? "")
      setRespKitt6Position(kitt6OptionContact?.position ?? "")
      setRespKitt6Department(kitt6OptionContact?.department ?? "")
      setRespKitt6Email(kitt6OptionContact?.email ?? "")
      setRespError(null)
      void loadRecipients()
    }
  }

  async function persistResponsibleContacts(): Promise<void> {
    const employeeEmailValue = respEmployeeEmail.trim().toLowerCase()
    const managerEmailValue = respManagerEmail.trim().toLowerCase()
    const sectionBEmail = respSectionBEmail.trim().toLowerCase()
    const sectionCEmail = respSectionCEmail.trim().toLowerCase()
    const kitt6Email = respKitt6Email.trim().toLowerCase()

    if (
      !employeeEmailValue ||
      !managerEmailValue ||
      !sectionBEmail ||
      !sectionCEmail ||
      !kitt6Email
    ) {
      throw new Error(
        "E-mail zaměstnance, vedoucího odboru, odpovědné osoby za sekci B, za sekci C i kontakt KITT6 jsou povinné."
      )
    }

    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/responsible-contacts`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeEmail: employeeEmailValue,
          managerEmail: managerEmailValue,
          managerName: respManagerName.trim(),
          managerPosition: respManagerPosition.trim(),
          managerDepartment: respManagerDepartment.trim(),
          sectionBResponsible: {
            name: respSectionBName.trim(),
            position: respSectionBPosition.trim(),
            department: respSectionBDepartment.trim(),
            email: sectionBEmail,
          },
          sectionCResponsible: {
            name: respSectionCName.trim(),
            position: respSectionCPosition.trim(),
            department: respSectionCDepartment.trim(),
            email: sectionCEmail,
          },
          kitt6OptionContact: {
            name: respKitt6Name.trim(),
            position: respKitt6Position.trim(),
            department: respKitt6Department.trim(),
            email: kitt6Email,
          },
        }),
      }
    )

    const json = await res.json().catch(() => null)

    if (!res.ok) {
      throw new Error(json?.message ?? "Odpovědné osoby se nepodařilo uložit.")
    }

    if (json?.managerNotifyPrompt) {
      setManagerNotifyPrompt(json.managerNotifyPrompt)
    }

    onManagerChange?.({
      name: respManagerName.trim(),
      position: respManagerPosition.trim(),
      department: respManagerDepartment.trim(),
      email: managerEmailValue,
    })
    onSectionBResponsibleChange?.({
      name: respSectionBName.trim(),
      position: respSectionBPosition.trim(),
      department: respSectionBDepartment.trim(),
      email: sectionBEmail,
    })
    onSectionCResponsibleChange?.({
      name: respSectionCName.trim(),
      position: respSectionCPosition.trim(),
      department: respSectionCDepartment.trim(),
      email: sectionCEmail,
    })
    onKitt6ContactChange?.({
      name: respKitt6Name.trim(),
      position: respKitt6Position.trim(),
      department: respKitt6Department.trim(),
      email: kitt6Email,
    })
    setEmployeeCardEditing(false)
    setManagerCardEditing(false)
    setSectionBCardEditing(false)
    setSectionCCardEditing(false)
    setKitt6CardEditing(false)
  }

  function discardAndClose() {
    setCloseConfirmOpen(false)
    setOpen(false)
  }

  async function enrichMissingPositions() {
    try {
      const employees = await fetchEmployeeDirectory()
      const byEmail = new Map(
        employees.map((employee) => [
          employee.email?.trim().toLowerCase(),
          employee,
        ])
      )
      const employeesByCoreName = employees
        .map((employee) => ({
          employee,
          coreName: foldText(
            `${employee.name ?? ""} ${employee.surname ?? ""}`
          ),
          coreNameTokens: foldText(
            `${employee.name ?? ""} ${employee.surname ?? ""}`
          )
            .split(" ")
            .filter(Boolean),
        }))
        .filter((entry) => entry.coreName)

      setRecipients((prev) =>
        prev.map((r) => {
          if (r.position && r.department) return r

          const foldedRecipientName = foldText(r.name)
          const nameMatch = foldedRecipientName
            ? (
                employeesByCoreName.find((entry) =>
                  foldedRecipientName.includes(entry.coreName)
                ) ??
                employeesByCoreName.find(
                  (entry) =>
                    entry.coreNameTokens.length > 0 &&
                    entry.coreNameTokens.every((token) =>
                      foldedRecipientName.includes(token)
                    )
                )
              )?.employee
            : undefined

          const match = nameMatch ?? byEmail.get(r.email.trim().toLowerCase())
          if (!match) return r

          return {
            ...r,
            position: r.position || match.positionName || undefined,
            department: r.department || match.department || undefined,
          }
        })
      )
    } catch {}
  }

  async function fetchEmployeeDirectory(): Promise<EmployeeItem[]> {
    const res = await fetch(
      `/api/zamestnanci/hledat?listAll=true&limit=1000&excludeActiveOffboardings=false`,
      {
        credentials: "include",
      }
    )
    const json = (await res.json().catch(() => null)) as {
      data?: EmployeeItem[]
    } | null
    return json?.data ?? []
  }

  async function lookupEmployeeByEmail(email: string): Promise<{
    name: string
    position?: string
    department?: string
  } | null> {
    try {
      const employees = await fetchEmployeeDirectory()
      const match = employees.find(
        (candidate) => candidate.email?.trim().toLowerCase() === email
      )
      if (!match) return null

      return {
        name: joinNameWithTitles({
          titleBefore: match.titleBefore,
          name: match.name,
          surname: match.surname,
          titleAfter: match.titleAfter,
        }),
        position: match.positionName || undefined,
        department: match.department || undefined,
      }
    } catch {
      return null
    }
  }

  function syncResponsibleRoleIntoRecipients(args: {
    roleLabel: string
    previousEmail: string
    nextName: string
    nextEmail: string
    nextPosition: string
    nextDepartment: string
    fallbackRowKeys: string[]
  }) {
    const email = args.nextEmail.trim().toLowerCase()
    const previousEmail = args.previousEmail.trim().toLowerCase()

    if (!email || email === previousEmail) return

    const previousEntry = previousEmail
      ? recipients.find(
          (r) =>
            !r.revokedAt &&
            !r.behalfLabel &&
            r.email.trim().toLowerCase() === previousEmail
        )
      : undefined

    const alreadyActive = recipients.some(
      (r) =>
        !r.revokedAt && !r.behalfLabel && r.email.trim().toLowerCase() === email
    )

    if (previousEntry?.invitedAt) {
      // Role byla už dřív potvrzena a odeslána – jde o přímou výměnu osoby:
      // starý držitel role (pokud nemá jinou agendu) ztratí přístup po uložení,
      // nový dostane pozvánku.
      const previousKey = recipientIdentityKey(previousEntry)
      const hasOtherRole = (previousEntry.rowKeys ?? []).length > 0

      if (!alreadyActive) {
        const newRecipient: Recipient = {
          name: args.nextName.trim() || email,
          email,
          ...(args.nextPosition.trim()
            ? { position: args.nextPosition.trim() }
            : {}),
          ...(args.nextDepartment.trim()
            ? { department: args.nextDepartment.trim() }
            : {}),
          ...(args.fallbackRowKeys.length
            ? { rowKeys: args.fallbackRowKeys }
            : {}),
        }
        setRecipients((prev) => [...prev, newRecipient])
        setSelectedKeys((prev) => {
          const next = new Set(prev)
          if (!hasOtherRole) next.delete(previousKey)
          next.add(recipientIdentityKey(newRecipient))
          return next
        })
      } else if (!hasOtherRole) {
        setSelectedKeys((prev) => {
          const next = new Set(prev)
          next.delete(previousKey)
          return next
        })
      }

      setInfoTone("warning")
      setInfo(
        hasOtherRole
          ? `${args.nextName.trim() || email} byl/a přidán/a jako ${args.roleLabel} – ${previousEntry.name} má v seznamu i jinou agendu, proto zůstává (po potvrzení tlačítkem dole).`
          : `Výměna osoby za roli „${args.roleLabel}“: ${args.nextName.trim() || email} – po potvrzení tlačítkem dole ztratí ${previousEntry.name} přístup (a případné podpisy se zruší) a nová osoba dostane pozvánku.`
      )
      return
    }

    if (alreadyActive) {
      if (args.fallbackRowKeys.length > 0) {
        setRecipients((prev) =>
          prev.map((r) =>
            !r.revokedAt &&
            !r.behalfLabel &&
            r.email.trim().toLowerCase() === email
              ? {
                  ...r,
                  rowKeys: Array.from(
                    new Set([...(r.rowKeys ?? []), ...args.fallbackRowKeys])
                  ),
                }
              : r
          )
        )
        setInfoTone("success")
        setInfo(
          `${args.nextName.trim() || email} je v seznamu i jinde – agenda role „${args.roleLabel}“ byla doplněna k jeho/její stávající agendě.`
        )
      }
      return
    }

    if (previousEntry && !previousEntry.invitedAt) {
      // Role ještě nebyla nikdy odeslána – jde jen o úpravu rozpracovaného návrhu.
      const previousKey = recipientIdentityKey(previousEntry)
      const updated: Recipient = {
        ...previousEntry,
        name: args.nextName.trim() || email,
        email,
        position: args.nextPosition.trim() || undefined,
        department: args.nextDepartment.trim() || undefined,
      }
      setRecipients((prev) =>
        prev.map((r) => (recipientIdentityKey(r) === previousKey ? updated : r))
      )
      setSelectedKeys((prev) => {
        if (!prev.has(previousKey)) return prev
        const next = new Set(prev)
        next.delete(previousKey)
        next.add(recipientIdentityKey(updated))
        return next
      })
      setInfoTone("success")
      setInfo(
        `Aktualizace v návrhu seznamu: ${updated.name} jako ${args.roleLabel}.`
      )
      return
    }

    const newRecipient: Recipient = {
      name: args.nextName.trim() || email,
      email,
      ...(args.nextPosition.trim()
        ? { position: args.nextPosition.trim() }
        : {}),
      ...(args.nextDepartment.trim()
        ? { department: args.nextDepartment.trim() }
        : {}),
      ...(args.fallbackRowKeys.length ? { rowKeys: args.fallbackRowKeys } : {}),
    }
    setRecipients((prev) => [...prev, newRecipient])
    setSelectedKeys((prev) =>
      new Set(prev).add(recipientIdentityKey(newRecipient))
    )
    setInfoTone("success")
    setInfo(
      `Přidání do návrhu seznamu: ${newRecipient.name} jako ${args.roleLabel}.`
    )
  }

  function syncSectionBResponsibleIntoRecipients(
    nextName: string,
    nextEmail: string,
    nextPosition: string,
    nextDepartment: string
  ) {
    syncResponsibleRoleIntoRecipients({
      roleLabel: "odpovědná osoba za sekci B",
      previousEmail: sectionBResponsible?.email ?? "",
      nextName,
      nextEmail,
      nextPosition,
      nextDepartment,
      fallbackRowKeys: [],
    })
  }

  function syncManagerIntoRecipients(
    nextName: string,
    nextEmail: string,
    nextPosition: string,
    nextDepartment: string
  ) {
    syncResponsibleRoleIntoRecipients({
      roleLabel: "vedoucí odboru",
      previousEmail: managerEmail ?? "",
      nextName,
      nextEmail,
      nextPosition,
      nextDepartment,
      fallbackRowKeys: ["handoverProtocol"],
    })
  }

  function syncEmployeeIntoRecipients(nextEmail: string) {
    syncResponsibleRoleIntoRecipients({
      roleLabel: "zaměstnanec (odcházející)",
      previousEmail: employeeEmail ?? "",
      nextName: employeeName,
      nextEmail,
      nextPosition: "",
      nextDepartment: "",
      fallbackRowKeys: [],
    })
  }

  function toggleEmployeeCardEditing() {
    if (employeeCardEditing) {
      syncEmployeeIntoRecipients(respEmployeeEmail)
    }
    setEmployeeCardEditing((prev) => !prev)
  }

  function toggleSectionBCardEditing() {
    if (sectionBCardEditing) {
      syncSectionBResponsibleIntoRecipients(
        respSectionBName,
        respSectionBEmail,
        respSectionBPosition,
        respSectionBDepartment
      )
    }
    setSectionBCardEditing((prev) => !prev)
  }

  function toggleManagerCardEditing() {
    if (managerCardEditing) {
      syncManagerIntoRecipients(
        respManagerName,
        respManagerEmail,
        respManagerPosition,
        respManagerDepartment
      )
    }
    setManagerCardEditing((prev) => !prev)
  }

  function handleSectionBPersonSelected(employee: EmployeeItem) {
    const name = joinNameWithTitles({
      titleBefore: employee.titleBefore,
      name: employee.name,
      surname: employee.surname,
      titleAfter: employee.titleAfter,
    })
    const email = employee.email ?? ""
    const position = employee.positionName || ""
    const department = employee.department || ""

    setRespSectionBName(name)
    setRespSectionBEmail(email)
    setRespSectionBPosition(position)
    setRespSectionBDepartment(department)
    syncSectionBResponsibleIntoRecipients(name, email, position, department)
  }

  function syncSectionCResponsibleIntoRecipients(
    nextName: string,
    nextEmail: string,
    nextPosition: string,
    nextDepartment: string
  ) {
    syncResponsibleRoleIntoRecipients({
      roleLabel: "odpovědná osoba za sekci C",
      previousEmail: sectionCResponsible?.email ?? "",
      nextName,
      nextEmail,
      nextPosition,
      nextDepartment,
      fallbackRowKeys: [],
    })
  }

  function toggleSectionCCardEditing() {
    if (sectionCCardEditing) {
      syncSectionCResponsibleIntoRecipients(
        respSectionCName,
        respSectionCEmail,
        respSectionCPosition,
        respSectionCDepartment
      )
    }
    setSectionCCardEditing((prev) => !prev)
  }

  function handleSectionCPersonSelected(employee: EmployeeItem) {
    const name = joinNameWithTitles({
      titleBefore: employee.titleBefore,
      name: employee.name,
      surname: employee.surname,
      titleAfter: employee.titleAfter,
    })
    const email = employee.email ?? ""
    const position = employee.positionName || ""
    const department = employee.department || ""

    setRespSectionCName(name)
    setRespSectionCEmail(email)
    setRespSectionCPosition(position)
    setRespSectionCDepartment(department)
    syncSectionCResponsibleIntoRecipients(name, email, position, department)
  }

  function handleManagerContactPersonSelected(employee: EmployeeItem) {
    setRespManagerName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setRespManagerEmail(employee.email ?? "")
    setRespManagerPosition(employee.positionName || "")
    setRespManagerDepartment(employee.department || "")
  }

  function handleKitt6PersonSelected(employee: EmployeeItem) {
    setRespKitt6Name(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setRespKitt6Email(employee.email ?? "")
    setRespKitt6Position(employee.positionName || "")
    setRespKitt6Department(employee.department || "")
  }

  function handleSubstitutePersonSelected(employee: EmployeeItem) {
    setSubstituteName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setSubstituteEmail(employee.email ?? "")
    setSubstitutePosition(employee.positionName || undefined)
    setSubstituteDepartment(employee.department || undefined)
    setSubstituteError(null)
  }

  function finishRemoval(person: Recipient) {
    if (person.invitedAt) {
      const key = recipientIdentityKey(person)
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    } else {
      removePendingRecipient(person)
    }
  }

  function confirmKeepSubstitute() {
    if (!substituteRemovalConfirm) return
    const { original } = substituteRemovalConfirm
    setSubstituteRemovalConfirm(null)
    finishRemoval(original)
  }

  function confirmRemoveSubstituteToo() {
    if (!substituteRemovalConfirm) return
    const { original, substitute } = substituteRemovalConfirm
    setSubstituteRemovalConfirm(null)
    finishRemoval(original)
    finishRemoval(substitute)
  }

  function requestRemovePending(target: Recipient) {
    const key = recipientIdentityKey(target)
    const linkedSubstitute = substitutesByOriginalKey.get(key)
    if (linkedSubstitute) {
      setSubstituteRemovalConfirm({
        original: target,
        substitute: linkedSubstitute,
      })
      return
    }
    removePendingRecipient(target)
  }

  function isLawSignatoryRecipient(r: Recipient): boolean {
    const lawEmail = (LAW_SIGNATORY.emails[0] ?? "").toLowerCase()
    return !r.behalfLabel && r.email.trim().toLowerCase() === lawEmail
  }

  function toggleSelected(key: string) {
    if (removalLocked) {
      const target = activeRecipients.find(
        (r) => recipientIdentityKey(r) === key
      )
      if (target?.invitedAt && selectedKeys.has(key)) return
    }

    const target = activeRecipients.find((r) => recipientIdentityKey(r) === key)
    if (target?.invitedAt && selectedKeys.has(key)) {
      const linkedSubstitute = substitutesByOriginalKey.get(key)
      if (linkedSubstitute) {
        setSubstituteRemovalConfirm({
          original: target,
          substitute: linkedSubstitute,
        })
        return
      }
    }

    const wasSelected = selectedKeys.has(key)

    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

    if (target && isLawSignatoryRecipient(target)) {
      setDraftConflictOfInterest(!wasSelected)
    }
  }

  function toggleSelectionMode(mode: "manual" | "unconfirmed" | "all") {
    const isAlreadyOn =
      selectionMode === mode || (mode === "all" && allRecipientsSelected)

    if (isAlreadyOn) {
      setSelectionMode("none")
      setSelectedKeys(new Set())
      return
    }
    setSelectionMode(mode)
    if (mode === "unconfirmed") selectAllUnconfirmed()
    else if (mode === "all") selectAllIncludingConfirmed()
  }

  function selectAllUnconfirmed() {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      activeRecipients.forEach((r) => {
        if (!r.invitedAt) next.add(recipientIdentityKey(r))
      })
      return next
    })
  }

  function selectAllIncludingConfirmed() {
    setSelectedKeys(
      new Set(activeRecipients.map((r) => recipientIdentityKey(r)))
    )
  }

  function removePendingRecipient(target: Recipient) {
    const targetKey = recipientIdentityKey(target)
    setRecipients((prev) =>
      prev.filter((r) => recipientIdentityKey(r) !== targetKey)
    )
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.delete(targetKey)
      return next
    })
    if (isLawSignatoryRecipient(target)) {
      setDraftConflictOfInterest(false)
    }
  }

  function startEdit(target: Recipient) {
    setEditingKey(recipientIdentityKey(target))
    setEditName(target.name)
    setEditEmail(target.email)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditError(null)
  }

  function confirmEdit(target: Recipient) {
    const email = editEmail.trim().toLowerCase()
    const name = editName.trim()

    if (!email) {
      setEditError("E-mail je povinný.")
      return
    }
    if (!isValidEmail(email)) {
      setEditError("Zadejte platný e-mail.")
      return
    }

    const targetKey = recipientIdentityKey(target)
    const candidateKey = recipientIdentityKey({
      email,
      behalfLabel: target.behalfLabel,
    })

    const collidesWith =
      candidateKey !== targetKey
        ? recipients.find((r) => recipientIdentityKey(r) === candidateKey)
        : undefined

    if (collidesWith) {
      setRecipients((prev) =>
        prev
          .map((r) => {
            if (recipientIdentityKey(r) === candidateKey) {
              return {
                ...r,
                revokedAt: undefined,
                rowKeys: Array.from(
                  new Set([...(r.rowKeys ?? []), ...(target.rowKeys ?? [])])
                ),
              }
            }
            if (r.substituteForKey === targetKey) {
              return { ...r, substituteForKey: candidateKey }
            }
            return r
          })
          .filter((r) => recipientIdentityKey(r) !== targetKey)
      )
      setSelectionMode((prev) => (prev === "none" ? "manual" : prev))
      setSelectedKeys((prev) => {
        const updated = new Set(prev)
        updated.delete(targetKey)
        updated.add(candidateKey)
        return updated
      })
      setInfoTone("success")
      setInfo(
        `${collidesWith.name || email} už v seznamu je u jiné agendy – nyní má přiřazenou i agendu „${target.name}“.`
      )
      setEditingKey(null)
      return
    }

    const next = recipients.map((r) => {
      if (recipientIdentityKey(r) === targetKey) {
        return { ...r, name: name || email, email }
      }
      if (r.substituteForKey === targetKey) {
        return { ...r, substituteForKey: candidateKey }
      }
      return r
    })

    setRecipients(next)
    setSelectionMode((prev) => (prev === "none" ? "manual" : prev))
    setSelectedKeys((prev) => {
      const updated = new Set(prev)
      updated.delete(targetKey)
      updated.add(candidateKey)
      return updated
    })
    setEditingKey(null)
  }

  function decideConflictOfInterest(value: boolean) {
    if (value === draftConflictOfInterest) return

    setDraftConflictOfInterest(value)

    const lawEmail = (LAW_SIGNATORY.emails[0] ?? "").toLowerCase()
    const lawKey = recipientIdentityKey({ email: lawEmail })
    const existingLaw = recipients.find(
      (r) => recipientIdentityKey(r) === lawKey
    )

    if (value) {
      if (!existingLaw) {
        const parsedLaw = parseSignatoryName(LAW_SIGNATORY.name)
        setRecipients((prev) => [
          ...prev,
          {
            name: parsedLaw.name,
            email: lawEmail,
            rowKeys: LAW_SIGNATORY.rowKeys,
            ...(parsedLaw.position ? { position: parsedLaw.position } : {}),
            ...(parsedLaw.department
              ? { department: parsedLaw.department }
              : {}),
          },
        ])
      }
      if (!existingLaw?.revokedAt) {
        setSelectedKeys((prev) => new Set(prev).add(lawKey))
      }
    } else if (existingLaw && !existingLaw.invitedAt) {
      setRecipients((prev) =>
        prev.filter((r) => recipientIdentityKey(r) !== lawKey)
      )
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(lawKey)
        return next
      })
    } else if (existingLaw) {
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(lawKey)
        return next
      })
    }
  }

  async function applyConflictOfInterestChange(
    value: boolean
  ): Promise<string> {
    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/conflict-of-interest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      }
    )
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(
        json?.message ?? "Rozhodnutí o střetu zájmů se nepodařilo uložit."
      )
    }

    setLocalConflictOfInterest(value)
    onConflictOfInterestChange?.(value)

    return value ? "střet zájmů uložen jako Ano" : "střet zájmů uložen jako Ne"
  }

  async function saveRecipients(next: Recipient[], confirmSetup = false) {
    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/signature-recipients`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "replace",
          ...(confirmSetup ? { confirmSetup: true } : {}),
          recipients: next.map((r) => ({
            name: r.name,
            email: r.email,
            ...(r.rowKeys?.length ? { rowKeys: r.rowKeys } : {}),
            ...(r.behalfLabel ? { behalfLabel: r.behalfLabel } : {}),
            ...(r.invitedAt ? { invitedAt: r.invitedAt } : {}),
            ...(r.revokedAt ? { revokedAt: r.revokedAt } : {}),
            ...(r.substituteForKey
              ? { substituteForKey: r.substituteForKey }
              : {}),
          })),
        }),
      }
    )
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.message ?? "Uložení se nezdařilo.")
    }
  }

  async function resendAllInvites() {
    if (resendingAll) return
    const targets = activeRecipients.filter((r) => r.invitedAt)
    if (targets.length === 0) return

    setResendingAll(true)
    setError(null)
    const failed: string[] = []

    for (const target of targets) {
      try {
        const res = await fetch(
          `/api/odchody/${offboardingId}/exit-checklist/invite`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inviteeEmail: target.email,
              inviteeName: target.name,
              ...(target.behalfLabel
                ? {
                    isBehalf: true,
                    behalfOfDisplayLabel: target.behalfLabel,
                    behalfOfRowKeys: target.rowKeys ?? [],
                  }
                : {}),
            }),
          }
        )
        if (!res.ok && res.status !== 207) throw new Error()
      } catch {
        failed.push(target.email)
      }
    }

    setResendingAll(false)

    if (failed.length === 0) {
      setInfoTone("success")
      setInfo(
        `Pozvánka byla znovu odeslána všem potvrzeným (${targets.length}).`
      )
    } else {
      setInfoTone("warning")
      setError(`Nepodařilo se odeslat znovu: ${failed.join(", ")}`)
    }

    await loadRecipients()
  }

  function cancelSubstitute(substitute: Recipient) {
    const key = recipientIdentityKey(substitute)

    if (!substitute.invitedAt) {
      setRecipients((prev) =>
        prev.filter((r) => recipientIdentityKey(r) !== key)
      )
      setSelectedKeys((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      setInfoTone("success")
      setInfo("Zastoupení bylo zrušeno.")
      return
    }

    toggleSelected(key)
  }

  async function handleConfirmSubstitute() {
    if (!substituteTarget) return

    const email = substituteEmail.trim().toLowerCase()
    let name = substituteName.trim()

    if (!email) {
      setSubstituteError("E-mail je povinný.")
      return
    }
    if (!isValidEmail(email)) {
      setSubstituteError("Zadejte platný e-mail.")
      return
    }

    let position: string | undefined = substitutePosition
    let department: string | undefined = substituteDepartment

    if (!name) {
      const resolved = await lookupEmployeeByEmail(email)
      if (resolved) {
        name = resolved.name
        position = resolved.position
        department = resolved.department
      }
    }

    const agendaLabel = findAgendaLabelForRowKeys(substituteTarget.rowKeys)
    const behalfLabel = agendaLabel
      ? `${substituteTarget.name} — ${agendaLabel}`
      : substituteTarget.name
    const candidateKey = recipientIdentityKey({ email, behalfLabel })
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )
    if (existingMatch && !existingMatch.revokedAt) {
      setSubstituteError("Tento náhradník už je v seznamu.")
      return
    }

    const targetKey = recipientIdentityKey(substituteTarget)
    const targetExists = recipients.some(
      (r) => recipientIdentityKey(r) === targetKey && !r.revokedAt
    )

    const newRecipient: Recipient = {
      name: name || email,
      email,
      ...(position ? { position } : {}),
      ...(department ? { department } : {}),
      behalfLabel,
      rowKeys: substituteTarget.rowKeys ?? [],
      substituteForKey: targetKey,
    }

    setRecipients((prev) => {
      const next = existingMatch
        ? prev.map((r) =>
            recipientIdentityKey(r) === candidateKey ? newRecipient : r
          )
        : [...prev, newRecipient]

      if (targetExists) return next

      const originalRecipient: Recipient = {
        name: substituteTarget.name,
        email: substituteTarget.email,
        ...(substituteTarget.position
          ? { position: substituteTarget.position }
          : {}),
        ...(substituteTarget.department
          ? { department: substituteTarget.department }
          : {}),
        ...(substituteTarget.rowKeys?.length
          ? { rowKeys: substituteTarget.rowKeys }
          : {}),
      }
      return [...next, originalRecipient]
    })
    setSelectedKeys((prev) => {
      const next = new Set(prev).add(candidateKey)
      if (!targetExists) next.add(targetKey)
      return next
    })
    setInfoTone("success")
    setInfo(
      `Přidání jako zástupce za ${substituteTarget.name}: ${name || email} – zaškrtnuto k odeslání, pozvánka se pošle až po potvrzení seznamu.`
    )
    setSubstituteTarget(null)
    setSubstituteName("")
    setSubstituteEmail("")
    setSubstituteError(null)
  }

  function requestReplace(target: Recipient) {
    const key = recipientIdentityKey(target)
    if (substitutesByOriginalKey.get(key)) {
      setError(
        "Nejprve zrušte zastoupení u této role, pak teprve osobu vyměňte."
      )
      return
    }
    setReplaceTarget(target)
    setReplaceName("")
    setReplaceEmail("")
    setReplacePosition(undefined)
    setReplaceDepartment(undefined)
    setReplaceError(null)
  }

  function cancelReplace() {
    setReplaceTarget(null)
    setReplaceError(null)
  }

  async function handleConfirmReplace() {
    if (!replaceTarget) return

    const email = replaceEmail.trim().toLowerCase()
    let name = replaceName.trim()

    if (!email) {
      setReplaceError("E-mail je povinný.")
      return
    }
    if (!isValidEmail(email)) {
      setReplaceError("Zadejte platný e-mail.")
      return
    }

    let position: string | undefined = replacePosition
    let department: string | undefined = replaceDepartment

    if (!name) {
      const resolved = await lookupEmployeeByEmail(email)
      if (resolved) {
        name = resolved.name
        position = resolved.position
        department = resolved.department
      }
    }

    const candidateKey = recipientIdentityKey({ email, behalfLabel: undefined })
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )

    const targetKey = recipientIdentityKey(replaceTarget)
    const targetName = replaceTarget.name
    const addedRowKeys = replaceTarget.rowKeys?.length
      ? replaceTarget.rowKeys
      : []

    if (existingMatch?.revokedAt) {
      const revivedRecipient: Recipient = {
        name: name || email,
        email,
        ...(position ? { position } : {}),
        ...(department ? { department } : {}),
        ...(addedRowKeys.length ? { rowKeys: addedRowKeys } : {}),
      }
      setRecipients((prev) =>
        prev.map((r) =>
          recipientIdentityKey(r) === candidateKey ? revivedRecipient : r
        )
      )
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(targetKey)
        next.add(candidateKey)
        return next
      })
      setInfoTone("warning")
      setInfo(
        `Výměna osoby za roli „${targetName}“: ${name || email} – po potvrzení tlačítkem dole ztratí ${targetName} přístup (a případné podpisy se zruší) a nová osoba dostane pozvánku.`
      )
      setReplaceTarget(null)
      setReplaceName("")
      setReplaceEmail("")
      setReplaceError(null)
      return
    }

    if (existingMatch && !existingMatch.behalfLabel) {
      setRecipients((prev) =>
        prev.map((r) =>
          recipientIdentityKey(r) === candidateKey
            ? {
                ...r,
                rowKeys: Array.from(
                  new Set([...(r.rowKeys ?? []), ...addedRowKeys])
                ),
              }
            : r
        )
      )
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(targetKey)
        next.add(candidateKey)
        return next
      })
      setInfoTone("warning")
      setInfo(
        `${name || email} už v seznamu je u jiné agendy – nyní se mu přidala i agenda „${targetName}“. ${targetName} ztratí přístup (a případné podpisy se zruší) po potvrzení tlačítkem dole.`
      )
      setReplaceTarget(null)
      setReplaceName("")
      setReplaceEmail("")
      setReplaceError(null)
      return
    }
    if (existingMatch) {
      setReplaceError(
        "Tento e-mail už je v seznamu jako zastupující/zastupovaný – nejprve vyřešte jeho zastoupení."
      )
      return
    }

    setRecipients((prev) => [
      ...prev,
      {
        name: name || email,
        email,
        ...(position ? { position } : {}),
        ...(department ? { department } : {}),
        ...(addedRowKeys.length ? { rowKeys: addedRowKeys } : {}),
      },
    ])
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.delete(targetKey)
      next.add(candidateKey)
      return next
    })
    setInfoTone("warning")
    setInfo(
      `Výměna osoby za roli „${targetName}“: ${name || email} – po potvrzení tlačítkem dole ztratí ${targetName} přístup (a případné podpisy se zruší) a nová osoba dostane pozvánku.`
    )
    setReplaceTarget(null)
    setReplaceName("")
    setReplaceEmail("")
    setReplaceError(null)
  }

  function handleReplacePersonSelected(employee: EmployeeItem) {
    setReplaceName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setReplaceEmail(employee.email ?? "")
    setReplacePosition(employee.positionName || undefined)
    setReplaceDepartment(employee.department || undefined)
    setReplaceError(null)
  }

  function requestAddPerson(
    row: AgendaRow,
    prefill?: { name: string; email: string }
  ) {
    setAddPersonRowKey(row.key)
    setAddPersonRowKeys(row.rowKeys ?? [])
    setAddPersonName(prefill?.name ?? "")
    setAddPersonEmail(prefill?.email ?? "")
    setAddPersonError(null)
  }

  function cancelAddPerson() {
    setAddPersonRowKey(null)
    setAddPersonError(null)
  }

  function confirmDefaultAssignment(
    row: AgendaRow,
    contact: {
      name: string
      email: string
      position?: string
      department?: string
    }
  ) {
    const candidateKey = recipientIdentityKey({
      email: contact.email,
      behalfLabel: undefined,
    })
    const newRecipient: Recipient = {
      name: contact.name,
      email: contact.email,
      ...(contact.position ? { position: contact.position } : {}),
      ...(contact.department ? { department: contact.department } : {}),
      ...(row.rowKeys?.length ? { rowKeys: row.rowKeys } : {}),
    }
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )
    if (existingMatch) {
      setRecipients((prev) =>
        prev.map((r) =>
          recipientIdentityKey(r) === candidateKey ? newRecipient : r
        )
      )
    } else {
      setRecipients((prev) => [...prev, newRecipient])
    }
    setSelectedKeys((prev) => new Set(prev).add(candidateKey))
    setInfoTone("success")
    setInfo(
      `Potvrzen výchozí návrh: ${contact.name} – pozvánka se pošle až po potvrzení seznamu.`
    )
  }

  async function confirmAddPerson() {
    const email = addPersonEmail.trim().toLowerCase()
    let name = addPersonName.trim()

    if (!email) {
      setAddPersonError("E-mail je povinný.")
      return
    }
    if (!isValidEmail(email)) {
      setAddPersonError("Zadejte platný e-mail.")
      return
    }

    let position: string | undefined
    let department: string | undefined

    if (!name) {
      const resolved = await lookupEmployeeByEmail(email)
      if (resolved) {
        name = resolved.name
        position = resolved.position
        department = resolved.department
      }
    }

    const candidateKey = recipientIdentityKey({ email, behalfLabel: undefined })
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )
    if (
      existingMatch &&
      !existingMatch.revokedAt &&
      existingMatch.behalfLabel
    ) {
      setAddPersonError(
        "Tento e-mail už je v seznamu jako zastupující/zastupovaný – nejprve vyřešte jeho zastoupení."
      )
      return
    }

    if (existingMatch?.revokedAt) {
      const revivedRecipient: Recipient = {
        name: name || email,
        email,
        ...(position ? { position } : {}),
        ...(department ? { department } : {}),
        ...(addPersonRowKeys.length ? { rowKeys: addPersonRowKeys } : {}),
      }
      setRecipients((prev) =>
        prev.map((r) =>
          recipientIdentityKey(r) === candidateKey ? revivedRecipient : r
        )
      )
      setSelectedKeys((prev) => new Set(prev).add(candidateKey))
      setInfoTone("success")
      setInfo(
        `Znovu přidáno: ${name || email} – jako nová osoba, pozvánka se pošle až po potvrzení seznamu.`
      )
    } else if (existingMatch) {
      setRecipients((prev) =>
        prev.map((r) =>
          recipientIdentityKey(r) === candidateKey
            ? {
                ...r,
                rowKeys: Array.from(
                  new Set([...(r.rowKeys ?? []), ...addPersonRowKeys])
                ),
              }
            : r
        )
      )
      setSelectedKeys((prev) => new Set(prev).add(candidateKey))
      setInfoTone("success")
      setInfo(
        `${name || email} už v seznamu je u jiné agendy – nyní má přiřazenou i tuto agendu navíc.`
      )
    } else {
      setRecipients((prev) => [
        ...prev,
        {
          name: name || email,
          email,
          ...(position ? { position } : {}),
          ...(department ? { department } : {}),
          ...(addPersonRowKeys.length ? { rowKeys: addPersonRowKeys } : {}),
        },
      ])
      setSelectedKeys((prev) => new Set(prev).add(candidateKey))
      setInfoTone("success")
      setInfo(
        `Přidání do návrhu seznamu: ${name || email} – zaškrtnuto k odeslání, pozvánka se pošle až po potvrzení seznamu.`
      )
    }
    setAddPersonRowKey(null)
    setAddPersonName("")
    setAddPersonEmail("")
    setAddPersonError(null)
  }

  function handleAddPersonSelected(employee: EmployeeItem) {
    setAddPersonName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setAddPersonEmail(employee.email ?? "")
    setAddPersonError(null)
  }

  function handleConfirmClick() {
    if (draftConflictOfInterest === null) {
      setSaveError(
        "Nejprve vyberte, zda je u tohoto odchodu střet zájmů (Ano/Ne) – bez rozhodnutí nelze seznam uložit a odeslat."
      )
      return
    }
    setSaveError(null)

    const signedBeingRemoved = toRevoke.filter((r) =>
      signedEmailSet.has(r.email.trim().toLowerCase())
    )
    if (signedBeingRemoved.length > 0) {
      setSignedRemovalConfirm(signedBeingRemoved)
      return
    }

    if (toInviteNew.length > 0 || coiDirty) {
      setPendingSaveConfirm(true)
      return
    }

    void handleConfirmList()
  }

  async function handleConfirmList() {
    if (sending) return

    const hasRecipientChanges = toInviteNew.length > 0 || toRevoke.length > 0

    if (!hasRecipientChanges && !coiDirty && !contactsDirty) return

    if (hasRecipientChanges) {
      const invitedActiveCount = activeRecipients.filter(
        (r) => r.invitedAt
      ).length
      if (
        toRevoke.length > 0 &&
        invitedActiveCount - toRevoke.length < 1 &&
        invitedActiveCount > 0
      ) {
        setError(
          "Nelze odebrat všechny aktivní příjemce – v seznamu musí zůstat alespoň jeden."
        )
        return
      }
    }

    setSending(true)
    setSaveError(null)
    setSendErrors(new Map())
    setError(null)
    setRespError(null)

    const infoParts: string[] = []
    let hadErrors = false

    if (hasRecipientChanges) {
      const resultByKey = new Map<
        string,
        { status: "fulfilled" } | { status: "rejected"; error: Error }
      >()

      const substituteForOriginalKey = new Map<
        string,
        (typeof toInviteNew)[number]
      >()
      for (const r of toInviteNew) {
        if (r.substituteForKey) {
          substituteForOriginalKey.set(r.substituteForKey, r)
        }
      }
      const mergedOriginalKeys = new Set<string>()

      const dualRoleBehalfByDirectKey = new Map<
        string,
        (typeof toInviteNew)[number]
      >()
      const skipSeparateSendKeys = new Set<string>()
      {
        const byEmail = new Map<string, (typeof toInviteNew)[number][]>()
        for (const r of toInviteNew) {
          const normalized = r.email.trim().toLowerCase()
          const arr = byEmail.get(normalized) ?? []
          arr.push(r)
          byEmail.set(normalized, arr)
        }
        for (const entries of byEmail.values()) {
          if (entries.length < 2) continue
          const direct = entries.find((entry) => !entry.behalfLabel)
          const behalfEntries = entries.filter((entry) => entry.behalfLabel)
          if (!direct || behalfEntries.length !== 1) continue
          const behalf = behalfEntries[0]
          dualRoleBehalfByDirectKey.set(recipientIdentityKey(direct), behalf)
          skipSeparateSendKeys.add(recipientIdentityKey(behalf))
        }
      }

      for (const r of toInviteNew) {
        const key = recipientIdentityKey(r)
        if (skipSeparateSendKeys.has(key)) continue

        try {
          const original = r.substituteForKey
            ? recipients.find(
                (candidate) =>
                  recipientIdentityKey(candidate) === r.substituteForKey
              )
            : undefined

          const pendingSubstitute = !r.substituteForKey
            ? substituteForOriginalKey.get(key)
            : undefined

          const alsoActingOnBehalfOf = dualRoleBehalfByDirectKey.get(key)
          const alsoActingOnBehalfOfOriginal =
            alsoActingOnBehalfOf?.substituteForKey
              ? recipients.find(
                  (candidate) =>
                    recipientIdentityKey(candidate) ===
                    alsoActingOnBehalfOf.substituteForKey
                )
              : undefined

          const res = await fetch(
            `/api/odchody/${offboardingId}/exit-checklist/invite`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inviteeEmail: r.email,
                inviteeName: r.name,
                ...(r.behalfLabel
                  ? {
                      isBehalf: true,
                      behalfOfName: original?.name ?? null,
                      behalfOfDisplayLabel: r.behalfLabel,
                      behalfOfRowKeys: r.rowKeys ?? [],
                      behalfOfPosition: original?.position ?? null,
                      behalfOfDepartment: original?.department ?? null,
                      behalfOfEmail: original?.email ?? null,
                    }
                  : {}),
                ...(pendingSubstitute
                  ? {
                      substituteName: pendingSubstitute.name,
                      substituteEmail: pendingSubstitute.email,
                      substitutePosition: pendingSubstitute.position ?? null,
                      substituteDepartment:
                        pendingSubstitute.department ?? null,
                    }
                  : {}),
                ...(alsoActingOnBehalfOf
                  ? {
                      alsoActingOnBehalfOf: {
                        behalfOfName:
                          alsoActingOnBehalfOfOriginal?.name ??
                          alsoActingOnBehalfOf.behalfLabel ??
                          null,
                        behalfOfEmail:
                          alsoActingOnBehalfOfOriginal?.email ?? null,
                        behalfOfPosition:
                          alsoActingOnBehalfOfOriginal?.position ?? null,
                        behalfOfDepartment:
                          alsoActingOnBehalfOfOriginal?.department ?? null,
                        behalfOfRowKeys: alsoActingOnBehalfOf.rowKeys ?? [],
                      },
                    }
                  : {}),
              }),
            }
          )
          const json = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          if (!res.ok && res.status !== 207) {
            throw new Error(json.error ?? "Nepodařilo se odeslat.")
          }
          resultByKey.set(key, { status: "fulfilled" })
          if (pendingSubstitute) {
            mergedOriginalKeys.add(key)
          }
          if (alsoActingOnBehalfOf) {
            resultByKey.set(recipientIdentityKey(alsoActingOnBehalfOf), {
              status: "fulfilled",
            })
          }
        } catch (err) {
          resultByKey.set(key, {
            status: "rejected",
            error:
              err instanceof Error ? err : new Error("Chyba při odesílání."),
          })
          if (dualRoleBehalfByDirectKey.has(key)) {
            resultByKey.set(
              recipientIdentityKey(dualRoleBehalfByDirectKey.get(key)!),
              {
                status: "rejected",
                error: new Error("Chyba při odesílání."),
              }
            )
          }
        }
      }

      const sentAt = new Date().toISOString()
      const nextSendErrors = new Map<string, string>()
      const revokeKeys = new Set(toRevoke.map((r) => recipientIdentityKey(r)))
      const inviteKeys = new Set(
        toInviteNew.map((r) => recipientIdentityKey(r))
      )

      const updatedRecipients = recipients.map((r) => {
        const key = recipientIdentityKey(r)

        if (revokeKeys.has(key)) {
          return { ...r, revokedAt: sentAt }
        }

        if (!inviteKeys.has(key)) return r

        const result = resultByKey.get(key)
        if (result?.status === "fulfilled") {
          return { ...r, invitedAt: sentAt }
        }
        nextSendErrors.set(
          key,
          result?.status === "rejected"
            ? result.error.message
            : "Chyba při odesílání."
        )
        return r
      })

      setRecipients(updatedRecipients)
      setSendErrors(nextSendErrors)

      const recipientsToPersist = updatedRecipients.filter(
        (r) => r.invitedAt || r.revokedAt
      )

      const sentCount = toInviteNew.length - nextSendErrors.size
      const errorCount = nextSendErrors.size
      const revokedCount = toRevoke.length

      if (recipientsToPersist.length > 0) {
        try {
          await saveRecipients(recipientsToPersist, true)
          setLastSentAt(sentAt)
          setHasExistingList(true)

          const newlySentSubstitutes = toInviteNew.filter(
            (r) =>
              r.substituteForKey &&
              resultByKey.get(recipientIdentityKey(r))?.status === "fulfilled"
          )

          for (const substitute of newlySentSubstitutes) {
            const original = recipients.find(
              (r) => recipientIdentityKey(r) === substitute.substituteForKey
            )
            if (!original) continue
            if (
              substitute.substituteForKey &&
              mergedOriginalKeys.has(substitute.substituteForKey)
            ) {
              continue
            }

            try {
              await fetch(
                `/api/odchody/${offboardingId}/exit-checklist/signature-substitute`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    originalEmail: original.email,
                    originalName: original.name,
                    originalBehalfLabel: original.behalfLabel,
                    substituteEmail: substitute.email,
                    substituteBehalfLabel: substitute.behalfLabel,
                  }),
                }
              )
            } catch {}
          }

          const newlyRevokedSubstitutes = toRevoke.filter(
            (r) => r.substituteForKey
          )
          for (const substitute of newlyRevokedSubstitutes) {
            const original = recipients.find(
              (r) => recipientIdentityKey(r) === substitute.substituteForKey
            )
            if (!original) continue

            try {
              await fetch(
                `/api/odchody/${offboardingId}/exit-checklist/signature-substitute`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "remove",
                    originalEmail: original.email,
                    originalName: original.name,
                    originalBehalfLabel: original.behalfLabel,
                    substituteEmail: substitute.email,
                    substituteName: substitute.name,
                    substitutePosition: substitute.position,
                    substituteDepartment: substitute.department,
                  }),
                }
              )
            } catch {}
          }

          if (sentCount > 0) {
            infoParts.push(
              `odesláno ${sentCount} ${sentCount === 1 ? "příjemci" : "příjemcům"}`
            )
          }
          if (revokedCount > 0) {
            infoParts.push(`odebráno ${revokedCount}`)
          }
          if (errorCount > 0) {
            hadErrors = true
            infoParts.push(
              `${errorCount} se nepodařilo odeslat – viz chyby níže`
            )
          }
        } catch (err) {
          setSaveError(
            err instanceof Error
              ? err.message
              : "Změny se nepodařilo uložit. Zkuste to prosím znovu."
          )
          setSending(false)
          return
        }
      }
    }

    if (coiDirty) {
      try {
        const coiMessage = await applyConflictOfInterestChange(
          draftConflictOfInterest as boolean
        )
        infoParts.push(coiMessage)
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : "Rozhodnutí o střetu zájmů se nepodařilo uložit."
        )
        setSending(false)
        return
      }
    }

    if (contactsDirty) {
      try {
        await persistResponsibleContacts()
        infoParts.push("odpovědné osoby uloženy")
      } catch (err) {
        setRespError(
          err instanceof Error
            ? err.message
            : "Odpovědné osoby se nepodařilo uložit."
        )
        setSending(false)
        return
      }
    }

    if (coiDirty && hasExistingList) {
      await loadRecipients()
    }

    setInfoTone(hadErrors ? "warning" : "success")
    setInfo(
      infoParts.length > 0 ? `Uloženo – ${infoParts.join(", ")}.` : "Uloženo."
    )
    setSending(false)
  }

  function copyLink() {
    if (!signUrl) return
    void navigator.clipboard.writeText(signUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  type AgendaRoleKind =
    | "employee"
    | "manager"
    | "signatory"
    | "law"
    | "sectionB"
    | "sectionC"

  type AgendaRow = {
    key: string
    kind: AgendaRoleKind
    departmentLabel: string
    obligations: string[]
    rowKeys?: string[]
    recipients: Recipient[]
    disabled?: boolean
  }

  function findSignatoryRecipients(rowKeys: string[]): Recipient[] {
    return activeRecipients.filter(
      (r) =>
        !r.behalfLabel &&
        !r.substituteForKey &&
        r.rowKeys &&
        rowKeys.every((k) => r.rowKeys!.includes(k))
    )
  }

  function getDefaultSignatoryContact(rowKeys?: string[]): {
    name: string
    email: string
    position?: string
    department?: string
  } | null {
    if (!rowKeys || rowKeys.length === 0) return null

    const match = [...EXIT_CHECKLIST_SIGNATORIES, LAW_SIGNATORY].find(
      (s) =>
        s.rowKeys.length === rowKeys.length &&
        rowKeys.every((k) => s.rowKeys.includes(k))
    )
    if (!match?.emails[0]) return null

    const parsed = parseSignatoryName(match.name)
    return {
      name: parsed.name,
      email: match.emails[0],
      position: parsed.position,
      department: parsed.department,
    }
  }

  const managerRecipient = activeRecipients.find(
    (r) =>
      !r.behalfLabel &&
      !r.substituteForKey &&
      managerEmail &&
      r.email.trim().toLowerCase() === managerEmail.trim().toLowerCase()
  )

  const employeeRecipient = activeRecipients.find(
    (r) =>
      !r.behalfLabel &&
      !r.substituteForKey &&
      employeeEmail &&
      r.email.trim().toLowerCase() === employeeEmail.trim().toLowerCase()
  )

  const predefinedAgendaRows: AgendaRow[] = [
    {
      key: "employee",
      kind: "employee",
      departmentLabel: "Zaměstnanec (odcházející)",
      obligations: ["podpis v hlavičce výstupního listu"],
      recipients: employeeRecipient ? [employeeRecipient] : [],
    },
    ...behalfOptions
      .filter(
        (option) =>
          draftConflictOfInterest === true ||
          !option.rowKeys.includes("lawInfo")
      )
      .map((option): AgendaRow => {
        if (foldText(option.departmentLabel) === foldText("Vedoucí odboru")) {
          const managerCoversSectionC =
            foldText(respSectionCEmail || sectionCResponsible?.email || "") ===
            foldText(managerEmail || "")
          return {
            key: "manager",
            kind: "manager",
            departmentLabel: option.departmentLabel,
            obligations: [
              "podpis v hlavičce výstupního listu",
              "předávací protokol (sekce A)",
              ...(managerCoversSectionC ? ["sekce C – předání agendy"] : []),
            ],
            rowKeys: option.rowKeys,
            recipients: managerRecipient ? [managerRecipient] : [],
          }
        }
        if (option.rowKeys.includes("lawInfo")) {
          return {
            key: "law",
            kind: "law",
            departmentLabel: option.departmentLabel,
            obligations: option.obligations,
            rowKeys: option.rowKeys,
            recipients: findSignatoryRecipients(option.rowKeys),
          }
        }
        return {
          key: option.value,
          kind: "signatory",
          departmentLabel: option.departmentLabel,
          obligations: option.obligations,
          rowKeys: option.rowKeys,
          recipients: findSignatoryRecipients(option.rowKeys),
        }
      }),
    {
      key: "sectionB",
      kind: "sectionB",
      departmentLabel: "Sekce B – majetek",
      obligations: [
        "kontrola a vyúčtování majetku (viz B. Výpis z osobní karty)",
      ],
      recipients: [],
    },
    {
      key: "sectionC",
      kind: "sectionC",
      departmentLabel: "Sekce C – předání agendy",
      obligations: [
        "rozhodnutí o způsobu předání agendy a podpis sekce C (výchozí je vedoucí odboru, lze změnit)",
      ],
      recipients: [],
    },
  ]

  const roleBoundKeys = new Set<string>()
  if (managerRecipient)
    roleBoundKeys.add(recipientIdentityKey(managerRecipient))
  for (const row of predefinedAgendaRows) {
    for (const recipient of row.recipients) {
      roleBoundKeys.add(recipientIdentityKey(recipient))
    }
  }

  const unassignedAgendaItems: string[] = []
  for (const row of predefinedAgendaRows) {
    if (row.kind === "sectionB" || row.kind === "sectionC") continue
    if (row.kind === "employee") {
      if (!employeeEmail) unassignedAgendaItems.push(row.departmentLabel)
      continue
    }
    if (row.kind === "manager") {
      if (!managerEmail) unassignedAgendaItems.push(row.departmentLabel)
      continue
    }
    if (row.recipients.length === 0) {
      unassignedAgendaItems.push(row.departmentLabel)
    }
  }

  const otherActiveRecipients = activeRecipients.filter((r) => {
    const key = recipientIdentityKey(r)
    if (roleBoundKeys.has(key)) return false
    if (r.substituteForKey && roleBoundKeys.has(r.substituteForKey))
      return false
    return true
  })

  const agendaRows: AgendaRow[] = [
    ...predefinedAgendaRows,
    {
      key: "extra",
      kind: "signatory",
      departmentLabel: "Přidaní mimo běžnou agendu",
      obligations: ["nepřiřazená agenda – jen právo podepsat výstupní list"],
      rowKeys: [],
      recipients: otherActiveRecipients,
    },
  ]

  function renderSubstituteFormFor(targetKey: string) {
    if (!substituteTarget) return null
    if (recipientIdentityKey(substituteTarget) !== targetKey) return null

    return (
      <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <p className="font-medium">Zastoupení za {substituteTarget.name}</p>
        <p className="text-xs">
          Po potvrzení tlačítkem dole se odešlou dvě zprávy: nově vybranému
          zástupci pozvánka k podpisu a {substituteTarget.name} informace, že
          ho/ji nyní někdo zastupuje – {substituteTarget.name} může výstupní
          list dál podepsat i sám/sama.
        </p>

        <Button
          type="button"
          size="sm"
          className="gap-1.5 bg-[#00847C] text-white hover:bg-[#0B6D73]"
          onClick={() => setSubstitutePickerOpen(true)}
        >
          <Search className="size-4" />
          Vybrat zaměstnance z EOS
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Celé jméno zastupujícího"
            value={substituteName}
            onChange={(e) => setSubstituteName(e.target.value)}
            className="h-8 bg-background py-1 text-sm"
          />
          <Input
            placeholder="email@praha6.cz"
            value={substituteEmail}
            onChange={(e) => {
              setSubstituteEmail(e.target.value)
              setSubstituteError(null)
            }}
            className="h-8 bg-background py-1 text-sm"
          />
        </div>

        {substituteError && (
          <p className="text-xs text-red-600">{substituteError}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSubstituteTarget(null)
              setSubstituteError(null)
            }}
          >
            Storno
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]"
            onClick={() => void handleConfirmSubstitute()}
          >
            Přidat do seznamu
          </Button>
        </div>

        <EosPersonPickerDialog
          open={substitutePickerOpen}
          onOpenChange={setSubstitutePickerOpen}
          title="Vybrat náhradníka"
          onSelect={handleSubstitutePersonSelected}
          excludeActiveOffboardings={false}
        />
      </div>
    )
  }

  function renderEmployeeCard() {
    const isConfirmed = hasExistingList && !employeeCardDirty
    const cardStateClass = isConfirmed
      ? "border-emerald-300 bg-emerald-50"
      : "border-border bg-muted/30"

    if (employeeCardEditing) {
      return (
        <div className="w-full space-y-1.5 rounded-md border border-dashed bg-muted/30 p-2 sm:w-72">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Zaměstnanec (odcházející)
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {employeeName}
          </p>
          <Input
            type="email"
            value={respEmployeeEmail}
            onChange={(e) => setRespEmployeeEmail(e.target.value)}
            placeholder="email@praha6.cz"
            className="h-8 bg-background py-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 w-full bg-[#00847C] text-xs text-white hover:bg-[#0B6D73]"
            onClick={toggleEmployeeCardEditing}
          >
            Hotovo
          </Button>
        </div>
      )
    }

    if (!respEmployeeEmail) {
      return (
        <div className="w-full rounded-md border border-dashed border-amber-300 bg-amber-50 p-2 sm:w-72">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Zaměstnanec (odcházející)
          </p>
          <p className="text-xs text-amber-800">Chybí vyplněný e-mail.</p>
          <div className="mt-2 flex justify-end border-t border-amber-200 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 bg-background text-xs"
              onClick={toggleEmployeeCardEditing}
            >
              <Pencil className="size-3" />
              Vyplnit
            </Button>
          </div>
        </div>
      )
    }

    const selectionKey = recipientIdentityKey({ email: respEmployeeEmail })
    const selectionChecked = selectedKeys.has(selectionKey)

    return (
      <div
        className={`w-full rounded-md border p-2 sm:min-h-[136px] sm:min-w-72 ${cardStateClass}`}
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Zaměstnanec (odcházející)
        </p>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {selectionVisible && (
              <Checkbox
                className="mt-0.5 size-3.5 shrink-0 bg-white"
                checked={selectionChecked}
                onCheckedChange={() => toggleSelected(selectionKey)}
              />
            )}
            <div className="min-w-0 text-left">
              <p
                className={`whitespace-nowrap text-sm font-medium ${
                  isConfirmed ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {employeeName || "—"}
              </p>
              <p className="overflow-x-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
                {respEmployeeEmail || "—"}
              </p>
            </div>
          </div>
          {isConfirmed ? (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-300 bg-emerald-100 text-[10px] text-emerald-800"
            >
              Potvrzeno
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-800"
            >
              Nepotvrzeno
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 bg-background text-xs"
            onClick={toggleEmployeeCardEditing}
          >
            <Pencil className="size-3" />
            Upravit
          </Button>
        </div>
      </div>
    )
  }

  function renderContactCard(fields: {
    editing: boolean
    onToggleEdit: () => void
    onOpenPicker: () => void
    name: string
    position: string
    department: string
    email: string
    onNameChange: (value: string) => void
    onPositionChange: (value: string) => void
    onDepartmentChange: (value: string) => void
    onEmailChange: (value: string) => void
    offerSubstitute: boolean
    offerSelection?: boolean
    cardLabel?: string
    dirty?: boolean
    onReset?: () => void
    resetTitle?: string
    emptyStateMessage?: string
  }) {
    const isConfirmed = hasExistingList && !fields.dirty
    const cardStateClass = isConfirmed
      ? "border-emerald-300 bg-emerald-50"
      : "border-border bg-muted/30"

    if (fields.editing) {
      return (
        <div className="w-full space-y-1.5 rounded-md border border-dashed bg-muted/30 p-2 sm:w-72">
          {fields.cardLabel && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {fields.cardLabel}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full gap-1 bg-background text-xs"
            onClick={fields.onOpenPicker}
          >
            <Search className="size-3" />
            Vybrat z EOS
          </Button>
          <Input
            value={fields.name}
            onChange={(e) => fields.onNameChange(e.target.value)}
            placeholder="Jméno a příjmení"
            className="h-8 bg-background py-1 text-xs"
          />
          <Input
            value={fields.position}
            onChange={(e) => fields.onPositionChange(e.target.value)}
            placeholder="Pozice"
            className="h-8 bg-background py-1 text-xs"
          />
          <Input
            value={fields.department}
            onChange={(e) => fields.onDepartmentChange(e.target.value)}
            placeholder="Odbor"
            className="h-8 bg-background py-1 text-xs"
          />
          <Input
            type="email"
            value={fields.email}
            onChange={(e) => fields.onEmailChange(e.target.value)}
            placeholder="email@praha6.cz"
            className="h-8 bg-background py-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 w-full bg-[#00847C] text-xs text-white hover:bg-[#0B6D73]"
            onClick={fields.onToggleEdit}
          >
            Hotovo
          </Button>
        </div>
      )
    }

    if (!fields.email) {
      return (
        <div className="w-full rounded-md border border-dashed border-amber-300 bg-amber-50 p-2 sm:w-72">
          {fields.cardLabel && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {fields.cardLabel}
            </p>
          )}
          <p className="text-xs text-amber-800">
            {fields.emptyStateMessage ?? "Chybí vyplněný kontakt."}
          </p>
          <div className="mt-2 flex justify-end border-t border-amber-200 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 bg-background text-xs"
              onClick={fields.onToggleEdit}
            >
              <Pencil className="size-3" />
              Vyplnit
            </Button>
          </div>
        </div>
      )
    }

    const selectionKey = fields.offerSelection
      ? recipientIdentityKey({ email: fields.email })
      : null
    const selectionChecked = selectionKey
      ? selectedKeys.has(selectionKey)
      : false

    return (
      <Fragment>
        <div
          className={`w-full rounded-md border p-2 sm:min-h-[136px] sm:min-w-72 ${cardStateClass}`}
        >
          {fields.cardLabel && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {fields.cardLabel}
            </p>
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              {selectionKey && selectionVisible && (
                <Checkbox
                  className="mt-0.5 size-3.5 shrink-0 bg-white"
                  checked={selectionChecked}
                  onCheckedChange={() => toggleSelected(selectionKey)}
                />
              )}
              <div className="min-w-0 text-left">
                <p
                  className={`whitespace-nowrap text-sm font-medium ${
                    isConfirmed ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {fields.name || "—"}
                </p>
                <p className="overflow-x-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {fields.email || "—"}
                </p>
                {fields.position && (
                  <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {fields.position}
                  </p>
                )}
                {fields.department && (
                  <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {fields.department}
                  </p>
                )}
              </div>
            </div>
            {isConfirmed ? (
              <Badge
                variant="outline"
                className="shrink-0 border-emerald-300 bg-emerald-100 text-[10px] text-emerald-800"
              >
                Potvrzeno
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-800"
              >
                Nepotvrzeno
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 bg-background text-xs"
              onClick={fields.onToggleEdit}
            >
              <Pencil className="size-3" />
              Upravit
            </Button>
            {fields.offerSubstitute && fields.email && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-purple-300 bg-background text-xs text-purple-800 hover:bg-purple-50"
                onClick={() => {
                  setSubstituteTarget({
                    name: fields.name || fields.email,
                    email: fields.email,
                    ...(fields.position ? { position: fields.position } : {}),
                    ...(fields.department
                      ? { department: fields.department }
                      : {}),
                  })
                  setSubstituteName("")
                  setSubstituteEmail("")
                  setSubstituteError(null)
                }}
              >
                <Repeat className="size-3" />
                Zastoupit
              </Button>
            )}
            {fields.onReset && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-7 border-red-200 bg-background text-red-600 hover:bg-red-50"
                title={fields.resetTitle ?? "Odebrat"}
                onClick={fields.onReset}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        </div>
        {renderSubstituteFormFor(recipientIdentityKey({ email: fields.email }))}
      </Fragment>
    )
  }

  function getCardRoleFields(row: AgendaRow) {
    return row.kind === "manager"
      ? {
          editing: managerCardEditing,
          onToggleEdit: toggleManagerCardEditing,
          onOpenPicker: () => setManagerContactPickerOpen(true),
          name: respManagerName,
          position: respManagerPosition,
          department: respManagerDepartment,
          email: respManagerEmail,
          onNameChange: setRespManagerName,
          onPositionChange: setRespManagerPosition,
          onDepartmentChange: setRespManagerDepartment,
          onEmailChange: setRespManagerEmail,
          offerSubstitute: true,
          offerSelection: true,
          dirty: managerCardDirty,
          onReset: managerRecipient
            ? () => requestReplace(managerRecipient)
            : undefined,
          resetTitle: "Vyměnit osobu",
        }
      : row.kind === "sectionB"
        ? {
            editing: sectionBCardEditing,
            onToggleEdit: toggleSectionBCardEditing,
            onOpenPicker: () => setSectionBPickerOpen(true),
            name: respSectionBName,
            position: respSectionBPosition,
            department: respSectionBDepartment,
            email: respSectionBEmail,
            onNameChange: setRespSectionBName,
            onPositionChange: setRespSectionBPosition,
            onDepartmentChange: setRespSectionBDepartment,
            onEmailChange: setRespSectionBEmail,
            offerSubstitute: true,
            offerSelection: true,
            dirty: sectionBCardDirty,
            onReset: () => {
              setRespSectionBName(DEFAULT_SECTION_B_RESPONSIBLE.name)
              setRespSectionBPosition(DEFAULT_SECTION_B_RESPONSIBLE.position)
              setRespSectionBDepartment(
                DEFAULT_SECTION_B_RESPONSIBLE.department
              )
              setRespSectionBEmail(DEFAULT_SECTION_B_RESPONSIBLE.email)
              syncSectionBResponsibleIntoRecipients(
                DEFAULT_SECTION_B_RESPONSIBLE.name,
                DEFAULT_SECTION_B_RESPONSIBLE.email,
                DEFAULT_SECTION_B_RESPONSIBLE.position,
                DEFAULT_SECTION_B_RESPONSIBLE.department
              )
            },
          }
        : {
            editing: sectionCCardEditing,
            onToggleEdit: toggleSectionCCardEditing,
            onOpenPicker: () => setSectionCPickerOpen(true),
            name: respSectionCName,
            position: respSectionCPosition,
            department: respSectionCDepartment,
            email: respSectionCEmail,
            onNameChange: setRespSectionCName,
            onPositionChange: setRespSectionCPosition,
            onDepartmentChange: setRespSectionCDepartment,
            onEmailChange: setRespSectionCEmail,
            offerSubstitute: true,
            offerSelection: true,
            dirty: sectionCCardDirty,
            onReset: () => {
              setRespSectionCName(respManagerName)
              setRespSectionCPosition(respManagerPosition)
              setRespSectionCDepartment(respManagerDepartment)
              setRespSectionCEmail(respManagerEmail)
              syncSectionCResponsibleIntoRecipients(
                respManagerName,
                respManagerEmail,
                respManagerPosition,
                respManagerDepartment
              )
            },
          }
  }

  function renderCardRoleCard(row: AgendaRow) {
    const fields = getCardRoleFields(row)
    return renderContactCard(
      row.kind === "sectionC"
        ? { ...fields, cardLabel: "Odpovědná osoba za sekci C" }
        : fields
    )
  }

  function renderAddAnotherPersonBlock(fields: {
    name: string
    email: string
    position: string
    department: string
  }) {
    if (!fields.email) return null
    return (
      <div className="flex w-full justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 bg-background text-xs"
          onClick={() => {
            setSubstituteTarget({
              name: fields.name || fields.email,
              email: fields.email,
              ...(fields.position ? { position: fields.position } : {}),
              ...(fields.department ? { department: fields.department } : {}),
            })
            setSubstituteName("")
            setSubstituteEmail("")
            setSubstituteError(null)
          }}
        >
          <UserPlus className="size-3" />
          Přidat další osobu
        </Button>
      </div>
    )
  }

  function renderKitt6Card() {
    return renderContactCard({
      editing: kitt6CardEditing,
      onToggleEdit: () => setKitt6CardEditing((prev) => !prev),
      onOpenPicker: () => setKitt6PickerOpen(true),
      name: respKitt6Name,
      position: respKitt6Position,
      department: respKitt6Department,
      email: respKitt6Email,
      dirty: kitt6CardDirty,
      onReset: () => {
        setRespKitt6Name("")
        setRespKitt6Position("")
        setRespKitt6Department("")
        setRespKitt6Email("")
      },
      onNameChange: setRespKitt6Name,
      onPositionChange: setRespKitt6Position,
      onDepartmentChange: setRespKitt6Department,
      onEmailChange: setRespKitt6Email,
      offerSubstitute: false,
      cardLabel: "Kontakt KITT6 („předání na jiné funkční místo“)",
      emptyStateMessage:
        "Chybí vyplněný kontakt KITT6 – je potřeba doplnit, kdo bude informován o předání na jiné funkční místo.",
    })
  }

  function renderSingleAssignee(
    r: Recipient,
    isEmployeeRow = false,
    onRemoved?: () => void,
    representedLabel?: string
  ) {
    const key = recipientIdentityKey(r)
    const checked = selectedKeys.has(key)
    const sendError = sendErrors.get(key)
    const substitute = substitutesByOriginalKey.get(key)
    const canOfferSubstituteHere =
      !isEmployeeRow &&
      checked &&
      !r.substituteForKey &&
      !r.behalfLabel &&
      !substitute
    const willBeRemoved = Boolean(r.invitedAt) && !checked
    const isConfirmedSubstitute = Boolean(r.behalfLabel) && Boolean(r.invitedAt)
    const isConfirmed = Boolean(r.invitedAt) && !willBeRemoved
    const cardStateClass = willBeRemoved
      ? "border-red-300 bg-red-50"
      : isConfirmedSubstitute
        ? "border-purple-300 bg-purple-50"
        : isConfirmed
          ? "border-emerald-300 bg-emerald-50"
          : "border-border bg-muted/30"
    const nameColorClass = !r.invitedAt
      ? "text-muted-foreground"
      : "text-foreground"
    const substituteLabel = substitute
      ? [
          substitute.name,
          formatPositionDepartment(substitute.position, substitute.department),
        ]
          .filter(Boolean)
          .join(", ")
      : null
    const isEditing = editingKey === key
    const removeDisabled = removalLocked && Boolean(r.invitedAt) && checked
    const isSubstituteCard = Boolean(r.substituteForKey)

    if (isSubstituteCard) {
      return (
        <div
          key={key}
          className={`w-full rounded-md border p-2 sm:min-h-[136px] sm:min-w-72 ${cardStateClass}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              {selectionVisible && (
                <Checkbox
                  className="mt-0.5 size-3.5 shrink-0 bg-white"
                  checked={checked}
                  disabled={removeDisabled}
                  title={removeDisabled ? removalLockedReason : undefined}
                  onCheckedChange={() => toggleSelected(key)}
                />
              )}
              <div className="min-w-0 text-left">
                <p
                  className={`whitespace-nowrap text-sm font-medium ${nameColorClass}`}
                >
                  {r.name}
                </p>
                <p className="overflow-x-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {r.email}
                </p>
                {r.position && (
                  <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {r.position}
                  </p>
                )}
                {r.department && (
                  <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {r.department}
                  </p>
                )}
              </div>
            </div>
            {willBeRemoved ? (
              <Badge
                variant="outline"
                className="shrink-0 border-red-300 bg-red-100 text-[10px] text-red-800"
              >
                Bude odebráno
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="shrink-0 border-purple-300 bg-purple-100 text-[10px] text-purple-800"
              >
                Zástup{!r.invitedAt ? " – nepotvrzeno" : ""}
              </Badge>
            )}
          </div>
          {representedLabel && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Zastupuje za: {representedLabel}
            </p>
          )}
          <div className="mt-2 flex justify-end border-t pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              disabled={removeDisabled}
              title={removeDisabled ? removalLockedReason : undefined}
              onClick={() => cancelSubstitute(r)}
            >
              <Repeat className="size-3" />
              Zrušit zastoupení
            </Button>
          </div>
        </div>
      )
    }

    return (
      <Fragment key={key}>
        <div
          className={`w-full rounded-md border p-2 sm:min-h-[136px] sm:min-w-72 ${cardStateClass}`}
        >
          {isEditing ? (
            <div className="flex flex-col gap-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Jméno"
                className="h-7 py-1 text-xs"
              />
              <Input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@praha6.cz"
                className="h-7 py-1 text-xs"
              />
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 text-emerald-700"
                  onClick={() => void confirmEdit(r)}
                  title="Uložit"
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground"
                  onClick={cancelEdit}
                  title="Zrušit úpravu"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {selectionVisible && (
                    <Checkbox
                      className="mt-0.5 size-3.5 shrink-0 bg-white"
                      checked={checked}
                      disabled={removeDisabled}
                      title={removeDisabled ? removalLockedReason : undefined}
                      onCheckedChange={() => toggleSelected(key)}
                    />
                  )}
                  <div className="min-w-0 text-left">
                    <p
                      className={`whitespace-nowrap text-sm font-medium ${nameColorClass}`}
                    >
                      {r.name}
                    </p>
                    <p className="overflow-x-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {r.email}
                    </p>
                    {r.position && (
                      <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {r.position}
                      </p>
                    )}
                    {r.department && (
                      <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {r.department}
                      </p>
                    )}
                  </div>
                </div>
                {willBeRemoved ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-red-300 bg-red-100 text-[10px] text-red-800"
                  >
                    Bude odebráno
                  </Badge>
                ) : !r.invitedAt ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-800"
                  >
                    Nepotvrzeno
                  </Badge>
                ) : isConfirmedSubstitute ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-purple-300 bg-purple-100 text-[10px] text-purple-800"
                  >
                    Zástup
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-emerald-300 bg-emerald-100 text-[10px] text-emerald-800"
                  >
                    Potvrzeno
                  </Badge>
                )}
              </div>
              {substituteLabel && (
                <Badge
                  variant="outline"
                  className="mt-1 border-purple-200 bg-purple-50 text-purple-700"
                >
                  Zastupuje: {substituteLabel}
                </Badge>
              )}
              {sendError && (
                <p className="mt-1 text-xs text-red-600">{sendError}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 bg-background text-xs"
                  onClick={() => startEdit(r)}
                >
                  <Pencil className="size-3" />
                  Upravit
                </Button>
                {!isEmployeeRow && r.invitedAt && !r.behalfLabel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 border-amber-300 text-xs text-amber-800 hover:bg-amber-50"
                    onClick={() => requestReplace(r)}
                  >
                    <ArrowLeftRight className="size-3" />
                    Vyměnit
                  </Button>
                )}
                {!isEmployeeRow &&
                  !r.substituteForKey &&
                  !r.behalfLabel &&
                  !substitute && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-7 border-red-200 bg-background text-red-600 hover:bg-red-50"
                      disabled={removeDisabled}
                      title={removeDisabled ? removalLockedReason : "Odebrat"}
                      onClick={() => {
                        if (r.invitedAt) {
                          toggleSelected(key)
                        } else {
                          requestRemovePending(r)
                          onRemoved?.()
                        }
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                {substitute ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 bg-background text-xs"
                    onClick={() => cancelSubstitute(substitute)}
                  >
                    <Repeat className="size-3" />
                    Zrušit zastoupení
                  </Button>
                ) : (
                  canOfferSubstituteHere && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-purple-300 bg-background text-xs text-purple-800 hover:bg-purple-50"
                      onClick={() => {
                        setSubstituteTarget(r)
                        setSubstituteName("")
                        setSubstituteEmail("")
                        setSubstituteError(null)
                      }}
                    >
                      <Repeat className="size-3" />
                      Zastoupit
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </div>
        {renderSubstituteFormFor(key)}
      </Fragment>
    )
  }

  function renderSignatoryRight(row: AgendaRow) {
    const isAdding = addPersonRowKey === row.key
    const isEmployeeRow = row.kind === "employee"
    const defaultContact =
      row.recipients.length === 0
        ? getDefaultSignatoryContact(row.rowKeys)
        : null
    return (
      <div className="flex w-full flex-col items-stretch gap-2">
        {row.recipients.length === 0 && !isAdding && defaultContact && (
          <div className="w-full rounded-md border p-2 sm:min-h-[136px] sm:min-w-72">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {selectionVisible && (
                  <Checkbox
                    className="mt-0.5 size-3.5 shrink-0 bg-white"
                    checked={false}
                    title="Vybrat a potvrdit tuto osobu k podpisu"
                    onCheckedChange={() =>
                      confirmDefaultAssignment(row, defaultContact)
                    }
                  />
                )}
                <div className="min-w-0 text-left">
                  <p className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                    {defaultContact.name}
                  </p>
                  <p className="overflow-x-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {defaultContact.email}
                  </p>
                  {defaultContact.position && (
                    <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {defaultContact.position}
                    </p>
                  )}
                  {defaultContact.department && (
                    <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {defaultContact.department}
                    </p>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-800"
              >
                Nepotvrzeno
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 bg-background text-xs"
                onClick={() => requestAddPerson(row, defaultContact)}
              >
                <Pencil className="size-3" />
                Upravit
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-[#00847C] text-xs text-white hover:bg-[#0B6D73]"
                onClick={() =>
                  setConfirmDefaultTarget({ row, contact: defaultContact })
                }
              >
                Potvrdit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-purple-300 bg-background text-xs text-purple-800 hover:bg-purple-50"
                onClick={() => {
                  setSubstituteTarget({
                    name: defaultContact.name,
                    email: defaultContact.email,
                    ...(defaultContact.position
                      ? { position: defaultContact.position }
                      : {}),
                    ...(defaultContact.department
                      ? { department: defaultContact.department }
                      : {}),
                    ...(row.rowKeys?.length ? { rowKeys: row.rowKeys } : {}),
                  })
                  setSubstituteName("")
                  setSubstituteEmail("")
                  setSubstituteError(null)
                }}
              >
                <Repeat className="size-3" />
                Zastoupit
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-7 border-red-200 bg-background text-red-600 hover:bg-red-50"
                title="Odebrat návrh a vybrat jiného"
                onClick={() => requestAddPerson(row)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        )}

        {defaultContact &&
          renderSubstituteFormFor(
            recipientIdentityKey({ email: defaultContact.email })
          )}

        {row.recipients.length === 0 && !isAdding && !defaultContact && (
          <p className="text-xs italic text-muted-foreground sm:text-right">
            Nikdo nepřiřazen.
          </p>
        )}

        {row.recipients.map((r) => {
          const substitute = substitutesByOriginalKey.get(
            recipientIdentityKey(r)
          )
          return (
            <div
              key={recipientIdentityKey(r)}
              className="flex flex-col items-stretch gap-2"
            >
              {renderSingleAssignee(r, isEmployeeRow, () =>
                requestAddPerson(row)
              )}
              {substitute &&
                renderSingleAssignee(substitute, false, undefined, r.name)}
            </div>
          )
        })}

        {isEmployeeRow ? null : isAdding ? (
          <div className="w-full space-y-1.5 rounded-md border border-dashed bg-muted/30 p-2 sm:w-72">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1 bg-background text-xs"
              onClick={() => setAddPersonPickerOpen(true)}
            >
              <Search className="size-3" />
              Vybrat z EOS
            </Button>
            <Input
              value={addPersonName}
              onChange={(e) => setAddPersonName(e.target.value)}
              placeholder="Celé jméno"
              className="h-7 py-1 text-xs"
            />
            <Input
              value={addPersonEmail}
              onChange={(e) => {
                setAddPersonEmail(e.target.value)
                setAddPersonError(null)
              }}
              placeholder="email@praha6.cz"
              className="h-7 py-1 text-xs"
            />
            {addPersonError && (
              <p className="text-xs text-red-600">{addPersonError}</p>
            )}
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={cancelAddPerson}
              >
                Storno
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-[#00847C] text-xs text-white hover:bg-[#0B6D73]"
                onClick={() => void confirmAddPerson()}
              >
                Přidat
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 bg-background text-xs"
              onClick={() => requestAddPerson(row)}
            >
              <UserPlus className="size-3" />
              {row.recipients.length === 0 && !defaultContact
                ? "Přidat odpovědnou osobu"
                : "Přidat další osobu"}
            </Button>
          </div>
        )}
      </div>
    )
  }

  function renderAgendaRow(row: AgendaRow) {
    const isCardRole =
      row.kind === "manager" ||
      row.kind === "sectionB" ||
      row.kind === "sectionC"

    const isExtraRow = row.key === "extra"

    const accentClass = isExtraRow
      ? "border-l-4 border-l-indigo-300"
      : row.kind === "employee"
        ? "border-l-4 border-l-sky-400"
        : row.kind === "manager"
          ? "border-l-4 border-l-[#00847C]"
          : row.kind === "sectionB"
            ? "border-l-4 border-l-cyan-300"
            : row.kind === "sectionC"
              ? "border-l-4 border-l-violet-300"
              : ""

    const rowBgClass = isExtraRow
      ? "bg-indigo-50/50"
      : row.kind === "sectionB"
        ? "bg-cyan-50/40"
        : row.kind === "sectionC"
          ? "bg-violet-50/40"
          : "bg-background"

    const sectionSigned =
      row.kind === "employee"
        ? employeeSigned
        : row.kind === "manager"
          ? managerHeaderSigned
          : row.kind === "sectionB"
            ? sectionBSigned
            : row.kind === "sectionC"
              ? sectionCSigned
              : isRowFullySigned(row.rowKeys)

    if (row.kind === "sectionC") {
      return (
        <div
          key={row.key}
          className={`flex flex-col gap-3 rounded-lg border p-3 ${rowBgClass} ${accentClass}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {row.departmentLabel}
                </p>
                <Badge
                  variant="outline"
                  className={
                    sectionSigned
                      ? "border-sky-300 bg-sky-100 text-[10px] text-sky-800"
                      : "border-border bg-muted text-[10px] text-muted-foreground"
                  }
                >
                  {sectionSigned
                    ? "Sekce podepsána"
                    : "Sekce ještě nepodepsána"}
                </Badge>
              </div>
              {row.obligations.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {row.obligations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-1/2">
              {renderCardRoleCard(row)}
              {renderAddAnotherPersonBlock(getCardRoleFields(row))}
            </div>
          </div>

          <div className="w-full border-t border-violet-200" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Sekce C – kontakt KITT6 v předání agendy na jiné funkční místo
              </p>
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-1/2">
              {renderKitt6Card()}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        key={row.key}
        className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between ${rowBgClass} ${accentClass}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {row.departmentLabel}
            </p>
            {isExtraRow && (
              <Badge
                variant="outline"
                className="border-indigo-300 bg-indigo-100 text-[10px] text-indigo-800"
              >
                Mimo běžnou agendu
              </Badge>
            )}
            {!isExtraRow && (
              <Badge
                variant="outline"
                className={
                  sectionSigned
                    ? "border-sky-300 bg-sky-100 text-[10px] text-sky-800"
                    : "border-border bg-muted text-[10px] text-muted-foreground"
                }
              >
                {sectionSigned ? "Sekce podepsána" : "Sekce ještě nepodepsána"}
              </Badge>
            )}
          </div>
          {row.obligations.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {row.obligations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:w-1/2">
          {row.kind === "employee" ? (
            renderEmployeeCard()
          ) : isCardRole ? (
            <>
              {renderCardRoleCard(row)}
              {row.kind !== "manager" &&
                renderAddAnotherPersonBlock(getCardRoleFields(row))}
            </>
          ) : (
            renderSignatoryRight(row)
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="gap-1 bg-[#00847C] text-white hover:bg-[#0B6D73]"
        >
          <Users className="size-4" />
          Seznam a správa osob k podpisu
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="shrink-0 border-b bg-background px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-5 shrink-0" />
            Seznam a správa osob k podpisu výstupního listu
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Kdo aktuálně smí a má podepsat výstupní list zaměstnance{" "}
            <strong>{employeeName}</strong>, a odeslání pozvánek k podpisu.
          </DialogDescription>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-lenis-prevent=""
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="px-5 py-4">
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Každému uvedenému chodí připomínky k podpisu, dokud nepodepíše
                  nebo ho odsud nezrušíte. Zrušeného můžete tlačítkem „Vrátit“
                  obnovit bez nové pozvánky – pokud ho ale odeberete a přidáte
                  znovu jako nového, dostane novou pozvánku.
                </span>
              </div>

              {signUrl && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Odkaz k podpisu
                  </Label>
                  <div className="rounded-md border bg-muted/50 px-3 py-2">
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {signUrl}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={copyLink}
                  >
                    <ClipboardCopy className="size-3" />
                    {copied ? "Zkopírováno" : "Kopírovat odkaz"}
                  </Button>
                </div>
              )}

              {error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {error}
                </p>
              )}

              {info && (
                <p
                  className={`rounded-md border px-3 py-2 text-xs ${
                    infoTone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-green-200 bg-green-50 text-green-800"
                  }`}
                >
                  {info}
                </p>
              )}

              {saveError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {saveError}
                </p>
              )}

              {loading ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Načítám seznam příjemců…
                </div>
              ) : (
                <>
                  <div
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                      hasExistingList
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {hasExistingList ? (
                      <>
                        <Check className="size-3.5 shrink-0" />
                        <span>
                          Naposledy potvrzeno a odesláno
                          {lastSentAt
                            ? ` ${new Date(lastSentAt).toLocaleDateString("cs-CZ")}${
                                lastSentByName ? ` – ${lastSentByName}` : ""
                              }`
                            : ""}
                          .
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>
                          Ještě nic nebylo potvrzeno – dole je jen navržený
                          výchozí seznam.
                        </span>
                      </>
                    )}
                    {(pendingNewInvites > 0 || pendingRemovals > 0) && (
                      <span className="ml-auto shrink-0 font-medium">
                        Neodesláno:{" "}
                        {[
                          pendingNewInvites > 0
                            ? `+${pendingNewInvites}`
                            : null,
                          pendingRemovals > 0 ? `−${pendingRemovals}` : null,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Legenda:
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded-full border border-border bg-muted" />
                      návrh, neodesláno
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded-full border border-emerald-300 bg-emerald-200" />
                      potvrzeno, odesláno
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded-full border border-purple-300 bg-purple-200" />
                      zástup (potvrzený)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded-full border border-red-300 bg-red-200" />
                      bude odebráno po uložení
                    </span>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      Nastavení agendy a rolí k podpisu
                    </Label>

                    {unassignedAgendaItems.length > 0 && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          <span className="font-medium">
                            Nepřiřazeno ({unassignedAgendaItems.length}) – u
                            každé agendy musí být přiřazená alespoň jedna
                            pověřená osoba, aby ji cron hlídal:
                          </span>
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-9">
                          {unassignedAgendaItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div
                      className={`rounded-md border-2 p-3 ${
                        draftConflictOfInterest === null
                          ? "border-amber-300 bg-amber-50"
                          : "border-emerald-300 bg-emerald-50"
                      }`}
                    >
                      <Label
                        className={`text-sm font-semibold ${
                          draftConflictOfInterest === null
                            ? "text-amber-900"
                            : "text-emerald-900"
                        }`}
                      >
                        Obsahuje výstupní list střet zájmů?{" "}
                        <span className="text-red-500">*</span>
                      </Label>
                      <p
                        className={`mt-0.5 text-[11px] ${
                          draftConflictOfInterest === null
                            ? "text-amber-800"
                            : "text-emerald-800"
                        }`}
                      >
                        {draftConflictOfInterest === null
                          ? "Je potřeba vybrat Ano/Ne – bez rozhodnutí nelze seznam uložit a odeslat. Při volbě „Ano“ se do agendy dole přidá řádek Právní odbor k podpisu; při „Ne“ zase zmizí (a případně se odešle informace, že už podpis není potřeba)."
                          : "Rozhodnuto – podle potřeby to lze kdykoliv změnit i po uložení."}
                      </p>
                      <RadioGroup
                        value={
                          draftConflictOfInterest === true
                            ? "yes"
                            : draftConflictOfInterest === false
                              ? "no"
                              : ""
                        }
                        onValueChange={(value) =>
                          decideConflictOfInterest(value === "yes")
                        }
                        className="mt-2 flex gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem
                            id="agenda-conflict-yes"
                            value="yes"
                            disabled={sending}
                            className="bg-background"
                          />
                          <Label
                            htmlFor="agenda-conflict-yes"
                            className="cursor-pointer text-sm font-medium"
                          >
                            Ano
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem
                            id="agenda-conflict-no"
                            value="no"
                            disabled={sending}
                            className="bg-background"
                          />
                          <Label
                            htmlFor="agenda-conflict-no"
                            className="cursor-pointer text-sm font-medium"
                          >
                            Ne
                          </Label>
                        </div>
                      </RadioGroup>
                      {coiDirty && (
                        <p className="mt-1 text-[11px] text-emerald-800">
                          Změna se uloží a případně odešle až tlačítkem „Odeslat
                          a uložit“ dole.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {agendaRows.map((row) => (
                        <Fragment key={row.key}>
                          {row.key === "extra" && (
                            <div className="flex items-center gap-2 pt-2">
                              <div className="h-px flex-1 bg-border" />
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Mimo běžnou agendu
                              </span>
                              <div className="h-px flex-1 bg-border" />
                            </div>
                          )}
                          {renderAgendaRow(row)}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {replaceTarget && (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">
                    Vyměnit osobu u role „{replaceTarget.name}“
                  </p>
                  <p className="text-xs">
                    Po potvrzení tlačítkem dole se ihned uloží:{" "}
                    <strong>{replaceTarget.name}</strong> ztratí přístup k
                    výstupnímu listu (a případné podpisy se zruší), všem se to
                    oznámí e-mailem a zapíše do historie; nově zadaná osoba
                    převezme stejnou agendu a dostane pozvánku k podpisu.
                  </p>

                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 bg-[#00847C] text-white hover:bg-[#0B6D73]"
                    onClick={() => setReplacePickerOpen(true)}
                  >
                    <Search className="size-4" />
                    Vybrat zaměstnance z EOS
                  </Button>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Celé jméno nové osoby"
                      value={replaceName}
                      onChange={(e) => setReplaceName(e.target.value)}
                      className="h-8 bg-background py-1 text-sm"
                    />
                    <Input
                      placeholder="email@praha6.cz"
                      value={replaceEmail}
                      onChange={(e) => {
                        setReplaceEmail(e.target.value)
                        setReplaceError(null)
                      }}
                      className="h-8 bg-background py-1 text-sm"
                    />
                  </div>

                  {replaceError && (
                    <p className="text-xs text-red-600">{replaceError}</p>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelReplace}
                    >
                      Storno
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() => void handleConfirmReplace()}
                    >
                      Vyměnit
                    </Button>
                  </div>

                  <EosPersonPickerDialog
                    open={replacePickerOpen}
                    onOpenChange={setReplacePickerOpen}
                    title="Vybrat novou osobu"
                    onSelect={handleReplacePersonSelected}
                    excludeActiveOffboardings={false}
                  />
                </div>
              )}

              <EosPersonPickerDialog
                open={addPersonPickerOpen}
                onOpenChange={setAddPersonPickerOpen}
                title="Vybrat další osobu k agendě"
                onSelect={handleAddPersonSelected}
                excludeActiveOffboardings={false}
              />

              <div className="space-y-3 border-t pt-4">
                <EosPersonPickerDialog
                  open={sectionBPickerOpen}
                  onOpenChange={setSectionBPickerOpen}
                  title="Vybrat odpovědnou osobu za sekci B"
                  onSelect={handleSectionBPersonSelected}
                  excludeActiveOffboardings={false}
                />
                <EosPersonPickerDialog
                  open={sectionCPickerOpen}
                  onOpenChange={setSectionCPickerOpen}
                  title="Vybrat odpovědnou osobu za sekci C"
                  onSelect={handleSectionCPersonSelected}
                  excludeActiveOffboardings={false}
                />
                <EosPersonPickerDialog
                  open={managerContactPickerOpen}
                  onOpenChange={setManagerContactPickerOpen}
                  title="Vybrat vedoucího odboru"
                  onSelect={handleManagerContactPersonSelected}
                  excludeActiveOffboardings={false}
                />
                <EosPersonPickerDialog
                  open={kitt6PickerOpen}
                  onOpenChange={setKitt6PickerOpen}
                  title="Vybrat kontakt KITT6"
                  onSelect={handleKitt6PersonSelected}
                  excludeActiveOffboardings={false}
                />

                {respError && (
                  <p className="text-xs text-red-600">{respError}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vybrat:
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={`h-7 gap-1 text-xs ${
                    selectionMode === "manual"
                      ? "border-[#00847C] bg-[#E5F5F2] text-[#0B4A46]"
                      : "bg-background"
                  }`}
                  onClick={() => toggleSelectionMode("manual")}
                >
                  {selectionMode === "manual" ? "Zrušit výběr" : "Vybrat ručně"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={`h-7 gap-1 text-xs ${
                    selectionMode === "unconfirmed"
                      ? "border-[#00847C] bg-[#E5F5F2] text-[#0B4A46]"
                      : "bg-background"
                  }`}
                  onClick={() => toggleSelectionMode("unconfirmed")}
                >
                  {selectionMode === "unconfirmed"
                    ? "Zrušit výběr"
                    : "Vybrat neodeslané"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={`h-7 gap-1 text-xs ${
                    selectionMode === "all" || allRecipientsSelected
                      ? "border-[#00847C] bg-[#E5F5F2] text-[#0B4A46]"
                      : "bg-background"
                  }`}
                  onClick={() => toggleSelectionMode("all")}
                >
                  {selectionMode === "all" || allRecipientsSelected
                    ? "Zrušit výběr"
                    : "Vybrat vše"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-5 py-3">
          <DocumentHistoryDialog
            title="Historie výstupního listu"
            fetchUrl={`/api/odchody/${offboardingId}/exit-checklist/history`}
            actionLabel={exitChecklistEventActionLabel}
            trigger={
              <Button type="button" variant="outline" className="gap-1">
                <HistoryIcon className="size-4" />
                Historie
              </Button>
            }
          />

          <Button
            type="button"
            variant="outline"
            className="gap-1"
            onClick={() => setResendAllConfirmOpen(true)}
            disabled={
              resendingAll ||
              sending ||
              loading ||
              activeRecipients.filter((r) => r.invitedAt).length === 0
            }
          >
            {resendingAll ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Odeslat znovu všem
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={sending}
          >
            Zavřít
          </Button>

          <Button
            type="button"
            className="gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]"
            onClick={handleConfirmClick}
            disabled={sending || loading || !hasUnsavedDialogChanges}
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Ukládám…
              </>
            ) : toRevoke.length > 0 && toInviteNew.length > 0 ? (
              <>
                <Send className="size-4" />
                Odeslat a uložit (odeslat {toInviteNew.length}, odebrat{" "}
                {toRevoke.length})
              </>
            ) : toRevoke.length > 0 ? (
              <>
                <Send className="size-4" />
                Odeslat a uložit (odebrat {toRevoke.length})
              </>
            ) : toInviteNew.length > 0 ? (
              <>
                <Send className="size-4" />
                Odeslat a uložit (odeslat {toInviteNew.length})
              </>
            ) : (
              <>
                <Send className="size-4" />
                Odeslat a uložit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={resendAllConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setResendAllConfirmOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odeslat pozvánku znovu?</AlertDialogTitle>
            <AlertDialogDescription>
              Chcete odeslat pozvánku znovu všem již potvrzeným osobám v seznamu
              ({activeRecipients.filter((r) => r.invitedAt).length})? Nově
              přidaným/nepotvrzeným osobám se pozvánka pošle až po uložení
              seznamu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResendAllConfirmOpen(false)}>
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={() => {
                setResendAllConfirmOpen(false)
                void resendAllInvites()
              }}
            >
              Odeslat znovu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDefaultTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmDefaultTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potvrdit osobu k podpisu?</AlertDialogTitle>
            <AlertDialogDescription>
              Chcete potvrdit {confirmDefaultTarget?.contact.name} (
              {confirmDefaultTarget?.contact.email}) pro tuto agendu a poslat jí
              pozvánku? Pozvánka se odešle až po uložení seznamu tlačítkem
              „Odeslat a uložit“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDefaultTarget(null)}>
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={() => {
                if (confirmDefaultTarget) {
                  confirmDefaultAssignment(
                    confirmDefaultTarget.row,
                    confirmDefaultTarget.contact
                  )
                }
                setConfirmDefaultTarget(null)
              }}
            >
              Potvrdit a odeslat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={substituteRemovalConfirm !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSubstituteRemovalConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odebrat i zastoupení?</AlertDialogTitle>
            <AlertDialogDescription>
              {substituteRemovalConfirm?.original.name} má nastaveného zástupce{" "}
              {substituteRemovalConfirm?.substitute.name}. Chcete zastoupení
              zachovat, nebo odebrat společně s touto osobou?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setSubstituteRemovalConfirm(null)}
            >
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              className="border bg-background text-foreground hover:bg-muted"
              onClick={confirmKeepSubstitute}
            >
              Zachovat zastoupení
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRemoveSubstituteToo}
            >
              Odebrat i zastoupení
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={signedRemovalConfirm !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSignedRemovalConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Odebrat osobu, která už podepsala?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {signedRemovalConfirm?.map((r) => r.name).join(", ")}{" "}
              {signedRemovalConfirm?.length === 1 ? "již má" : "již mají"}{" "}
              podepsaný výstupní list. Odebráním ze seznamu osob k podpisu se
              jejich podpis zruší a bude potřeba podepsat znovu. Chcete
              pokračovat?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSignedRemovalConfirm(null)}>
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setSignedRemovalConfirm(null)
                void handleConfirmList()
              }}
            >
              Odebrat a zrušit podpis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingSaveConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingSaveConfirm(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {willSendAnyEmail ? "Uložit a odeslat e-maily?" : "Uložit změny?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-1.5">
              {toInviteNew.length > 0 && (
                <p>
                  Novým příjemcům ({toInviteNew.length}) bude odeslána pozvánka
                  k podpisu na jejich e-mail.
                </p>
              )}
              {coiDirty && (
                <p>
                  Podle rozhodnutí o střetu zájmů bude{" "}
                  {draftConflictOfInterest
                    ? "Právní odbor přidán k podpisu a bude mu odeslána pozvánka."
                    : lawSignatoryWasInvited
                      ? "Právní odbor odebrán ze seznamu a bude mu odeslána informace o zrušení."
                      : "Právní odbor odebrán z návrhu seznamu – pozvánka mu nikdy nebyla odeslána, takže se nic nebude rozesílat."}
                </p>
              )}
              <p>Chcete pokračovat?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSaveConfirm(false)}>
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={() => {
                setPendingSaveConfirm(false)
                void handleConfirmList()
              }}
            >
              {willSendAnyEmail ? "Uložit a odeslat" : "Uložit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnsavedChangesDialog
        open={closeConfirmOpen}
        onStay={() => setCloseConfirmOpen(false)}
        onDiscard={discardAndClose}
        onSaveAndLeave={() => {
          setCloseConfirmOpen(false)
          handleConfirmClick()
        }}
        description="V okně jsou neuložené změny (seznam příjemců, střet zájmů nebo odpovědné osoby), které ještě nebyly potvrzené tlačítkem Uložit – nikomu se nic neposlalo. Chcete je uložit a případně odeslat e-maily, nebo je zahodit?"
        saveLabel={willSendAnyEmail ? "Uložit a odeslat" : "Uložit"}
      />

      <ManagerNotifyDialog
        prompt={managerNotifyPrompt}
        onClose={() => setManagerNotifyPrompt(null)}
      />
    </Dialog>
  )
}
