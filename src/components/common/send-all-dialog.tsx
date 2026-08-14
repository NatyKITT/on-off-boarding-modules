"use client"

import { useMemo, useState } from "react"
import {
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Mail,
  Search,
  Send,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react"

import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

import {
  buildBehalfOptions,
  formatObligations,
} from "@/lib/exit-checklist-behalf-options"
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
import { joinNameWithTitles } from "@/lib/format-name"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EmployeeItem } from "@/components/common/employee-combobox"
import { EosPersonPickerDialog } from "@/components/common/eos-person-picker-dialog"

type Recipient = {
  name: string
  email: string
  status: "pending" | "sent" | "error"
  errorMsg?: string
  rowKeys?: string[]
  behalfLabel?: string
  invitedAt?: string
  revokedAt?: string
}

type Props = {
  offboardingId: number
  employeeName: string
  employeeEmail?: string | null
  publicToken: string
  conflictOfInterest: boolean
  positionNum?: string | null
  managerEmail?: string | null
  managerName?: string | null
}

function buildInitialRecipients(
  conflictOfInterest: boolean,
  employeeName: string,
  employeeEmail?: string | null,
  managerEmail?: string | null,
  managerName?: string | null
): Recipient[] {
  const base: Recipient[] = []

  if (employeeEmail?.trim()) {
    base.push({
      name: employeeName || employeeEmail,
      email: employeeEmail.trim(),
      status: "pending",
    })
  }

  const signatories = EXIT_CHECKLIST_SIGNATORIES.filter(
    (s) => s.emails.length > 0
  ).flatMap((s) =>
    s.emails.map((email) => ({
      name: s.name,
      email,
      status: "pending" as const,
    }))
  )

  base.push(...signatories)

  if (managerEmail?.trim()) {
    const idx = base.findIndex((r) => r.name === "Vedoucí odboru")
    if (idx >= 0) {
      base[idx] = {
        name: managerName ?? "Vedoucí odboru",
        email: managerEmail.trim(),
        status: "pending",
      }
    } else {
      base.splice(1, 0, {
        name: managerName ?? "Vedoucí odboru",
        email: managerEmail.trim(),
        status: "pending",
      })
    }
  } else {
    const empIdx = base.findIndex(
      (r) => r.name === "Vedoucí odboru" && r.email === ""
    )
    if (empIdx >= 0) base.splice(empIdx, 1)
  }

  if (conflictOfInterest) {
    LAW_SIGNATORY.emails.forEach((email) => {
      base.push({ name: LAW_SIGNATORY.name, email, status: "pending" })
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

export function SendAllDialog({
  offboardingId,
  employeeName,
  employeeEmail,
  publicToken,
  conflictOfInterest,
  managerEmail,
  managerName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [lastSentByName, setLastSentByName] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [behalfMode, setBehalfMode] = useState(false)
  const [behalfOf, setBehalfOf] = useState("")

  const behalfOptions = useMemo(
    () => buildBehalfOptions(managerName),
    [managerName]
  )

  const selectedBehalfOption = useMemo(
    () => behalfOptions.find((option) => option.value === behalfOf) ?? null,
    [behalfOf, behalfOptions]
  )

  const signUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/odchody-public/${publicToken}`
      : `/odchody-public/${publicToken}`

  async function handleOpen(next: boolean) {
    setOpen(next)
    if (!next) return

    setNewName("")
    setNewEmail("")
    setAddError(null)
    setDone(false)
    setSaveError(null)
    setLastSentAt(null)
    setLastSentByName(null)
    setBehalfMode(false)
    setBehalfOf("")
    setLoadingExisting(true)

    const fallback = () =>
      buildInitialRecipients(
        conflictOfInterest,
        employeeName,
        employeeEmail,
        managerEmail,
        managerName
      )

    try {
      const res = await fetch(`/api/odchody/${offboardingId}/exit-checklist`, {
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      const data = json?.data as
        | {
            signatureRecipients?: Array<{
              name: string
              email: string
              rowKeys?: string[]
              behalfLabel?: string
              invitedAt?: string
              revokedAt?: string
            }>
            signatureRecipientsSentAt?: string | null
            signatureRecipientsSentByName?: string | null
          }
        | undefined

      const existing = Array.isArray(data?.signatureRecipients)
        ? data.signatureRecipients
        : []

      const loaded =
        existing.length > 0
          ? existing.map((r) => ({
              name: r.name,
              email: r.email,
              status: "pending" as const,
              rowKeys: r.rowKeys,
              behalfLabel: r.behalfLabel,
              invitedAt: r.invitedAt,
              revokedAt: r.revokedAt,
            }))
          : fallback()

      setRecipients(loaded)
      setSelectedKeys(
        new Set(
          loaded
            .filter((r) => !r.invitedAt && !r.revokedAt)
            .map((r) => recipientIdentityKey(r))
        )
      )

      if (existing.length > 0) {
        setLastSentAt(data?.signatureRecipientsSentAt ?? null)
        setLastSentByName(data?.signatureRecipientsSentByName ?? null)
      }
    } catch {
      const loaded = fallback()
      setRecipients(loaded)
      setSelectedKeys(new Set(loaded.map((r) => recipientIdentityKey(r))))
    } finally {
      setLoadingExisting(false)
    }
  }

  function addRecipientEntry(
    name: string,
    email: string,
    behalf?: { displayLabel: string; rowKeys: string[] }
  ) {
    setAddError(null)
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()

    if (!cleanEmail) {
      setAddError("E-mail je povinný.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAddError("Zadejte platný e-mail.")
      return
    }
    const candidateKey = recipientIdentityKey({
      email: cleanEmail,
      behalfLabel: behalf?.displayLabel,
    })
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )
    if (existingMatch?.revokedAt) {
      setAddError(
        "Tento příjemce byl odebrán ze seznamu osob k podpisu. Vraťte ho v dialogu „Osoby k podpisu“."
      )
      return
    }
    if (existingMatch) {
      setAddError("Tento příjemce už je v seznamu.")
      return
    }

    setRecipients((prev) => [
      ...prev,
      {
        name: cleanName || cleanEmail,
        email: cleanEmail,
        status: "pending",
        ...(behalf
          ? { behalfLabel: behalf.displayLabel, rowKeys: behalf.rowKeys }
          : {}),
      },
    ])
    setSelectedKeys((prev) => new Set(prev).add(candidateKey))
    setNewName("")
    setNewEmail("")
    setBehalfMode(false)
    setBehalfOf("")
  }

  function addRecipient() {
    if (behalfMode && !selectedBehalfOption) {
      setAddError("Vyberte, za koho bude příjemce podepisovat.")
      return
    }

    addRecipientEntry(
      newName,
      newEmail,
      behalfMode && selectedBehalfOption
        ? {
            displayLabel: selectedBehalfOption.displayLabel,
            rowKeys: selectedBehalfOption.rowKeys,
          }
        : undefined
    )
  }

  function handlePersonSelected(employee: EmployeeItem) {
    const name = joinNameWithTitles({
      titleBefore: employee.titleBefore,
      name: employee.name,
      surname: employee.surname,
      titleAfter: employee.titleAfter,
    })
    setAddError(null)
    setNewName(name)
    setNewEmail(employee.email ?? "")
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelectedKeys(
      new Set(visibleRecipients.map((r) => recipientIdentityKey(r)))
    )
  }

  function selectNone() {
    setSelectedKeys(new Set())
  }

  async function removeRecipient(target: Recipient) {
    const targetKey = recipientIdentityKey(target)
    if (removingKey) return

    if (!target.invitedAt) {
      setRecipients((prev) =>
        prev.filter((r) => recipientIdentityKey(r) !== targetKey)
      )
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(targetKey)
        return next
      })
      setAddError(null)
      return
    }

    const activeCount = recipients.filter((r) => !r.revokedAt).length
    if (activeCount <= 1) {
      setAddError(
        "Nelze zrušit posledního aktivního příjemce – v seznamu musí zůstat alespoň jeden."
      )
      return
    }

    const next = recipients.map((r) =>
      recipientIdentityKey(r) === targetKey
        ? { ...r, revokedAt: new Date().toISOString() }
        : r
    )

    setRemovingKey(targetKey)
    setAddError(null)
    try {
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
            })),
          }),
        }
      )
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.message ?? "Zrušení se nezdařilo.")
      }
      setRecipients(next)
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        next.delete(targetKey)
        return next
      })
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Zrušení se nezdařilo.")
    } finally {
      setRemovingKey(null)
    }
  }

  async function handleSendSelected() {
    if (sending || selectedKeys.size === 0) return
    setSending(true)
    setSaveError(null)

    const toInvite = recipients.filter(
      (r) => selectedKeys.has(recipientIdentityKey(r)) && !r.revokedAt
    )

    const resultByKey = new Map<
      string,
      { status: "fulfilled" } | { status: "rejected"; error: Error }
    >()

    for (const r of toInvite) {
      try {
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
          error: err instanceof Error ? err : new Error("Chyba při odesílání."),
        })
      }
    }

    const sentAt = new Date().toISOString()

    const updatedRecipients = recipients.map((r) => {
      const key = recipientIdentityKey(r)
      if (!selectedKeys.has(key)) return r

      const result = resultByKey.get(key)
      if (result?.status === "fulfilled") {
        return { ...r, status: "sent" as const, invitedAt: sentAt }
      }
      return {
        ...r,
        status: "error" as const,
        errorMsg:
          result?.status === "rejected"
            ? result.error.message
            : "Chyba při odesílání.",
      }
    })

    setRecipients(updatedRecipients)

    const recipientsToPersist = updatedRecipients.filter(
      (r) => r.invitedAt || r.revokedAt
    )

    const saveRes =
      recipientsToPersist.length === 0
        ? null
        : await fetch(
            `/api/odchody/${offboardingId}/exit-checklist/signature-recipients`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "replace",
                recipients: recipientsToPersist.map((r) => ({
                  name: r.name,
                  email: r.email,
                  ...(r.rowKeys?.length ? { rowKeys: r.rowKeys } : {}),
                  ...(r.behalfLabel ? { behalfLabel: r.behalfLabel } : {}),
                  ...(r.invitedAt ? { invitedAt: r.invitedAt } : {}),
                  ...(r.revokedAt ? { revokedAt: r.revokedAt } : {}),
                })),
              }),
            }
          ).catch(() => null)

    if (recipientsToPersist.length > 0 && (!saveRes || !saveRes.ok)) {
      const json = await saveRes?.json().catch(() => null)
      setSaveError(
        json?.message ??
          "E-maily se odeslaly, ale uložení seznamu příjemců se nezdařilo. Zkuste to prosím znovu."
      )
    }

    setSending(false)
    setDone(true)
  }

  function copyLink() {
    void navigator.clipboard.writeText(signUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const visibleRecipients = recipients.filter((r) => !r.revokedAt)
  const revokedCount = recipients.length - visibleRecipients.length
  const sentCount = visibleRecipients.filter((r) => r.status === "sent").length
  const errorCount = visibleRecipients.filter(
    (r) => r.status === "error"
  ).length

  return (
    <Dialog open={open} onOpenChange={(next) => void handleOpen(next)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="gap-1 bg-[#00847C] text-white hover:bg-[#0B6D73]"
        >
          <Mail className="size-4" />
          Odeslat všem k podpisu
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[90svh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Mail className="size-5 shrink-0" />
            Odeslat výstupní list k podpisu
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Příjemci obdrží e-mail s odkazem na výstupní list zaměstnance{" "}
            <strong>{employeeName}</strong>.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
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

            {loadingExisting ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Načítám aktuální seznam příjemců…
              </div>
            ) : lastSentAt ? (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Toto je naposledy uložený seznam (
                {new Date(lastSentAt).toLocaleDateString("cs-CZ")}
                {lastSentByName ? `, ${lastSentByName}` : ""}). Zaškrtni, komu
                se má (znovu) odeslat, uprav podle potřeby a odešli – jen podle
                tohoto seznamu se řídí automatické připomínky.
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Zatím nebyl uložen žádný seznam. Níže je navržený výchozí seznam
                podle role – uprav ho podle potřeby a odešli pro potvrzení.
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Příjemci{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({visibleRecipients.length}, vybráno {selectedKeys.size}
                    {revokedCount > 0
                      ? `, odebráno ${revokedCount} – viz Osoby k podpisu`
                      : ""}
                    )
                  </span>
                </Label>
                {!done && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="text-muted-foreground underline-offset-2 hover:underline"
                      onClick={selectAll}
                    >
                      Vybrat vše
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground underline-offset-2 hover:underline"
                      onClick={selectNone}
                    >
                      Zrušit výběr
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {visibleRecipients.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    Žádní příjemci. Přidejte je níže.
                  </p>
                )}
                {visibleRecipients.map((r) => {
                  const key = recipientIdentityKey(r)
                  const parenMatch = r.name.match(/^(.+?)\s*\((.+)\)$/)
                  const displayName = parenMatch ? parenMatch[1].trim() : r.name
                  const displayDesc = parenMatch ? parenMatch[2].trim() : null
                  const invitedLabel = formatDateTime(r.invitedAt)

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {!done && (
                          <Checkbox
                            className="mt-0.5"
                            checked={selectedKeys.has(key)}
                            onCheckedChange={() => toggleSelected(key)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {displayName}
                          </p>
                          {displayDesc && (
                            <p className="truncate text-xs text-muted-foreground">
                              {displayDesc}
                            </p>
                          )}
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {r.email}
                          </p>
                          {r.behalfLabel && (
                            <p className="truncate text-[11px] text-purple-700">
                              v zastoupení za {r.behalfLabel}
                            </p>
                          )}
                          {invitedLabel && (
                            <p className="text-[11px] text-muted-foreground">
                              Odesláno {invitedLabel}
                            </p>
                          )}
                          {r.status === "error" && r.errorMsg && (
                            <p className="text-xs text-red-600">{r.errorMsg}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {r.status === "sent" && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-green-200 bg-green-50 text-green-700"
                          >
                            <CheckCircle2 className="size-3" />
                            Odesláno
                          </Badge>
                        )}
                        {r.status === "error" && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-red-200 bg-red-50 text-red-700"
                          >
                            <XCircle className="size-3" />
                            Chyba
                          </Badge>
                        )}
                        {!done && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 text-muted-foreground hover:text-red-600"
                            onClick={() => void removeRecipient(r)}
                            disabled={removingKey === key}
                            title="Odebrat ze seznamu osob k podpisu"
                          >
                            {removingKey === key ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {!done && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">
                    <UserPlus className="mr-1 inline size-3" />
                    Přidat dalšího příjemce
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Search className="size-3" />
                    Vybrat ze zaměstnanců
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Jméno (nepovinné)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="email@praha6.cz"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value)
                      setAddError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addRecipient()
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={addRecipient}
                  >
                    Přidat
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="send-all-behalf-mode"
                    checked={behalfMode}
                    onCheckedChange={(checked) => {
                      setBehalfMode(checked === true)
                      setAddError(null)
                    }}
                  />
                  <Label
                    htmlFor="send-all-behalf-mode"
                    className="text-xs font-normal text-muted-foreground"
                  >
                    Přidat v zastoupení (podepíše místo jiné zodpovědné osoby /
                    odboru – dostane odlišný e-mail s pozvánkou)
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
                          <SelectItem key={option.value} value={option.value}>
                            {option.selectLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedBehalfOption && (
                      <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                        Týká se závazků:{" "}
                        {formatObligations(selectedBehalfOption.obligations)}
                      </div>
                    )}
                  </div>
                )}

                {addError && <p className="text-xs text-red-600">{addError}</p>}
                <p className="text-[11px] text-muted-foreground">
                  Nově přidaný příjemce se rovnou zaškrtne k odeslání – teprve
                  tlačítkem &#34;Odeslat vybraným&#34; se mu skutečně pošle
                  pozvánka a seznam se uloží.
                </p>

                <EosPersonPickerDialog
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  title="Vybrat zaměstnance"
                  onSelect={handlePersonSelected}
                  excludeActiveOffboardings={false}
                />
              </div>
            )}

            {done && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <p className="font-medium">
                  Odesílání dokončeno — {sentCount}{" "}
                  {sentCount === 1 ? "příjemce" : "příjemců"} úspěšně
                  {errorCount > 0 && `, ${errorCount} se nepodařilo`}.
                </p>
                {errorCount > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Příjemcům označeným jako &#34;Chyba&#34; zašlete odkaz
                    ručně.
                  </p>
                )}
              </div>
            )}

            {saveError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {saveError}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t px-5 py-3">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpen(false)}
              disabled={sending}
            >
              {done ? "Zavřít" : "Zrušit"}
            </Button>

            {!done && (
              <Button
                type="button"
                className="gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]"
                onClick={() => void handleSendSelected()}
                disabled={sending || loadingExisting || selectedKeys.size === 0}
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Odesílám…
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Odeslat vybraným ({selectedKeys.size})
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
