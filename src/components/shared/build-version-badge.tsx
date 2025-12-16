"use client"

import { APP_VERSION } from "@/build-info"

export function BuildVersionBadge() {
  return (
    <div className="mt-4 w-full rounded-md border bg-muted px-2 py-1 text-[11px] text-muted-foreground">
      <div className="flex flex-col items-start gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1">
        <span className="font-semibold">Verze:</span>
        <span className="break-all font-mono text-[10px] sm:text-xs">
          {APP_VERSION}
        </span>
      </div>
    </div>
  )
}
