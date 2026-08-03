"use client"

import { useMemo, useState } from "react"
import { Mail } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { CombinedReportModal } from "@/components/emails/combined-report-modal"

type Audience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES"
type RecordKind = "planned" | "actual"
type LaunchContext = "nastupy" | "odchody" | "zmeny"

function ym(d = new Date()) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

export function CombinedReportLauncher({
  defaultAudience = "ONBOARDING_GROUP",
  defaultKind = "actual",
  context = "nastupy",
  defaultMonth,
  label = "Zaslat měsíční report",
  className,
}: {
  defaultAudience?: Audience
  defaultKind?: RecordKind
  context?: LaunchContext
  defaultMonth?: string
  label?: string
  className?: string
}) {
  const [openSignal, setOpenSignal] = useState<number>(0)
  const month = useMemo(() => defaultMonth ?? ym(), [defaultMonth])

  const colorClass = useMemo(() => {
    if (context === "odchody") {
      return defaultKind === "actual"
        ? "bg-red-600 hover:bg-red-700 text-white"
        : "bg-orange-600 hover:bg-orange-700 text-white"
    }

    if (context === "zmeny") {
      return "bg-purple-600 hover:bg-purple-700 text-white"
    }

    return defaultKind === "actual"
      ? "bg-green-600 hover:bg-green-700 text-white"
      : "bg-blue-600 hover:bg-blue-700 text-white"
  }, [context, defaultKind])

  return (
    <>
      <Button
        className={cn(colorClass, className)}
        onClick={() => setOpenSignal(Date.now())}
      >
        <Mail className="mr-2 size-4" />
        {label}
      </Button>

      <CombinedReportModal
        openSignal={openSignal}
        defaultMonth={month}
        defaultAudience={defaultAudience}
        defaultKind={defaultKind}
        context={context}
      />
    </>
  )
}
