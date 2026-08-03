"use client"

import { History } from "lucide-react"

import { useCurrentRole } from "@/hooks/use-current-role"
import { canEditInternalApp } from "@/lib/rbac"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"

import { DocumentHistoryDialog } from "./document-history-dialog"

const REPORT_HISTORY_ACTION_LABEL: Record<string, string> = {
  SENT: "Odesláno",
  FAILED: "Odeslání selhalo",
  DOWNLOADED: "Staženo",
}

function reportHistoryActionLabel(action: string) {
  return REPORT_HISTORY_ACTION_LABEL[action] ?? action
}

export function ReportsHistoryButton({
  scope,
  title = "Historie reportů",
  label = "Historie",
  variant = "full",
  className,
}: {
  scope: "generic" | "monthly" | "changes" | "statistics" | "combined"
  title?: string
  label?: string
  variant?: "full" | "compact"
  className?: string
}) {
  const role = useCurrentRole()

  if (!canEditInternalApp(role)) return null

  return (
    <DocumentHistoryDialog
      title={title}
      fetchUrl={`/api/reports-history?scope=${scope}`}
      actionLabel={reportHistoryActionLabel}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5", className)}
        >
          <History className="size-4" />
          {variant === "full" ? label : null}
        </Button>
      }
    />
  )
}
