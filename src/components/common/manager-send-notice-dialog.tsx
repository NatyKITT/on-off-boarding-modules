"use client"

import * as React from "react"
import { Mail } from "lucide-react"

import { useToast } from "@/hooks/use-toast"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

type ManagerSendNoticeDialogProps = {
  kind: "ONBOARDING" | "OFFBOARDING"
  recordId: number
  employeeName: string
  hasManager: boolean
  disabled?: boolean
}

type NoticeInfo = {
  alreadySent: boolean
  lastSentAt: string | null
  lastSentBy: string | null
}

export function ManagerSendNoticeDialog({
  kind,
  recordId,
  employeeName,
  hasManager,
  disabled,
}: ManagerSendNoticeDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [loadingInfo, setLoadingInfo] = React.useState(false)
  const [info, setInfo] = React.useState<NoticeInfo | null>(null)
  const [sending, setSending] = React.useState(false)

  const endpoint =
    kind === "ONBOARDING"
      ? `/api/nastupy/${recordId}/notify-manager`
      : `/api/odchody/${recordId}/notify-manager`

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)

    if (!nextOpen) return

    setInfo(null)
    setLoadingInfo(true)

    try {
      const res = await fetch(endpoint)
      const json = await res.json().catch(() => null)

      setInfo({
        alreadySent: Boolean(json?.alreadySent),
        lastSentAt: json?.lastSentAt ?? null,
        lastSentBy: json?.lastSentBy ?? null,
      })
    } catch {
      setInfo({ alreadySent: false, lastSentAt: null, lastSentBy: null })
    } finally {
      setLoadingInfo(false)
    }
  }

  async function handleConfirm() {
    try {
      setSending(true)

      const res = await fetch(endpoint, { method: "POST" })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Odeslání se nezdařilo.")
      }

      toast({
        title: "Hotovo",
        description: json?.message ?? "Informace byla odeslána.",
      })
    } catch (error) {
      toast({
        title: "Chyba při odesílání",
        description:
          error instanceof Error ? error.message : "Odeslání se nezdařilo.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasManager || disabled}
          title={
            hasManager
              ? "Odeslat vedoucímu odboru informaci o tomto záznamu"
              : "Nejprve zadejte vedoucího odboru"
          }
        >
          <Mail className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Odeslat informaci vedoucímu odboru
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {loadingInfo ? (
                <p>Zjišťuji, zda už byla informace odeslána…</p>
              ) : info?.alreadySent ? (
                <p>
                  Informace o tomto záznamu už vedoucímu odboru byla odeslána
                  {info.lastSentAt
                    ? ` dne ${new Date(info.lastSentAt).toLocaleString("cs-CZ")}`
                    : ""}
                  {info.lastSentBy ? ` (${info.lastSentBy})` : ""}. Chcete ji
                  poslat ještě jednou?
                </p>
              ) : (
                <p>
                  Vedoucímu odboru bude odeslán informační e-mail o zaměstnanci{" "}
                  {employeeName}.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Zrušit</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              void handleConfirm()
            }}
            disabled={sending || loadingInfo}
          >
            {sending
              ? "Odesílám…"
              : info?.alreadySent
                ? "Odeslat znovu"
                : "Odeslat"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
