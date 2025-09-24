"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

type Props = {
  endpoint: string
  successEvent?: string
  refreshOnSuccess?: boolean
  title?: string
  description?: string
  className?: string
  size?: "sm" | "default" | "icon"
}

export function ConfirmDeleteButton({
  endpoint,
  successEvent,
  refreshOnSuccess = false,
  title = "Smazat záznam",
  description = "Opravdu chcete smazat tento záznam?",
  className,
  size = "sm",
}: Props) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function handleConfirm() {
    try {
      setBusy(true)
      const res = await fetch(endpoint, { method: "DELETE" })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Mazání se nezdařilo.")
      }
      if (successEvent) {
        window.dispatchEvent(new CustomEvent(successEvent))
      }
      if (refreshOnSuccess) {
        router.refresh()
      }
      setOpen(false)
      alert("Záznam byl smazán.")
    } catch (e) {
      alert(e instanceof Error ? e.message : "Mazání se nezdařilo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size={size}
          variant="destructive"
          className={className}
          title="Smazat"
        >
          <Trash2 className="mr-2 size-4" />
          Smazat
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Zrušit</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={busy}>
            {busy ? "Mažu…" : "Smazat"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
