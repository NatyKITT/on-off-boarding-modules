"use client"

import { useState } from "react"
import { FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PdfReportModal } from "@/components/reports/pdf-report-modal"

type Props = {
  canSend: boolean
}

export function PdfReportLauncher({ canSend }: Props) {
  const [openSignal, setOpenSignal] = useState<number>(0)

  return (
    <>
      <Button
        variant="outline"
        title="Reporty"
        className="group flex h-12 shrink-0 items-center gap-2 rounded-full border-input bg-muted/40 px-3 shadow-sm transition-colors hover:bg-muted/70 sm:px-4"
        onClick={() => setOpenSignal(Date.now())}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#00847C]/10 text-[#00847C] transition-colors group-hover:bg-[#00847C]/15">
          <FileText className="size-4" />
        </span>
        <span className="hidden text-sm font-medium text-foreground sm:inline">
          Reporty
        </span>
      </Button>

      <PdfReportModal openSignal={openSignal} canSend={canSend} />
    </>
  )
}
