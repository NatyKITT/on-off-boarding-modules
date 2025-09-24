"use client"

import * as React from "react"
import { Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type Kind = "onboarding" | "offboarding"

export interface SendEmailButtonProps {
  id: number
  kind: Kind
  email?: string | null
  onDone?: () => void
  onEditRequest?: () => void
  className?: string
}

export function SendEmailButton({
  id,
  kind,
  email,
  onDone,
  onEditRequest,
  className,
}: SendEmailButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const hasEmail = Boolean(email && String(email).trim() !== "")

  async function handleSend() {
    try {
      setBusy(true)
      const res = await fetch(
        kind === "onboarding"
          ? `/api/nastupy/${id}/odeslat-email`
          : `/api/odchody/${id}/odeslat-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hasEmail ? { email } : {}),
        }
      )
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message ?? "Odeslání se nezdařilo.")
      onDone?.()
      setOpen(false)
      alert("E-mail byl zařazen k odeslání.")
    } catch (e) {
      alert(e instanceof Error ? e.message : "Odeslání se nezdařilo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title="Odeslat e-mail"
          className={className}
        >
          <Mail className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Odeslat informační e-mail</DialogTitle>
        </DialogHeader>

        {hasEmail ? (
          <div className="space-y-2 text-sm">
            <p>
              Poslat e-mail na{" "}
              <span className="font-mono font-medium">{email}</span>?
            </p>
            <p className="text-muted-foreground">
              Zpráva bude obsahovat informace k{" "}
              {kind === "onboarding" ? "nástupu" : "odchodu"} podle záznamu.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="mb-2">
              V tomto záznamu chybí e-mail. Aby bylo možné zprávu poslat, doplň
              ho prosím v&nbsp;editaci záznamu.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Zavřít
          </Button>

          {hasEmail ? (
            <Button onClick={() => void handleSend()} disabled={busy}>
              {busy ? "Odesílám…" : "Odeslat"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                setOpen(false)
                onEditRequest?.()
              }}
            >
              Upravit formulář
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
