"use client"

import { Info } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

type DocumentPrefillBannerProps = {
  sourceLabel: string
  fieldLabels: string[]
  onAccept: () => void
  onDismiss: () => void
}

export function DocumentPrefillBanner({
  sourceLabel,
  fieldLabels,
  onAccept,
  onDismiss,
}: DocumentPrefillBannerProps) {
  return (
    <Alert className="border-[#3dbd9b]/40 bg-[#3dbd9b]/5">
      <Info className="size-4 text-[#3dbd9b]" />
      <AlertTitle>Předvyplnit údaje?</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Tyto údaje již máte vyplněné z {sourceLabel}
          {fieldLabels.length > 0 ? `: ${fieldLabels.join(", ")}` : ""}. Chcete
          je automaticky doplnit? I po doplnění je můžete kdykoliv upravit.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={onAccept}>
            Ano, doplnit
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
            Ne, vyplním sám/sama
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
