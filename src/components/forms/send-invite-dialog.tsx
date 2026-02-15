"use client"

import { useState } from "react"
import { CheckCircle2, ClipboardCopy, Loader2, Mail, Send } from "lucide-react"

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

type Props = {
  offboardingId: number
  employeeName: string
}

export function SendInviteDialog({ offboardingId, employeeName }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)
  const [emailFailed, setEmailFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setEmail("")
      setName("")
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
    if (!trimmedEmail) {
      setError("E-mailová adresa je povinná.")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setError("Zadaná e-mailová adresa není platná.")
      return
    }

    setSending(true)

    try {
      const res = await fetch(
        `/api/odchody/${offboardingId}/exit-checklist/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteeEmail: trimmedEmail,
            inviteeName: name.trim() || undefined,
          }),
        }
      )

      const json = (await res.json()) as {
        error?: string
        message?: string
        signUrl?: string
      }

      if (!res.ok && res.status !== 207) {
        throw new Error(json.error ?? "Nepodařilo se odeslat pozvánku.")
      }

      setSuccessUrl(json.signUrl ?? null)

      if (res.status === 207) {
        setEmailFailed(true)
        setError(json.error ?? "E-mail se nepodařilo odeslat.")
      } else {
        setEmail("")
        setName("")
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
          Odeslat k podpisu
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Odeslat k podpisu
          </DialogTitle>
          <DialogDescription>
            Příjemce obdrží e-mail s odkazem na výstupní list zaměstnance{" "}
            <strong>{employeeName}</strong>. Po přihlášení do systému může
            příslušné položky podepsat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="invite-email">
              E-mail příjemce <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="jmeno.prijmeni@praha6.cz"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSend()
              }}
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="invite-name">
              Jméno příjemce{" "}
              <span className="text-xs text-muted-foreground">
                (zobrazí se v e-mailu)
              </span>
            </Label>
            <Input
              id="invite-name"
              placeholder="Mgr. Jana Nováková"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={sending}
            />
          </div>

          {successUrl && !emailFailed && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3">
              <p className="flex items-center gap-2 text-sm text-green-800">
                <CheckCircle2 className="size-4 shrink-0" />
                Pozvánka byla úspěšně odeslána.
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
                E-mail se nepodařilo odeslat. Zkopírujte odkaz a zašlete jej
                ručně:
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
