"use client"

import * as React from "react"
import { type ComponentProps } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

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

type ButtonVariant = ComponentProps<typeof Button>["variant"]

type Props = {
  endpoint: string
  successEvent?: string
  refreshOnSuccess?: boolean
  title?: string
  description?: string
  className?: string
  size?: "sm" | "default" | "icon"
  /** NOVĚ: dovolí změnit vzhled (outline, destructive, …) */
  variant?: ButtonVariant
  /** NOVĚ: text v tlačítku */
  label?: string
}

export function ConfirmDeleteButton({
  endpoint,
  successEvent,
  refreshOnSuccess = false,
  title = "Smazat záznam",
  description = "Opravdu chcete smazat tento záznam?",
  className,
  size = "sm",
  variant = "destructive",
  label = "Smazat",
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
          variant={variant}
          className={cn(
            "inline-flex items-center justify-center gap-1",
            className
          )}
          title={label}
        >
          <Trash2 className="size-4" />
          <span className="hidden pt-1.5 sm:inline">{label}</span>
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
            {busy ? "Mažu…" : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
