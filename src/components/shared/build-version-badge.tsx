"use client"

import { APP_VERSION } from "@/build-info"

import { cn } from "@/lib/utils"

type BuildVersionBadgeProps = {
  compact?: boolean
  className?: string
}

function shortVersion(v: string) {
  return v.length > 10 ? `${v.slice(0, 7)}…` : v
}

export function BuildVersionBadge({
  compact = false,
  className,
}: BuildVersionBadgeProps) {
  if (compact) {
    return (
      <div className={cn("mt-4 flex w-full justify-center", className)}>
        <div className="rounded-md border bg-muted px-2 py-1 font-mono text-[10px] font-semibold leading-tight text-muted-foreground">
          v{shortVersion(APP_VERSION)}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "mt-4 w-full rounded-md border bg-muted px-2 py-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      <div className="flex flex-col items-start gap-0.5 sm:inline-flex sm:flex-row sm:items-center sm:gap-1">
        <span className="font-semibold">Verze:</span>
        <span className="break-all font-mono text-[10px] sm:text-xs">
          {APP_VERSION}
        </span>
      </div>
    </div>
  )
}
