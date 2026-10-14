"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  History as HistoryIcon,
  Info,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react"

import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

import {
  buildBehalfOptions,
  formatObligations,
  type BehalfOption,
} from "@/lib/exit-checklist-behalf-options"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EmployeeItem } from "@/components/common/employee-combobox"
import { EosPersonPickerDialog } from "@/components/common/eos-person-picker-dialog"
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
  isLocked?: boolean
  sectionBResponsible?: ResponsiblePerson | null
  kitt6OptionContact?: ResponsiblePerson | null
  onManagerChange?: (value: ResponsiblePerson) => void
  onSectionBResponsibleChange?: (value: ResponsiblePerson) => void
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

function formatDateTime(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

const CUSTOM_BEHALF_VALUE = "__custom__"

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
  isLocked = false,
  sectionBResponsible,
  kitt6OptionContact,
  onManagerChange,
  onSectionBResponsibleChange,
  onKitt6ContactChange,
  onConflictOfInterestChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [sectionBPickerOpen, setSectionBPickerOpen] = useState(false)
  const [managerContactPickerOpen, setManagerContactPickerOpen] =
    useState(false)
  const [kitt6PickerOpen, setKitt6PickerOpen] = useState(false)
  const [managerCardEditing, setManagerCardEditing] = useState(false)
  const [sectionBCardEditing, setSectionBCardEditing] = useState(false)
  const [kitt6CardEditing, setKitt6CardEditing] = useState(false)
  const [respManagerName, setRespManagerName] = useState("")
  const [respManagerPosition, setRespManagerPosition] = useState("")
  const [respManagerDepartment, setRespManagerDepartment] = useState("")
  const [respManagerEmail, setRespManagerEmail] = useState("")
  const [respSectionBName, setRespSectionBName] = useState("")
  const [respSectionBPosition, setRespSectionBPosition] = useState("")
  const [respSectionBDepartment, setRespSectionBDepartment] = useState("")
  const [respSectionBEmail, setRespSectionBEmail] = useState("")
  const [respKitt6Name, setRespKitt6Name] = useState("")
  const [respKitt6Position, setRespKitt6Position] = useState("")
  const [respKitt6Department, setRespKitt6Department] = useState("")
  const [respKitt6Email, setRespKitt6Email] = useState("")
  const [respError, setRespError] = useState<string | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
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

  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPosition, setNewPosition] = useState<string | undefined>()
  const [newDepartment, setNewDepartment] = useState<string | undefined>()
  const [addError, setAddError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [behalfMode, setBehalfMode] = useState(false)
  const [behalfOf, setBehalfOf] = useState("")
  const [customBehalfLabel, setCustomBehalfLabel] = useState("")

  const [restoringKey, setRestoringKey] = useState<string | null>(null)
  const [resendingKey, setResendingKey] = useState<string | null>(null)

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
  const [substituteActionKey, setSubstituteActionKey] = useState<string | null>(
    null
  )

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editError, setEditError] = useState<string | null>(null)

  const [localConflictOfInterest, setLocalConflictOfInterest] =
    useState(conflictOfInterest)
  const [draftConflictOfInterest, setDraftConflictOfInterest] =
    useState(conflictOfInterest)

  const behalfOptions = useMemo(
    () => buildBehalfOptions(managerName),
    [managerName]
  )

  const selectedBehalfOption = useMemo(
    () => behalfOptions.find((option) => option.value === behalfOf) ?? null,
    [behalfOf, behalfOptions]
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
  const revokedRecipients = recipients.filter((r) => r.revokedAt)

  const substitutesByOriginalKey = new Map<string, Recipient>()
  activeRecipients.forEach((r) => {
    if (r.substituteForKey) substitutesByOriginalKey.set(r.substituteForKey, r)
  })

  const checkedActiveCount = activeRecipients.filter((r) =>
    selectedKeys.has(recipientIdentityKey(r))
  ).length
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

  const contactsDirty =
    normalizeCompare(respManagerName) !== normalizeCompare(managerName) ||
    normalizeCompare(respManagerPosition) !==
      normalizeCompare(managerPosition) ||
    normalizeCompare(respManagerDepartment) !==
      normalizeCompare(managerDepartment) ||
    normalizeCompare(respManagerEmail) !== normalizeCompare(managerEmail) ||
    normalizeCompare(respSectionBName) !==
      normalizeCompare(sectionBResponsible?.name) ||
    normalizeCompare(respSectionBPosition) !==
      normalizeCompare(sectionBResponsible?.position) ||
    normalizeCompare(respSectionBDepartment) !==
      normalizeCompare(sectionBResponsible?.department) ||
    normalizeCompare(respSectionBEmail) !==
      normalizeCompare(sectionBResponsible?.email) ||
    normalizeCompare(respKitt6Name) !==
      normalizeCompare(kitt6OptionContact?.name) ||
    normalizeCompare(respKitt6Position) !==
      normalizeCompare(kitt6OptionContact?.position) ||
    normalizeCompare(respKitt6Department) !==
      normalizeCompare(kitt6OptionContact?.department) ||
    normalizeCompare(respKitt6Email) !==
      normalizeCompare(kitt6OptionContact?.email)

  const hasUnsavedDialogChanges =
    toInviteNew.length > 0 || toRevoke.length > 0 || coiDirty || contactsDirty

  const signedEmailSet = useMemo(
    () => new Set((signedEmails ?? []).map((e) => e.trim().toLowerCase())),
    [signedEmails]
  )
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
      setNewName("")
      setNewEmail("")
      setNewPosition(undefined)
      setNewDepartment(undefined)
      setAddError(null)
      setBehalfMode(false)
      setBehalfOf("")
      setCustomBehalfLabel("")
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
      setKitt6CardEditing(false)
      setRespManagerName(managerName ?? "")
      setRespManagerPosition(managerPosition ?? "")
      setRespManagerDepartment(managerDepartment ?? "")
      setRespManagerEmail(managerEmail ?? "")
      setRespSectionBName(sectionBResponsible?.name ?? "")
      setRespSectionBPosition(sectionBResponsible?.position ?? "")
      setRespSectionBDepartment(sectionBResponsible?.department ?? "")
      setRespSectionBEmail(sectionBResponsible?.email ?? "")
      setRespKitt6Name(kitt6OptionContact?.name ?? "")
      setRespKitt6Position(kitt6OptionContact?.position ?? "")
      setRespKitt6Department(kitt6OptionContact?.department ?? "")
      setRespKitt6Email(kitt6OptionContact?.email ?? "")
      setRespError(null)
      void loadRecipients()
    }
  }

  async function persistResponsibleContacts(): Promise<void> {
    const managerEmailValue = respManagerEmail.trim().toLowerCase()
    const sectionBEmail = respSectionBEmail.trim().toLowerCase()
    const kitt6Email = respKitt6Email.trim().toLowerCase()

    if (!managerEmailValue || !sectionBEmail || !kitt6Email) {
      throw new Error(
        "E-mail vedoucího odboru, odpovědné osoby za sekci B i kontakt KITT6 jsou povinné."
      )
    }

    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/responsible-contacts`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    onKitt6ContactChange?.({
      name: respKitt6Name.trim(),
      position: respKitt6Position.trim(),
      department: respKitt6Department.trim(),
      email: kitt6Email,
    })
    setManagerCardEditing(false)
    setSectionBCardEditing(false)
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

  function resolveBehalfOriginalContact(option: BehalfOption): {
    name: string
    email: string
    position?: string
    department?: string
  } | null {
    const responsibleName = option.responsibleName.trim()
    if (!responsibleName) return null

    if (
      managerName &&
      managerEmail &&
      responsibleName.toLowerCase() === managerName.trim().toLowerCase()
    ) {
      return {
        name: managerName,
        email: managerEmail.trim().toLowerCase(),
        position: managerPosition ?? undefined,
        department: managerDepartment ?? undefined,
      }
    }

    const signatory = EXIT_CHECKLIST_SIGNATORIES.find((s) =>
      s.rowKeys.some((key) => option.rowKeys.includes(key))
    )
    if (signatory?.emails[0]) {
      const parsed = parseSignatoryName(signatory.name)
      return {
        name: parsed.name,
        email: signatory.emails[0].toLowerCase(),
        position: parsed.position,
        department: parsed.department,
      }
    }

    return null
  }

  async function handleAdd() {
    setAddError(null)
    setInfo(null)
    const email = newEmail.trim().toLowerCase()
    let name = newName.trim()

    if (!email) {
      setAddError("E-mail je povinný.")
      return
    }
    if (!isValidEmail(email)) {
      setAddError("Zadejte platný e-mail.")
      return
    }

    let position: string | undefined = newPosition
    let department: string | undefined = newDepartment

    if (!name) {
      const resolved = await lookupEmployeeByEmail(email)
      if (resolved) {
        name = resolved.name
        position = resolved.position
        department = resolved.department
      }
    }
    if (
      behalfMode &&
      behalfOf === CUSTOM_BEHALF_VALUE &&
      !customBehalfLabel.trim()
    ) {
      setAddError("Vyplňte, za koho bude příjemce podepisovat.")
      return
    }
    if (
      behalfMode &&
      behalfOf !== CUSTOM_BEHALF_VALUE &&
      !selectedBehalfOption
    ) {
      setAddError("Vyberte, za koho bude příjemce podepisovat.")
      return
    }

    const behalf = !behalfMode
      ? undefined
      : behalfOf === CUSTOM_BEHALF_VALUE
        ? { displayLabel: customBehalfLabel.trim(), rowKeys: [] }
        : selectedBehalfOption
          ? {
              displayLabel: selectedBehalfOption.displayLabel,
              rowKeys: selectedBehalfOption.rowKeys,
            }
          : undefined

    const candidateKey = recipientIdentityKey({
      email,
      behalfLabel: behalf?.displayLabel,
    })
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )
    if (existingMatch?.revokedAt) {
      setAddError(
        "Tento příjemce byl ze seznamu zrušen. Použijte tlačítko „Vrátit“ u něj níže."
      )
      return
    }
    if (existingMatch) {
      setAddError("Tento příjemce už je v seznamu.")
      return
    }

    const responsibleName = selectedBehalfOption?.responsibleName
      ?.trim()
      .toLowerCase()
    let representedOriginal = responsibleName
      ? recipients.find(
          (r) => !r.revokedAt && r.name.trim().toLowerCase() === responsibleName
        )
      : undefined

    let extraOriginalRecipient: Recipient | null = null
    if (selectedBehalfOption && !representedOriginal) {
      const resolved = resolveBehalfOriginalContact(selectedBehalfOption)
      if (resolved) {
        const resolvedEmail = resolved.email.trim().toLowerCase()
        const alreadyByEmail = recipients.find(
          (r) =>
            !r.revokedAt &&
            !r.behalfLabel &&
            r.email.trim().toLowerCase() === resolvedEmail
        )
        if (alreadyByEmail) {
          representedOriginal = alreadyByEmail
        } else {
          extraOriginalRecipient = {
            name: resolved.name,
            email: resolvedEmail,
            ...(resolved.position ? { position: resolved.position } : {}),
            ...(resolved.department ? { department: resolved.department } : {}),
          }
          representedOriginal = extraOriginalRecipient
        }
      }
    }

    setRecipients((prev) => [
      ...prev,
      ...(extraOriginalRecipient ? [extraOriginalRecipient] : []),
      {
        name: name || email,
        email,
        ...(position ? { position } : {}),
        ...(department ? { department } : {}),
        ...(behalf
          ? { behalfLabel: behalf.displayLabel, rowKeys: behalf.rowKeys }
          : {}),
        ...(representedOriginal
          ? { substituteForKey: recipientIdentityKey(representedOriginal) }
          : {}),
      },
    ])
    setSelectedKeys((prev) => {
      const next = new Set(prev).add(candidateKey)
      if (extraOriginalRecipient) {
        next.add(recipientIdentityKey(extraOriginalRecipient))
      }
      return next
    })
    if (!behalf && isLawSignatoryRecipient({ name, email })) {
      setDraftConflictOfInterest(true)
    }
    setNewName("")
    setNewEmail("")
    setNewPosition(undefined)
    setNewDepartment(undefined)
    setBehalfMode(false)
    setBehalfOf("")
    setCustomBehalfLabel("")
    setInfoTone("success")
    setInfo(`${name || email} byl(a) přidán(a) do návrhu seznamu.`)
  }

  function syncSectionBResponsibleIntoRecipients(
    nextName: string,
    nextEmail: string,
    nextPosition: string,
    nextDepartment: string
  ) {
    const email = nextEmail.trim().toLowerCase()
    const previousEmail = (sectionBResponsible?.email ?? "")
      .trim()
      .toLowerCase()

    if (!email || email === previousEmail) return

    const alreadyActive = recipients.some(
      (r) =>
        !r.revokedAt && !r.behalfLabel && r.email.trim().toLowerCase() === email
    )
    if (alreadyActive) return

    const previousEntry = previousEmail
      ? recipients.find(
          (r) =>
            !r.revokedAt &&
            !r.behalfLabel &&
            r.email.trim().toLowerCase() === previousEmail
        )
      : undefined

    if (previousEntry && !previousEntry.invitedAt) {
      const previousKey = recipientIdentityKey(previousEntry)
      const updated: Recipient = {
        ...previousEntry,
        name: nextName.trim() || email,
        email,
        position: nextPosition.trim() || undefined,
        department: nextDepartment.trim() || undefined,
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
        `${updated.name} byl(a) aktualizován(a) v návrhu seznamu jako odpovědná osoba za sekci B.`
      )
      return
    }

    const newRecipient: Recipient = {
      name: nextName.trim() || email,
      email,
      ...(nextPosition.trim() ? { position: nextPosition.trim() } : {}),
      ...(nextDepartment.trim() ? { department: nextDepartment.trim() } : {}),
    }
    setRecipients((prev) => [...prev, newRecipient])
    setSelectedKeys((prev) =>
      new Set(prev).add(recipientIdentityKey(newRecipient))
    )
    setInfoTone("success")
    setInfo(
      `${newRecipient.name} byl(a) přidán(a) do návrhu seznamu jako odpovědná osoba za sekci B.`
    )
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

  function handlePersonSelected(employee: EmployeeItem) {
    setNewName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setNewEmail(employee.email ?? "")
    setNewPosition(employee.positionName || undefined)
    setNewDepartment(employee.department || undefined)
    setAddError(null)
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

  function selectAll() {
    setSelectedKeys(
      new Set(activeRecipients.map((r) => recipientIdentityKey(r)))
    )
  }

  function selectNone() {
    setSelectedKeys(new Set())
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
    setAddError(null)
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

  async function confirmEdit(target: Recipient) {
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

    if (
      candidateKey !== targetKey &&
      recipients.some((r) => recipientIdentityKey(r) === candidateKey)
    ) {
      setEditError("Tento e-mail už je v seznamu.")
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

    if (!target.invitedAt) {
      setRecipients(next)
      setSelectedKeys((prev) => {
        if (!prev.has(targetKey)) return prev
        const updated = new Set(prev)
        updated.delete(targetKey)
        updated.add(candidateKey)
        return updated
      })
      setEditingKey(null)
      return
    }

    try {
      await saveRecipients(next.filter((r) => r.invitedAt || r.revokedAt))
      setInfoTone("success")
      setInfo("Údaje příjemce byly upraveny.")
      setEditingKey(null)
      await loadRecipients()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Úprava se nezdařila.")
    }
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

  async function saveRecipients(next: Recipient[]) {
    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/signature-recipients`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "replace",
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

  async function restoreRecipient(target: Recipient) {
    const targetKey = recipientIdentityKey(target)
    if (restoringKey) return

    setRestoringKey(targetKey)
    setError(null)
    try {
      const next = recipients.map((r) =>
        recipientIdentityKey(r) === targetKey
          ? { ...r, revokedAt: undefined }
          : r
      )

      await saveRecipients(next)

      setInfoTone("success")
      setInfo(
        "Příjemce byl vrácen zpět do seznamu osob k podpisu – pozvánka se znovu neodesílá, ale opět se mu budou chodit připomínky a smí podepisovat."
      )
      await loadRecipients()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vrácení se nezdařilo.")
    } finally {
      setRestoringKey(null)
    }
  }

  async function resendInvite(target: Recipient) {
    const targetKey = recipientIdentityKey(target)
    if (resendingKey) return

    setResendingKey(targetKey)
    setError(null)
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
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? "Nepodařilo se odeslat pozvánku.")
      }
      setInfoTone("success")
      setInfo(`Pozvánka byla znovu odeslána na ${target.email}.`)
      await loadRecipients()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nepodařilo se odeslat pozvánku."
      )
    } finally {
      setResendingKey(null)
    }
  }

  async function cancelSubstitute(substitute: Recipient) {
    const key = recipientIdentityKey(substitute)
    if (substituteActionKey) return

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

    setSubstituteActionKey(key)
    setError(null)
    try {
      const originalRecord = substitute.substituteForKey
        ? recipients.find(
            (r) => recipientIdentityKey(r) === substitute.substituteForKey
          )
        : undefined

      const next = recipients.map((r) =>
        recipientIdentityKey(r) === key
          ? {
              ...r,
              substituteForKey: undefined,
              revokedAt: new Date().toISOString(),
            }
          : r
      )

      await saveRecipients(next)

      if (originalRecord?.email) {
        try {
          await fetch(
            `/api/odchody/${offboardingId}/exit-checklist/signature-substitute`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "remove",
                originalEmail: originalRecord.email,
                originalName: originalRecord.name,
                originalBehalfLabel: originalRecord.behalfLabel,
                substituteEmail: substitute.email,
                substituteName: substitute.name,
                substitutePosition: substitute.position,
                substituteDepartment: substitute.department,
              }),
            }
          )
        } catch {}
      }

      setInfoTone("success")
      setInfo(
        "Zastoupení bylo zrušeno – oběma stranám byla odeslána informace."
      )
      await loadRecipients()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Zrušení zastoupení se nezdařilo."
      )
    } finally {
      setSubstituteActionKey(null)
    }
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
    if (existingMatch?.revokedAt) {
      setSubstituteError(
        "Tento náhradník byl ze seznamu zrušen. Použijte tlačítko „Vrátit“ u něj níže."
      )
      return
    }
    if (existingMatch) {
      setSubstituteError("Tento náhradník už je v seznamu.")
      return
    }

    setRecipients((prev) => [
      ...prev,
      {
        name: name || email,
        email,
        ...(position ? { position } : {}),
        ...(department ? { department } : {}),
        behalfLabel,
        rowKeys: substituteTarget.rowKeys ?? [],
        substituteForKey: recipientIdentityKey(substituteTarget),
      },
    ])
    setSelectedKeys((prev) => new Set(prev).add(candidateKey))
    setInfoTone("success")
    setInfo(
      `${name || email} byl(a) přidán(a) jako zástupce za ${substituteTarget.name} – zaškrtnutý/á, pošle se mu/jí pozvánka až po potvrzení seznamu.`
    )
    setSubstituteTarget(null)
    setSubstituteName("")
    setSubstituteEmail("")
    setSubstituteError(null)
  }

  function handleConfirmClick() {
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

      for (const r of toInviteNew) {
        try {
          const original = r.substituteForKey
            ? recipients.find(
                (candidate) =>
                  recipientIdentityKey(candidate) === r.substituteForKey
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
                      behalfOfDisplayLabel: r.behalfLabel,
                      behalfOfRowKeys: r.rowKeys ?? [],
                      behalfOfPosition: original?.position ?? null,
                      behalfOfDepartment: original?.department ?? null,
                      behalfOfEmail: original?.email ?? null,
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
          resultByKey.set(recipientIdentityKey(r), { status: "fulfilled" })
        } catch (err) {
          resultByKey.set(recipientIdentityKey(r), {
            status: "rejected",
            error:
              err instanceof Error ? err : new Error("Chyba při odesílání."),
          })
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
          await saveRecipients(recipientsToPersist)
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

  function renderResponsibleCard(args: {
    title: string
    colorClass: string
    note?: string
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
  }) {
    return (
      <div className={`rounded-lg border p-3 ${args.colorClass}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
            {args.title}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={args.onToggleEdit}
          >
            <Pencil className="size-3" />
            {args.editing ? "Hotovo" : "Upravit"}
          </Button>
        </div>

        {args.editing ? (
          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1 bg-background text-xs"
              onClick={args.onOpenPicker}
            >
              <Search className="size-3" />
              Vybrat z EOS
            </Button>
            <Input
              value={args.name}
              onChange={(e) => args.onNameChange(e.target.value)}
              placeholder="Jméno a příjmení"
              className="h-8 bg-background py-1 text-xs"
            />
            <Input
              value={args.position}
              onChange={(e) => args.onPositionChange(e.target.value)}
              placeholder="Pozice"
              className="h-8 bg-background py-1 text-xs"
            />
            <Input
              value={args.department}
              onChange={(e) => args.onDepartmentChange(e.target.value)}
              placeholder="Odbor"
              className="h-8 bg-background py-1 text-xs"
            />
            <Input
              type="email"
              value={args.email}
              onChange={(e) => args.onEmailChange(e.target.value)}
              placeholder="email@praha6.cz"
              className="h-8 bg-background py-1 text-xs"
            />
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {args.name || "—"}
            </p>
            {(args.position || args.department) && (
              <p className="text-xs text-muted-foreground">
                {[args.position, args.department].filter(Boolean).join(" — ")}
              </p>
            )}
            <p className="font-mono text-xs text-muted-foreground">
              {args.email || "—"}
            </p>
          </div>
        )}

        {args.note && (
          <p className="mt-2 text-[11px] text-muted-foreground">{args.note}</p>
        )}
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
                  Každému zde uvedenému chodí připomínky k podpisu jeho
                  konkrétní role (zaměstnanec, vedoucí, sekce B...), dokud
                  nepodepíše nebo ho odsud nezrušíte. Odškrtnutí po potvrzení
                  přesune osobu mezi zrušené – přestanou jí chodit připomínky a
                  nesmí dál podepisovat; kdykoliv ji můžete vrátit zpět, bez
                  nové pozvánky.
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <Label className="text-sm">
                  Obsahuje výstupní list střet zájmů?{" "}
                  <span className="text-red-500">*</span>{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (aktivuje/deaktivuje řádek Právního odboru k podpisu; pokud
                    už byl seznam osob odeslán, podle změny se Právní odbor
                    přidá nebo odebere a odešle se mu pozvánka nebo informace –
                    teprve po uložení tlačítkem dole)
                  </span>
                </Label>
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
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      id="dialog-conflict-yes"
                      value="yes"
                      disabled={sending}
                      className="bg-background"
                    />
                    <Label
                      htmlFor="dialog-conflict-yes"
                      className="cursor-pointer font-normal"
                    >
                      Ano
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      id="dialog-conflict-no"
                      value="no"
                      disabled={sending}
                      className="bg-background"
                    />
                    <Label
                      htmlFor="dialog-conflict-no"
                      className="cursor-pointer font-normal"
                    >
                      Ne
                    </Label>
                  </div>
                </RadioGroup>
                {coiDirty && (
                  <p className="text-[11px] text-amber-800">
                    Změna se uloží a případně odešle až tlačítkem Uložit dole.
                  </p>
                )}
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
                  {hasExistingList ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                      Naposledy potvrzeno
                      {lastSentAt
                        ? ` ${new Date(lastSentAt).toLocaleDateString("cs-CZ")}${
                            lastSentByName ? `, ${lastSentByName}` : ""
                          }`
                        : ""}
                      . Zaškrtnutím/odškrtnutím upravíte seznam. Potvrďte
                      tlačítkem Uložit dole. Jednotlivci pošlete pozvánku znovu
                      tlačítkem „Odeslat znovu“ u něj.
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Zatím nebyl potvrzen žádný seznam. Níže je navržený
                      výchozí seznam podle role – uprav ho podle potřeby a
                      potvrď odesláním.
                    </div>
                  )}

                  {hasExistingList &&
                    (pendingNewInvites > 0 || pendingRemovals > 0) && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          Seznam má neodeslané změny (
                          {[
                            pendingNewInvites > 0
                              ? `přidat ${pendingNewInvites}`
                              : null,
                            pendingRemovals > 0
                              ? `odebrat ${pendingRemovals}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                          ). Potvrďte tlačítkem „Potvrdit seznam“ níže.
                        </span>
                      </div>
                    )}

                  <div className="space-y-3 rounded-md border-2 border-dashed border-[#00847C]/40 bg-[#00847C]/5 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Label className="text-sm font-semibold">
                        <UserPlus className="mr-1.5 inline size-4" />
                        Přidat příjemce do seznamu
                      </Label>
                      <Button
                        type="button"
                        size="default"
                        className="gap-1.5 bg-[#00847C] font-semibold text-white shadow-sm hover:bg-[#0B6D73]"
                        onClick={() => setPickerOpen(true)}
                      >
                        <Search className="size-4" />
                        Vybrat zaměstnance z EOS
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        placeholder="Celé jméno (nepovinné)"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value)
                          setNewPosition(undefined)
                          setNewDepartment(undefined)
                        }}
                        className="h-8 bg-background py-1 text-sm"
                      />
                      <Input
                        placeholder="email@praha6.cz"
                        value={newEmail}
                        onChange={(e) => {
                          setNewEmail(e.target.value)
                          setAddError(null)
                          setNewPosition(undefined)
                          setNewDepartment(undefined)
                        }}
                        className="h-8 bg-background py-1 text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-3 py-2">
                      <Checkbox
                        id="behalf-mode"
                        className="bg-background"
                        checked={behalfMode}
                        onCheckedChange={(checked) => {
                          setBehalfMode(checked === true)
                          setAddError(null)
                        }}
                      />
                      <Label
                        htmlFor="behalf-mode"
                        className="cursor-pointer text-sm font-medium text-purple-800"
                      >
                        Přidat jako zastupujícího za{" "}
                        <span className="font-normal text-purple-700">
                          (podepíše místo jiné zodpovědné osoby / odboru –
                          dostane odlišný e-mail s pozvánkou)
                        </span>
                      </Label>
                    </div>

                    {behalfMode && (
                      <div className="space-y-1">
                        <Label>
                          Podepisuje v zastoupení za{" "}
                          <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={behalfOf}
                          onValueChange={(value) => {
                            setBehalfOf(value)
                            setAddError(null)
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Vyberte zodpovědnou osobu / odbor…" />
                          </SelectTrigger>
                          <SelectContent>
                            {behalfOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.selectLabel}
                              </SelectItem>
                            ))}
                            <SelectItem value={CUSTOM_BEHALF_VALUE}>
                              Vlastní popis (zadejte sami)
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {behalfOf === CUSTOM_BEHALF_VALUE ? (
                          <Input
                            placeholder="Např. Odbor dopravy – vedoucí oddělení"
                            value={customBehalfLabel}
                            onChange={(e) => {
                              setCustomBehalfLabel(e.target.value)
                              setAddError(null)
                            }}
                            className="h-8 py-1 text-sm"
                          />
                        ) : (
                          selectedBehalfOption && (
                            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                              Týká se závazků:{" "}
                              {formatObligations(
                                selectedBehalfOption.obligations
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {addError && (
                      <p className="text-xs text-red-600">{addError}</p>
                    )}

                    <Button
                      type="button"
                      className="w-full gap-1.5 bg-[#00847C] font-semibold text-white hover:bg-[#0B6D73] sm:w-auto"
                      onClick={() => void handleAdd()}
                    >
                      <Plus className="size-4" />
                      Přidat do seznamu
                    </Button>

                    <p className="text-[11px] text-muted-foreground">
                      Nově přidaný příjemce se rovnou zaškrtne k odeslání –
                      teprve hlavním tlačítkem „Uložit“ dole se mu skutečně
                      pošle pozvánka a seznam se uloží.
                    </p>

                    <EosPersonPickerDialog
                      open={pickerOpen}
                      onOpenChange={setPickerOpen}
                      title="Vybrat zaměstnance"
                      onSelect={handlePersonSelected}
                      excludeActiveOffboardings={false}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>
                        Příjemci{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({activeRecipients.length}, vybráno{" "}
                          {checkedActiveCount})
                        </span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 bg-background text-xs"
                          onClick={selectAll}
                        >
                          Vybrat vše
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 bg-background text-xs"
                          onClick={selectNone}
                        >
                          Zrušit výběr
                        </Button>
                      </div>
                    </div>

                    {removalLocked && (
                      <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        {removalLockedReason}
                      </p>
                    )}

                    <div className="rounded-md border p-2">
                      {activeRecipients.length === 0 && (
                        <p className="py-3 text-center text-xs text-muted-foreground">
                          Žádní příjemci. Přidejte je níže.
                        </p>
                      )}

                      {activeRecipients.map((r) => {
                        const key = recipientIdentityKey(r)
                        const invitedLabel = formatDateTime(r.invitedAt)
                        const sendError = sendErrors.get(key)
                        const checked = selectedKeys.has(key)
                        const willBeRemoved = r.invitedAt && !checked
                        const willBeConfirmed = r.invitedAt && checked
                        const substitute = substitutesByOriginalKey.get(key)
                        const canOfferSubstitute =
                          checked &&
                          !r.substituteForKey &&
                          !r.behalfLabel &&
                          !substitute
                        const hasSigned = signedEmailSet.has(
                          r.email.trim().toLowerCase()
                        )
                        const checkboxLocked =
                          removalLocked && Boolean(r.invitedAt) && checked
                        const isSubstituteRow = Boolean(r.substituteForKey)
                        const representedOriginal = r.substituteForKey
                          ? recipients.find(
                              (candidate) =>
                                recipientIdentityKey(candidate) ===
                                r.substituteForKey
                            )
                          : undefined
                        const representedLabel = representedOriginal
                          ? [
                              representedOriginal.name,
                              formatPositionDepartment(
                                representedOriginal.position,
                                representedOriginal.department
                              ),
                            ]
                              .filter(Boolean)
                              .join(", ")
                          : r.behalfLabel
                        const substituteLabel = substitute
                          ? [
                              substitute.name,
                              formatPositionDepartment(
                                substitute.position,
                                substitute.department
                              ),
                            ]
                              .filter(Boolean)
                              .join(", ")
                          : null
                        const isActingOnBehalf = Boolean(r.behalfLabel)
                        const nameColorClass = willBeRemoved
                          ? "text-muted-foreground line-through"
                          : isActingOnBehalf
                            ? !r.invitedAt
                              ? "text-muted-foreground"
                              : "text-purple-700"
                            : willBeConfirmed
                              ? "text-emerald-700"
                              : !r.invitedAt
                                ? "text-muted-foreground"
                                : ""
                        const showEmailLine =
                          r.email.trim().toLowerCase() !==
                          r.name.trim().toLowerCase()

                        return (
                          <div
                            key={key}
                            className={`flex flex-wrap items-start justify-between gap-2 rounded-md border-t px-2 py-1.5 first:mt-0 first:border-t-0 hover:bg-muted/50 ${
                              substitute ? "opacity-80" : ""
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 basis-[200px] items-start gap-2">
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                disabled={checkboxLocked}
                                title={
                                  checkboxLocked
                                    ? removalLockedReason
                                    : undefined
                                }
                                onCheckedChange={() => toggleSelected(key)}
                              />
                              <div className="min-w-0 flex-1">
                                {editingKey === key ? (
                                  <div className="flex flex-col gap-1 sm:flex-row">
                                    <Input
                                      value={editName}
                                      onChange={(e) =>
                                        setEditName(e.target.value)
                                      }
                                      placeholder="Jméno"
                                      className="h-7 py-1 text-xs leading-4"
                                    />
                                    <Input
                                      value={editEmail}
                                      onChange={(e) =>
                                        setEditEmail(e.target.value)
                                      }
                                      placeholder="email@praha6.cz"
                                      className="h-7 py-1 text-xs leading-4"
                                    />
                                    <div className="flex shrink-0 gap-1">
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
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p
                                        className={`truncate text-sm font-medium ${nameColorClass}`}
                                      >
                                        {r.name}
                                      </p>
                                      {hasSigned && (
                                        <Badge
                                          variant="outline"
                                          className="shrink-0 border-sky-200 bg-sky-50 text-sky-800"
                                        >
                                          Podepsáno
                                        </Badge>
                                      )}
                                    </div>
                                    {showEmailLine && (
                                      <p className="truncate font-mono text-xs text-muted-foreground">
                                        {r.email}
                                      </p>
                                    )}
                                    <p className="truncate text-xs italic text-muted-foreground">
                                      {formatPositionDepartment(
                                        r.position,
                                        r.department
                                      ) || "—"}
                                    </p>
                                  </>
                                )}
                                {editingKey === key && editError && (
                                  <p className="mt-1 text-xs text-red-600">
                                    {editError}
                                  </p>
                                )}
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {r.behalfLabel && (
                                    <Badge
                                      variant="outline"
                                      className="border-emerald-200 bg-emerald-50 text-emerald-800"
                                    >
                                      Zastupuje za: {representedLabel}
                                    </Badge>
                                  )}
                                  {substitute && (
                                    <Badge
                                      variant="outline"
                                      className="border-purple-200 bg-purple-50 text-purple-700"
                                    >
                                      Zastupuje: {substituteLabel}
                                    </Badge>
                                  )}
                                  {willBeRemoved && (
                                    <Badge
                                      variant="outline"
                                      className="border-red-200 bg-red-50 text-red-700"
                                    >
                                      Bude odebráno po potvrzení
                                    </Badge>
                                  )}
                                  {checked && !r.invitedAt && (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-200 bg-amber-50 text-amber-800"
                                    >
                                      Čeká na odeslání
                                    </Badge>
                                  )}
                                  {invitedLabel && (
                                    <span className="text-[11px] text-muted-foreground">
                                      Pozvánka odeslána {invitedLabel}
                                    </span>
                                  )}
                                </div>
                                {sendError && (
                                  <p className="mt-1 text-xs text-red-600">
                                    {sendError}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {isSubstituteRow && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => void cancelSubstitute(r)}
                                  disabled={substituteActionKey === key}
                                >
                                  {substituteActionKey === key ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Repeat className="size-3" />
                                  )}
                                  Zrušit zastupování
                                </Button>
                              )}
                              {substitute && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() =>
                                    void cancelSubstitute(substitute)
                                  }
                                  disabled={
                                    substituteActionKey ===
                                    recipientIdentityKey(substitute)
                                  }
                                >
                                  {substituteActionKey ===
                                  recipientIdentityKey(substitute) ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Repeat className="size-3" />
                                  )}
                                  Zrušit zastoupení
                                </Button>
                              )}
                              {canOfferSubstitute && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-purple-300 text-xs text-purple-800 hover:bg-purple-50"
                                  onClick={() => {
                                    void (async () => {
                                      let target = r
                                      if (
                                        r.name.trim().toLowerCase() ===
                                        r.email.trim().toLowerCase()
                                      ) {
                                        const resolved =
                                          await lookupEmployeeByEmail(
                                            r.email.trim().toLowerCase()
                                          )
                                        if (resolved) {
                                          target = {
                                            ...r,
                                            name: resolved.name,
                                            position: resolved.position,
                                            department: resolved.department,
                                          }
                                          setRecipients((prev) =>
                                            prev.map((candidate) =>
                                              recipientIdentityKey(
                                                candidate
                                              ) === key
                                                ? {
                                                    ...candidate,
                                                    name: resolved.name,
                                                    position: resolved.position,
                                                    department:
                                                      resolved.department,
                                                  }
                                                : candidate
                                            )
                                          )
                                        }
                                      }
                                      setSubstituteTarget(target)
                                      setSubstituteName("")
                                      setSubstituteEmail("")
                                      setSubstituteError(null)
                                    })()
                                  }}
                                >
                                  <Repeat className="size-3" />
                                  Zastoupit
                                </Button>
                              )}
                              {willBeConfirmed && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 bg-background text-xs"
                                  onClick={() => void resendInvite(r)}
                                  disabled={resendingKey === key}
                                >
                                  {resendingKey === key ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Send className="size-3" />
                                  )}
                                  Odeslat znovu
                                </Button>
                              )}
                              {editingKey !== key && (
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
                              )}
                              {!r.invitedAt && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-red-200 bg-background text-xs text-red-600 hover:bg-red-50"
                                  onClick={() => requestRemovePending(r)}
                                >
                                  <Trash2 className="size-3" />
                                  Odebrat
                                </Button>
                              )}
                              {r.invitedAt && checked && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-red-200 bg-background text-xs text-red-600 hover:bg-red-50"
                                  onClick={() => toggleSelected(key)}
                                  disabled={checkboxLocked}
                                  title={
                                    checkboxLocked
                                      ? removalLockedReason
                                      : undefined
                                  }
                                >
                                  <Trash2 className="size-3" />
                                  Odebrat
                                </Button>
                              )}
                              {sendError && (
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-red-200 bg-red-50 text-red-700"
                                >
                                  <XCircle className="size-3" />
                                  Chyba
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {revokedRecipients.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-normal text-muted-foreground">
                        Zrušení příjemci ({revokedRecipients.length})
                      </Label>

                      <div className="space-y-1 rounded-md border border-dashed p-2">
                        {revokedRecipients.map((r) => {
                          const revokedLabel = formatDateTime(r.revokedAt)
                          const key = recipientIdentityKey(r)
                          const representedOriginal = r.substituteForKey
                            ? recipients.find(
                                (candidate) =>
                                  recipientIdentityKey(candidate) ===
                                  r.substituteForKey
                              )
                            : undefined
                          const representedLabel = representedOriginal
                            ? [
                                representedOriginal.name,
                                formatPositionDepartment(
                                  representedOriginal.position,
                                  representedOriginal.department
                                ),
                              ]
                                .filter(Boolean)
                                .join(", ")
                            : r.behalfLabel

                          return (
                            <div
                              key={key}
                              className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 opacity-70 hover:bg-muted/50 hover:opacity-100"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {r.name}
                                </p>
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                  {r.email}
                                </p>
                                <p className="truncate text-xs italic text-muted-foreground">
                                  {formatPositionDepartment(
                                    r.position,
                                    r.department
                                  ) || "—"}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {r.behalfLabel && (
                                    <Badge
                                      variant="outline"
                                      className="border-emerald-200 bg-emerald-50 text-emerald-800"
                                    >
                                      Zastupuje za: {representedLabel}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="border-red-200 bg-red-50 text-red-700"
                                  >
                                    Zrušeno
                                    {revokedLabel ? ` ${revokedLabel}` : ""}
                                  </Badge>
                                </div>
                              </div>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0 gap-1.5 text-xs"
                                onClick={() => void restoreRecipient(r)}
                                disabled={restoringKey === key}
                                title="Vrátit do seznamu příjemců"
                              >
                                {restoringKey === key ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="size-3" />
                                )}
                                Vrátit
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {substituteTarget && (
                <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <p className="font-medium">
                    Zastoupení za {substituteTarget.name}
                  </p>
                  <p className="text-xs">
                    Po potvrzení tlačítkem dole se odešlou dvě zprávy: nově
                    vybranému zástupci pozvánka k podpisu a{" "}
                    {substituteTarget.name} informace, že ho/ji nyní někdo
                    zastupuje – {substituteTarget.name} může výstupní list dál
                    podepsat i sám/sama.
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
              )}

              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-semibold text-foreground">
                  Odpovědné osoby (sekce B, sekce C, kontakt KITT6)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Úpravy karet se uloží a případně odešlou až hlavním tlačítkem
                  Uložit dole.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {renderResponsibleCard({
                    title: "Sekce B – majetek",
                    colorClass: "border-amber-200 bg-amber-50",
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
                  })}

                  {renderResponsibleCard({
                    title: "Sekce C – vedoucí odboru",
                    colorClass: "border-sky-200 bg-sky-50",
                    note: "Propojeno se záznamem odchodu – změna zde se projeví i u vedoucího v samotném výstupním listu, a naopak.",
                    editing: managerCardEditing,
                    onToggleEdit: () => setManagerCardEditing((prev) => !prev),
                    onOpenPicker: () => setManagerContactPickerOpen(true),
                    name: respManagerName,
                    position: respManagerPosition,
                    department: respManagerDepartment,
                    email: respManagerEmail,
                    onNameChange: setRespManagerName,
                    onPositionChange: setRespManagerPosition,
                    onDepartmentChange: setRespManagerDepartment,
                    onEmailChange: setRespManagerEmail,
                  })}
                </div>

                {renderResponsibleCard({
                  title:
                    "Kontakt KITT6 (volba „KITT6 předá na jiné funkční místo“ v sekci C)",
                  colorClass: "border-violet-200 bg-violet-50",
                  editing: kitt6CardEditing,
                  onToggleEdit: () => setKitt6CardEditing((prev) => !prev),
                  onOpenPicker: () => setKitt6PickerOpen(true),
                  name: respKitt6Name,
                  position: respKitt6Position,
                  department: respKitt6Department,
                  email: respKitt6Email,
                  onNameChange: setRespKitt6Name,
                  onPositionChange: setRespKitt6Position,
                  onDepartmentChange: setRespKitt6Department,
                  onEmailChange: setRespKitt6Email,
                })}

                <EosPersonPickerDialog
                  open={sectionBPickerOpen}
                  onOpenChange={setSectionBPickerOpen}
                  title="Vybrat odpovědnou osobu za sekci B"
                  onSelect={handleSectionBPersonSelected}
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
                Uložit (odeslat {toInviteNew.length}, odebrat {toRevoke.length})
              </>
            ) : toRevoke.length > 0 ? (
              <>
                <Send className="size-4" />
                Uložit (odebrat {toRevoke.length})
              </>
            ) : toInviteNew.length > 0 ? (
              <>
                <Send className="size-4" />
                Uložit (odeslat {toInviteNew.length})
              </>
            ) : (
              <>
                <Send className="size-4" />
                Uložit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

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
              {signedRemovalConfirm?.map((r) => r.name).join(", ")} již
              podepsal(a) výstupní list. Odebráním ze seznamu osob k podpisu se
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

      <AlertDialog
        open={closeConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCloseConfirmOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uložit neuložené změny?</AlertDialogTitle>
            <AlertDialogDescription>
              V okně jsou neuložené změny (seznam příjemců, střet zájmů nebo
              odpovědné osoby), které ještě nebyly potvrzené tlačítkem Uložit –
              nikomu se nic neposlalo. Chcete je uložit a případně odeslat
              e-maily, nebo je zahodit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCloseConfirmOpen(false)}>
              Zůstat
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={discardAndClose}
            >
              Zavřít bez uložení
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={() => {
                setCloseConfirmOpen(false)
                handleConfirmClick()
              }}
            >
              Uložit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
