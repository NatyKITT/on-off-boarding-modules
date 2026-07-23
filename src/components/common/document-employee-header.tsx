"use client"

import * as React from "react"
import { ShieldAlert } from "lucide-react"

type Props = {
  fullName?: string
  position?: string
  unitName?: string
  department?: string
  compact?: boolean
}

export function DocumentEmployeeHeader({
  fullName,
  position,
  unitName,
  department,
  compact = false,
}: Props) {
  const name = fullName?.trim()
  const subLines = [
    position?.trim(),
    [department?.trim(), unitName?.trim()].filter(Boolean).join(" • "),
  ].filter(Boolean)

  const notice = (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      <div className="space-y-1">
        <p>
          Odkaz je určen pouze pro vás. Nepřeposílejte ho prosím další osobě.
        </p>
        <p>Vyplňujte údaje pravdivě a pouze za sebe.</p>
        <p>
          Pokud jméno nebo pozice u tohoto odkazu nesouhlasí s vámi, formulář
          nevyplňujte a okamžitě kontaktujte personální oddělení.
        </p>
        <p>
          Odesláním vyplněného formuláře potvrzujete, že Úřad městské části
          Praha 6 může zpracovávat vaše osobní údaje pro účely personální a
          mzdové agendy.
        </p>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2">{notice}</div>
    )
  }

  if (!name && !subLines.length) return null

  return (
    <div className="rounded-md border bg-background px-4 py-3 text-sm">
      <div className="font-medium text-foreground">
        Tento formulář je určen pro:
      </div>
      <div className="mt-1.5 space-y-2 rounded-md border bg-slate-50 px-3 py-2 dark:bg-slate-900/30">
        <div className="space-y-0.5">
          {name && <div className="font-semibold text-foreground">{name}</div>}
          {subLines.map((l, i) => (
            <div key={i} className="text-muted-foreground">
              {l}
            </div>
          ))}
        </div>
        <div className="border-t pt-2">{notice}</div>
      </div>
    </div>
  )
}
