"use client"

import * as React from "react"

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
} from "@/components/ui/alert-dialog"

export type ManagerNotifyPromptReason =
  | "FIELDS_CHANGED"
  | "MANAGER_CHANGED"
  | "RECORD_CANCELLED"
  | "RECORD_DELETED"

export type ManagerNotifyPrompt = {
  kind: "ONBOARDING" | "OFFBOARDING"
  recordId: number
  reason: ManagerNotifyPromptReason
  changedFields?: string[]
} | null

type ManagerNotifyDialogProps = {
  prompt: ManagerNotifyPrompt
  onClose: () => void
}

const REASON_TEXT: Record<
  ManagerNotifyPromptReason,
  { title: string; description: string }
> = {
  FIELDS_CHANGED: {
    title: "Informovat vedoucího odboru o změně?",
    description:
      "U tohoto záznamu už byl vedoucímu odboru jednou odeslán informační e-mail. Chcete nyní odeslat e-mail i o této změně?",
  },
  MANAGER_CHANGED: {
    title: "Informovat o změně vedoucího odboru?",
    description:
      "U tohoto záznamu došlo ke změně vedoucího odboru. Chcete o tom e-mailem informovat původního vedoucího (o zrušení role u tohoto záznamu) i nového vedoucího (o přiřazení k tomuto záznamu)?",
  },
  RECORD_CANCELLED: {
    title: "Informovat vedoucího odboru o zrušení?",
    description:
      "Tento záznam byl zrušen. Vedoucímu odboru u něj už dříve byl odeslán informační e-mail – chcete odeslat i informaci o zrušení?",
  },
  RECORD_DELETED: {
    title: "Informovat vedoucího odboru o smazání?",
    description:
      "Tento záznam byl smazán. Vedoucímu odboru u něj už dříve byl odeslán informační e-mail – chcete odeslat i informaci o smazání?",
  },
}

export function ManagerNotifyDialog({
  prompt,
  onClose,
}: ManagerNotifyDialogProps) {
  const { toast } = useToast()
  const [sending, setSending] = React.useState(false)

  if (!prompt) return null

  const text = REASON_TEXT[prompt.reason]
  const endpoint =
    prompt.kind === "ONBOARDING"
      ? `/api/nastupy/${prompt.recordId}/notify-manager-change`
      : `/api/odchody/${prompt.recordId}/notify-manager-change`

  async function handleConfirm() {
    try {
      setSending(true)

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: prompt?.reason }),
      })

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
      onClose()
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{text.description}</p>
              {prompt.changedFields && prompt.changedFields.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {prompt.changedFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending} onClick={onClose}>
            Neposílat
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={sending}>
            {sending ? "Odesílám…" : "Odeslat informaci"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
