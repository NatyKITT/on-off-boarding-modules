"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ClipboardCopy, Loader2, Mail, Send } from "lucide-react"

import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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

type Props = {
  offboardingId: number
  employeeName: string
  managerName?: string | null
}

type BehalfOption = {
  value: string
  departmentLabel: string
  responsibleName: string
  selectLabel: string
  displayLabel: string
  obligations: string[]
}

function cleanText(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function normalizeKey(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function stripOfficeInfo(value: string): string {
  return cleanText(value)
    .replace(/\s*[-–—]\s*č\.\s*dv\..*$/i, "")
    .replace(/\s*č\.\s*dv\..*$/i, "")
    .trim()
}

function looksLikePersonName(value: string): boolean {
  const cleaned = stripOfficeInfo(value)
  if (!cleaned) return false

  const lower = cleaned.toLowerCase()

  const nonPersonWords = [
    "odbor",
    "oddělení",
    "kancelář",
    "přízemí",
    "patro",
    "místnost",
    "správa objektu",
    "kitt6,",
    "dr. zikmunda",
  ]

  if (nonPersonWords.some((word) => lower.includes(word))) {
    return false
  }

  if (/^(mgr|ing|bc|mga|judr|mudr|phdr|rndr|doc|prof)\./i.test(cleaned)) {
    return true
  }

  const withoutTitles = cleaned
    .replace(/\b(mgr|ing|bc|mga|judr|mudr|phdr|rndr|doc|prof)\.\s*/gi, "")
    .replace(/\b(dis|ph\.d|csc)\.?\b/gi, "")
    .trim()

  const words = withoutTitles.split(/\s+/).filter(Boolean)

  return (
    words.length >= 2 &&
    words
      .slice(0, 2)
      .every((word) => /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+/.test(word))
  )
}

function splitOrganization(organization: string) {
  const lines = organization.split("\n").map(cleanText).filter(Boolean)
  const departmentLabel = lines[0] ?? cleanText(organization)

  return {
    departmentLabel,
    detailLines: lines.slice(1),
  }
}

function getResponsibleName(
  organization: string,
  managerName?: string | null
): string {
  const { departmentLabel, detailLines } = splitOrganization(organization)

  if (normalizeKey(departmentLabel) === normalizeKey("Vedoucí odboru")) {
    return cleanText(managerName) || "Vedoucí odboru"
  }

  const personLine = detailLines.find(looksLikePersonName)

  if (personLine) {
    return stripOfficeInfo(personLine)
  }

  return ""
}

function buildBehalfOptions(managerName?: string | null): BehalfOption[] {
  const optionsByKey = new Map<string, BehalfOption>()

  for (const row of EXIT_CHECKLIST_ROWS) {
    const { departmentLabel } = splitOrganization(row.organization)
    const responsibleName = getResponsibleName(row.organization, managerName)

    const groupKey = `${normalizeKey(departmentLabel)}|${normalizeKey(
      responsibleName
    )}`

    const obligation = cleanText(row.obligation)

    const existing = optionsByKey.get(groupKey)
    if (existing) {
      if (obligation && !existing.obligations.includes(obligation)) {
        existing.obligations.push(obligation)
      }
      continue
    }

    const displayLabel = responsibleName
      ? `${departmentLabel} — ${responsibleName}`
      : departmentLabel

    optionsByKey.set(groupKey, {
      value: groupKey,
      departmentLabel,
      responsibleName,
      selectLabel: displayLabel,
      displayLabel,
      obligations: obligation ? [obligation] : [],
    })
  }

  return Array.from(optionsByKey.values())
}

function formatObligations(obligations: string[]): string {
  if (obligations.length === 0) return "—"
  if (obligations.length <= 3) return obligations.join("; ")

  return `${obligations.slice(0, 3).join("; ")} a další ${
    obligations.length - 3
  }`
}

export function SendInviteBehalfDialog({
  offboardingId,
  employeeName,
  managerName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [behalfOf, setBehalfOf] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)
  const [emailFailed, setEmailFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  const behalfOptions = useMemo(
    () => buildBehalfOptions(managerName),
    [managerName]
  )

  const selectedOption = useMemo(
    () => behalfOptions.find((option) => option.value === behalfOf) ?? null,
    [behalfOf, behalfOptions]
  )

  function handleOpenChange(next: boolean) {
    setOpen(next)

    if (!next) {
      setEmail("")
      setName("")
      setBehalfOf("")
      setError(null)
      setSuccessUrl(null)
      setEmailFailed(false)
      setCopied(false)
    }
  }

  async function handleSend() {
    setError(null)
    setEmailFailed(false)

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (!trimmedEmail) {
      setError("E-mailová adresa je povinná.")
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Zadaná e-mailová adresa není platná.")
      return
    }

    if (!selectedOption) {
      setError("Vyberte, za koho bude příjemce podepisovat.")
      return
    }

    setSending(true)

    try {
      const res = await fetch(
        `/api/odchody/${offboardingId}/exit-checklist/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            inviteeEmail: trimmedEmail,
            inviteeName: trimmedName || undefined,
            isBehalf: true,

            // Kompatibilita se starším API.
            behalfOf: selectedOption.displayLabel,

            // Čisté hodnoty:
            // role = např. "Ředitel KITT6"
            // jméno = např. "Vladimír Šuvarina"
            // displayLabel = např. "Ředitel KITT6 — Vladimír Šuvarina"
            behalfOfRole: selectedOption.responsibleName
              ? selectedOption.departmentLabel
              : "",
            behalfOfName:
              selectedOption.responsibleName || selectedOption.departmentLabel,
            behalfOfDisplayLabel: selectedOption.displayLabel,
            behalfOfObligations: selectedOption.obligations,
          }),
        }
      )

      const json = (await res.json().catch(() => null)) as {
        error?: string
        message?: string
        signUrl?: string
      } | null

      if (!res.ok && res.status !== 207) {
        throw new Error(json?.error ?? "Nepodařilo se odeslat pozvánku.")
      }

      setSuccessUrl(json?.signUrl ?? null)

      if (res.status === 207) {
        setEmailFailed(true)
        setError(json?.error ?? "E-mail se nepodařilo odeslat.")
      } else {
        setEmail("")
        setName("")
        setBehalfOf("")
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nepodařilo se odeslat pozvánku."
      )
    } finally {
      setSending(false)
    }
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <Mail className="size-4" />
          Odeslat k podpisu v zastoupení
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Odeslat k podpisu v zastoupení
          </DialogTitle>
          <DialogDescription>
            Příjemce podepíše výstupní list zaměstnance{" "}
            <strong>{employeeName}</strong> v zastoupení za vybranou zodpovědnou
            osobu / odbor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="behalf-email">
              E-mail příjemce <span className="text-red-500">*</span>
            </Label>
            <Input
              id="behalf-email"
              type="email"
              placeholder="jmeno.prijmeni@praha6.cz"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="behalf-name">
              Jméno příjemce{" "}
              <span className="text-xs text-muted-foreground">(nepovinné)</span>
            </Label>
            <Input
              id="behalf-name"
              placeholder="Mgr. Jana Nováková"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <Label>
              Podepisuje v zastoupení za <span className="text-red-500">*</span>
            </Label>
            <Select
              value={behalfOf}
              onValueChange={(value) => {
                setBehalfOf(value)
                setError(null)
              }}
              disabled={sending}
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
          </div>

          {selectedOption && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-foreground">
                {selectedOption.displayLabel}
              </p>

              <p className="mt-1 text-muted-foreground">
                Role / odbor:{" "}
                <span className="font-medium text-foreground">
                  {selectedOption.departmentLabel}
                </span>
              </p>

              <p className="mt-1 text-muted-foreground">
                Zodpovědná osoba:{" "}
                <span className="font-medium text-foreground">
                  {selectedOption.responsibleName || "není uvedena"}
                </span>
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Týká se závazků: {formatObligations(selectedOption.obligations)}
              </p>
            </div>
          )}

          {successUrl && !emailFailed && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3">
              <p className="flex items-center gap-2 text-sm text-green-800">
                <CheckCircle2 className="size-4 shrink-0" />
                Pozvánka v zastoupení byla úspěšně odeslána.
              </p>
            </div>
          )}

          {error && !emailFailed && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {emailFailed && successUrl && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">
                E-mail se nepodařilo odeslat. Zkopírujte odkaz ručně:
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={successUrl}
                  className="h-7 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1"
                  onClick={() => copyUrl(successUrl)}
                >
                  <ClipboardCopy className="size-3" />
                  {copied ? "Zkopírováno" : "Kopírovat"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
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
              onClick={() => void handleSend()}
              disabled={sending}
            >
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Odesílám…
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Odeslat pozvánku
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
