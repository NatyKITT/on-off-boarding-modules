"use client"

import { useMemo, useState } from "react"
import { Mail } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { MonthlyReportModal } from "@/components/emails/monthly-report-modal"

type TypeFilter = "nastupy" | "odchody"
type Kind = "planned" | "actual"

function ym(d = new Date()) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

export function MonthlyReportLauncher({
  initialType,
  kind,
  defaultMonth,
  label = "Zaslat měsíční report",
  className,
}: {
  initialType: TypeFilter
  kind: Kind
  defaultMonth?: string
  label?: string
  className?: string
}) {
  const [openSignal, setOpenSignal] = useState<number>(0)
  const month = useMemo(() => defaultMonth ?? ym(), [defaultMonth])

  const colorClass =
    initialType === "nastupy"
      ? kind === "planned"
        ? "bg-blue-600 hover:bg-blue-700 text-white"
        : "bg-green-600 hover:bg-green-700 text-white"
      : kind === "planned"
        ? "bg-orange-600 hover:bg-orange-700 text-white"
        : "bg-red-600 hover:bg-red-700 text-white"

  return (
    <>
      <Button
        className={cn(colorClass, className)}
        onClick={() => setOpenSignal(Date.now())}
      >
        <Mail className="mr-2 size-4" />
        {label}
      </Button>

      <MonthlyReportModal
        openSignal={openSignal}
        initialType={initialType}
        initialKind={kind}
        defaultMonth={month}
      />
    </>
  )
}
