"use client"

import { useMemo, useState } from "react"
import { Mail } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { EmployeeChangeReportModal } from "@/components/emails/employee-change-report-modal"

function ym(d = new Date()) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  return `${y}-${m}`
}

export function EmployeeChangeReportLauncher({
  defaultMonth,
  label = "Zaslat měsíční report",
  className,
}: {
  defaultMonth?: string
  label?: string
  className?: string
}) {
  const [openSignal, setOpenSignal] = useState<number>(0)
  const month = useMemo(() => defaultMonth ?? ym(), [defaultMonth])

  return (
    <>
      <Button
        className={cn(
          "bg-violet-600 text-white hover:bg-violet-700",
          className
        )}
        onClick={() => setOpenSignal(Date.now())}
      >
        <Mail className="mr-2 size-4" />
        {label}
      </Button>

      <EmployeeChangeReportModal openSignal={openSignal} defaultMonth={month} />
    </>
  )
}
