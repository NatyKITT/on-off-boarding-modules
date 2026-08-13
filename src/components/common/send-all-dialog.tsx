"use client"

import { useState } from "react"
import {
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Mail,
  Send,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react"

import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Recipient = {
  name: string
  email: string
  status: "pending" | "sent" | "error"
  errorMsg?: string
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

  return base
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
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const signUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/odchody-public/${publicToken}`
      : `/odchody-public/${publicToken}`

  function handleOpen(next: boolean) {
    setOpen(next)
    if (next) {
      setRecipients(
        buildInitialRecipients(
          conflictOfInterest,
          employeeName,
          employeeEmail,
          managerEmail,
          managerName
        )
      )
      setNewName("")
      setNewEmail("")
      setAddError(null)
      setDone(false)
    }
  }

  function addRecipient() {
    setAddError(null)
    const email = newEmail.trim().toLowerCase()
    const name = newName.trim()

    if (!email) {
      setAddError("E-mail je povinný.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddError("Zadejte platný e-mail.")
      return
    }
    if (recipients.some((r) => r.email.toLowerCase() === email)) {
      setAddError("Tento příjemce už je v seznamu.")
      return
    }

    setRecipients((prev) => [
      ...prev,
      { name: name || email, email, status: "pending" },
    ])
    setNewName("")
    setNewEmail("")
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r.email !== email))
  }

  async function handleSendAll() {
    if (sending) return
    setSending(true)

    const results = await Promise.allSettled(
      recipients.map(async (r) => {
        const res = await fetch(
          `/api/odchody/${offboardingId}/exit-checklist/invite`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inviteeEmail: r.email,
              inviteeName: r.name,
            }),
          }
        )
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        if (!res.ok && res.status !== 207) {
          throw new Error(json.error ?? "Nepodařilo se odeslat.")
        }
        return r.email
      })
    )

    setRecipients((prev) =>
      prev.map((r, i) => {
        const result = results[i]
        if (result.status === "fulfilled") return { ...r, status: "sent" }
        return {
          ...r,
          status: "error",
          errorMsg:
            result.reason instanceof Error
              ? result.reason.message
              : "Chyba při odesílání.",
        }
      })
    )

    await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/signature-recipients`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: recipients.map((r) => ({
            name: r.name,
            email: r.email,
          })),
        }),
      }
    ).catch(() => null)

    setSending(false)
    setDone(true)
  }

  function copyLink() {
    void navigator.clipboard.writeText(signUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const pendingCount = recipients.filter((r) => r.status === "pending").length
  const sentCount = recipients.filter((r) => r.status === "sent").length
  const errorCount = recipients.filter((r) => r.status === "error").length

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
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

            <div className="space-y-2">
              <Label>
                Příjemci{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({recipients.length})
                </span>
              </Label>

              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                {recipients.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    Žádní příjemci. Přidejte je níže.
                  </p>
                )}
                {recipients.map((r) => {
                  const parenMatch = r.name.match(/^(.+?)\s*\((.+)\)$/)
                  const displayName = parenMatch ? parenMatch[1].trim() : r.name
                  const displayDesc = parenMatch ? parenMatch[2].trim() : null
                  return (
                    <div
                      key={r.email}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
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
                        {r.status === "error" && r.errorMsg && (
                          <p className="text-xs text-red-600">{r.errorMsg}</p>
                        )}
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
                        {!done && r.status === "pending" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 text-muted-foreground hover:text-red-600"
                            onClick={() => removeRecipient(r.email)}
                            title="Odebrat"
                          >
                            <Trash2 className="size-3" />
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
                <Label className="text-xs font-medium">
                  <UserPlus className="mr-1 inline size-3" />
                  Přidat dalšího příjemce
                </Label>
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
                {addError && <p className="text-xs text-red-600">{addError}</p>}
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
                onClick={() => void handleSendAll()}
                disabled={sending || recipients.length === 0}
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Odesílám…
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Odeslat všem ({pendingCount})
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
