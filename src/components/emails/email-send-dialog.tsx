"use client"

import * as React from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type Mode = "row" | "monthly"

export function EmailSendDialog({
  mode,
  kind,
  id,
  defaultEmail,
  personName,
  monthYear,
  onNeedEditEmail,
  trigger,
}: {
  mode: Mode
  kind: "onboarding" | "offboarding"
  id?: number
  defaultEmail?: string
  personName?: string
  monthYear?: { year: number; month: number }
  onNeedEditEmail?: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [email, setEmail] = React.useState(defaultEmail ?? "")
  const [resultMessage, setResultMessage] = React.useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  React.useEffect(() => {
    if (open) {
      setEmail(defaultEmail ?? "")
      setResultMessage(null)
    }
  }, [open, defaultEmail])

  async function sendRow() {
    if (!id) return
    if (!email.trim()) {
      onNeedEditEmail?.()
      return
    }
    setSending(true)
    setResultMessage(null)
    try {
      const res = await fetch(
        `/api/${kind === "onboarding" ? "nastupy" : "odchody"}/${id}/odeslat-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        }
      )
      const j = await res.json().catch(() => null)
      if (!res.ok)
        throw new Error(j?.message ?? "Odeslání e-mailu se nezdařilo.")
      setResultMessage({ type: "success", text: "E-mail byl odeslán." })
      setTimeout(() => setOpen(false), 1200)
    } catch (e) {
      setResultMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Odeslání e-mailu se nezdařilo.",
      })
    } finally {
      setSending(false)
    }
  }

  async function sendMonthly() {
    if (!monthYear) return
    setSending(true)
    setResultMessage(null)
    try {
      const { year, month } = monthYear
      const res = await fetch(
        `/api/reporty/mesicni/odeslat-hned?year=${year}&month=${month}`,
        { method: "POST" }
      )
      const j = await res.json().catch(() => null)
      if (!res.ok)
        throw new Error(j?.message ?? "Odeslání reportu se nezdařilo.")
      setResultMessage({
        type: "success",
        text: "Měsíční souhrn byl odeslán.",
      })
      setTimeout(() => setOpen(false), 1200)
    } catch (e) {
      setResultMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Odeslání reportu se nezdařilo.",
      })
    } finally {
      setSending(false)
    }
  }

  const monthlyLabel = monthYear
    ? format(
        new Date(Date.UTC(monthYear.year, monthYear.month - 1, 1)),
        "LLLL yyyy",
        { locale: cs }
      )
    : ""

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="outline">Odeslat e-mail</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "row"
              ? "Odeslat e-mail zaměstnanci"
              : `Odeslat měsíční souhrn (${monthlyLabel})`}
          </DialogTitle>
        </DialogHeader>

        {mode === "row" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pošleme informační e-mail{" "}
              {personName ? (
                <>
                  pro <strong>{personName}</strong>
                </>
              ) : null}
              .
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium">
                E-mail (povinné pro odeslání)
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {resultMessage && (
              <div
                className={
                  resultMessage.type === "success"
                    ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                }
              >
                {resultMessage.text}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                Zrušit
              </Button>
              <Button onClick={() => void sendRow()} disabled={sending}>
                Odeslat
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Opravdu chcete odeslat souhrn skutečných nástupů a odchodů za{" "}
              <strong>{monthlyLabel}</strong>?
            </p>
            {resultMessage && (
              <div
                className={
                  resultMessage.type === "success"
                    ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                }
              >
                {resultMessage.text}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                Ne
              </Button>
              <Button onClick={() => void sendMonthly()} disabled={sending}>
                Ano, odeslat
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
