"use client"

import { useMemo } from "react"
import { differenceInDays, format, isPast } from "date-fns"
import { cs } from "date-fns/locale"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ProbationProgressBarProps {
  /** Datum skutečného nebo plánovaného nástupu */
  startDate: string
  /** Datum konce zkušební doby */
  probationEndDate: string
  /** Typ - planned nebo actual */
  variant?: "planned" | "actual"
  /** Label pro tooltip */
  label?: string
  /** Velikost progress baru */
  size?: "sm" | "md" | "lg"
}

export function ProbationProgressBar({
  startDate,
  probationEndDate,
  variant = "actual",
  label,
  size = "sm",
}: ProbationProgressBarProps) {
  const progress = useMemo(() => {
    const start = new Date(startDate)
    const end = new Date(probationEndDate)
    const today = new Date()

    const rawRemaining = Math.ceil(differenceInDays(end, today))

    const totalDays = Math.ceil(differenceInDays(end, start))

    if (variant === "planned" && !isPast(start)) {
      return {
        percentage: 0,
        status: "not-started" as const,
        daysRemaining: Math.max(rawRemaining, 0),
        totalDays,
        statusText: "Zkušební doba ještě nezačala",
        displayText: `${Math.max(rawRemaining, 0)}d`,
      }
    }

    const percentage = Math.max(
      0,
      Math.min(100, ((totalDays - rawRemaining) / totalDays) * 100)
    )

    const isCompleted = rawRemaining <= 0 || percentage >= 100
    const daysRemaining = Math.max(rawRemaining, 0)

    let status: "in-progress" | "ending-soon" | "completed"
    let statusText: string
    let displayText: string

    if (isCompleted) {
      status = "completed"
      statusText = "Zkušební doba skončila"
      displayText = "ukončeno"
    } else if (daysRemaining <= 30) {
      status = "ending-soon"
      statusText = `Zbývá ${daysRemaining} ${daysRemaining === 1 ? "den" : daysRemaining < 5 ? "dny" : "dní"}`
      displayText = `${daysRemaining}d`
    } else {
      status = "in-progress"
      statusText = `Zbývá ${daysRemaining} ${daysRemaining === 1 ? "den" : daysRemaining < 5 ? "dny" : "dní"}`
      displayText = `${daysRemaining}d`
    }

    return {
      percentage,
      status,
      daysRemaining,
      totalDays,
      statusText,
      displayText,
    }
  }, [startDate, probationEndDate, variant])

  const sizeClasses = {
    sm: "h-6 w-24",
    md: "h-8 w-32",
    lg: "h-10 w-40",
  } as const

  const trackBg =
    variant === "planned" ? "rgba(59,130,246,0.15)" : "rgba(16,185,129,0.15)"

  const fillGradient =
    variant === "planned"
      ? "linear-gradient(90deg, rgba(59,130,246,0.75) 0%, rgba(37,99,235,0.9) 100%)"
      : "linear-gradient(90deg, rgba(16,185,129,0.75) 0%, rgba(5,150,105,0.9) 100%)"

  const completedGradient =
    variant === "planned"
      ? "linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)"
      : "linear-gradient(90deg, #10b981 0%, #059669 100%)"

  const urgentOpacity = useMemo(() => {
    if (progress.status === "completed") return 1
    if (progress.daysRemaining <= 3) return 1
    if (progress.daysRemaining <= 7) return 0.9
    return 0.8
  }, [progress.status, progress.daysRemaining])

  const widthPct =
    progress.status === "completed" ? 100 : Math.min(progress.percentage, 100)

  const fillOpacity =
    progress.status === "not-started"
      ? 0.2
      : progress.percentage < 8 && progress.status !== "completed"
        ? 0.6
        : urgentOpacity

  const tooltipContent = (
    <div className="text-center">
      <p className="font-medium">{label || "Zkušební doba"}</p>
      {progress.status === "completed" ? (
        <p className="text-sm">
          Termín uplynul{" "}
          {format(new Date(probationEndDate), "d.M.yyyy", { locale: cs })}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {progress.daysRemaining}{" "}
            {progress.daysRemaining === 1
              ? "den"
              : progress.daysRemaining < 5
                ? "dny"
                : "dní"}
          </p>
          <p className="text-xs text-muted-foreground">
            do {format(new Date(probationEndDate), "d.M.yyyy", { locale: cs })}
          </p>
        </>
      )}
      <div className="mt-1 text-xs text-muted-foreground">
        Progress: {Math.round(widthPct)}%
      </div>
    </div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative cursor-help">
            <div
              className={`relative overflow-hidden rounded-full ${sizeClasses[size]}`}
              style={{ background: trackBg }}
              aria-label={label || "Zkušební doba"}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(widthPct)}
            >
              <div
                className="absolute left-0 top-0 flex h-full items-center justify-center rounded-full transition-[width,background,opacity] duration-500 ease-out"
                style={{
                  width: `${widthPct}%`,
                  background:
                    progress.status === "completed"
                      ? completedGradient
                      : fillGradient,
                  opacity: fillOpacity,
                }}
              />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="select-none text-xs font-semibold tabular-nums text-black/70 dark:text-white/80">
                  {progress.displayText}
                </span>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
