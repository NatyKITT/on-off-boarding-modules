"use client"

import * as React from "react"
import { ShieldAlert } from "lucide-react"

type Props = {
  fullName?: string
  position?: string
  unitName?: string
  department?: string
}

export function DocumentEmployeeHeader({
  fullName,
  position,
  unitName,
  department,
}: Props) {
  const lines = [
    fullName?.trim(),
    position?.trim(),
    [department?.trim(), unitName?.trim()].filter(Boolean).join(" • "),
  ].filter(Boolean)

  if (!lines.length) return null

  return (
    <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
      <div className="font-medium text-foreground">
        Tento formulář je určen pro:
      </div>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="mt-2 inline-flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4" />
        <div className="space-y-1">
          <p>
            Odkaz je určen pouze pro vás. Nepřeposílejte ho prosím další osobě.
          </p>
          <p>Vyplňujte údaje pravdivě a pouze za sebe.</p>
        </div>
      </div>
    </div>
  )
}
