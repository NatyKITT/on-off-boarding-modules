"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

type SavingButtonLabelProps = {
  saving: boolean
  savingText: string
  idleText: ReactNode
}

export function SavingButtonLabel({
  saving,
  savingText,
  idleText,
}: SavingButtonLabelProps) {
  if (!saving) return <>{idleText}</>

  return (
    <>
      <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin" />
      {savingText}
    </>
  )
}
