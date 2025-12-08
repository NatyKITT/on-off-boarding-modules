"use client"

import { APP_VERSION } from "@/build-info"

export function BuildVersionBadge() {
  return (
    <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold">Verze:</span>
      <span>{APP_VERSION}</span>
    </div>
  )
}
