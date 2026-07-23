"use client"

import { useMemo } from "react"
import { differenceInCalendarDays, format, isPast } from "date-fns"
import { cs } from "date-fns/locale"

import {
  formatDayCountCs,
  formatHumanDurationBetween,
  formatHumanDurationCompact,
} from "@/lib/dates"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ProbationProgressBarProps {
  startDate: string
  probationEndDate: string
  variant?: "planned" | "actual"
  label?: string
  size?: "sm" | "md" | "lg"
  frozenAt?: string | null
}

export function ProbationProgressBar({
  startDate,
  probationEndDate,
  variant = "actual",
  label,
  size = "sm",
  frozenAt,
}: ProbationProgressBarProps) {
  const isFrozen = Boolean(frozenAt)

  const progress = useMemo(() => {
    const start = new Date(startDate)
    const end = new Date(probationEndDate)
    const today = frozenAt ? new Date(frozenAt) : new Date()

    // Běžný, neposunutý rozdíl dat (žádné +1 navíc) - "N dní zbývá" počítá
    // dny od zítřka do konce včetně, přesně jak to ukazuje kalendář. Jediná
    // výjimka je samotný poslední den zkušební doby (rawRemaining === 0):
    // ten se pořád počítá jako běžící (1 den), ne jako už ukončený.
    const rawRemaining = differenceInCalendarDays(end, today)
    const totalDays = Math.max(differenceInCalendarDays(end, start), 1)

    if (variant === "planned" && !isPast(start)) {
      return {
        percentage: 0,
        status: "not-started" as const,
        daysRemaining: Math.max(rawRemaining, 0),
        totalDays,
        statusText: "Zkušební doba ještě nezačala",
        displayText: formatHumanDurationCompact(today, end),
        elapsedText: null,
        remainingText: formatHumanDurationBetween(today, end),
      }
    }

    const isCompleted = rawRemaining < 0
    const daysRemaining = rawRemaining === 0 ? 1 : Math.max(rawRemaining, 0)

    const percentage = Math.max(
      0,
      Math.min(100, ((totalDays - daysRemaining) / totalDays) * 100)
    )

    const compactRemaining =
      rawRemaining === 0 ? "1d" : formatHumanDurationCompact(today, end)
    const elapsedText = formatHumanDurationBetween(start, today)
    const remainingText =
      rawRemaining === 0
        ? formatDayCountCs(1)
        : formatHumanDurationBetween(today, end)

    let status: "in-progress" | "ending-soon" | "completed" | "frozen"
    let statusText: string
    let displayText: string

    if (isFrozen && !isCompleted) {
      status = "frozen"
      statusText = `Zastaveno k ${format(new Date(frozenAt!), "d.M.yyyy", { locale: cs })} — zbývalo ${daysRemaining} ${daysRemaining === 1 ? "den" : daysRemaining < 5 ? "dny" : "dní"}`
      displayText = compactRemaining
    } else if (isCompleted) {
      status = "completed"
      statusText = "Zkušební doba skončila"
      displayText = "ukončeno"
    } else if (daysRemaining <= 30) {
      status = "ending-soon"
      statusText = `Zbývá ${daysRemaining} ${daysRemaining === 1 ? "den" : daysRemaining < 5 ? "dny" : "dní"}`
      displayText = compactRemaining
    } else {
      status = "in-progress"
      statusText = `Zbývá ${daysRemaining} ${daysRemaining === 1 ? "den" : daysRemaining < 5 ? "dny" : "dní"}`
      displayText = compactRemaining
    }

    return {
      percentage,
      status,
      daysRemaining,
      totalDays,
      statusText,
      displayText,
      elapsedText,
      remainingText,
    }
  }, [startDate, probationEndDate, variant, frozenAt, isFrozen])

  const sizeClasses = {
    sm: "h-6 w-24",
    md: "h-8 w-32",
    lg: "h-10 w-40",
  } as const

  const trackBg = isFrozen
    ? "rgba(156,163,175,0.2)"
    : variant === "planned"
      ? "rgba(59,130,246,0.15)"
      : "rgba(16,185,129,0.15)"

  const fillGradient = isFrozen
    ? "linear-gradient(90deg, rgba(156,163,175,0.7) 0%, rgba(107,114,128,0.8) 100%)"
    : variant === "planned"
      ? "linear-gradient(90deg, rgba(59,130,246,0.75) 0%, rgba(37,99,235,0.9) 100%)"
      : "linear-gradient(90deg, rgba(16,185,129,0.75) 0%, rgba(5,150,105,0.9) 100%)"

  const completedGradient = isFrozen
    ? "linear-gradient(90deg, #9ca3af 0%, #6b7280 100%)"
    : variant === "planned"
      ? "linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)"
      : "linear-gradient(90deg, #10b981 0%, #059669 100%)"

  const urgentOpacity = useMemo(() => {
    if (isFrozen) return 0.75
    if (progress.status === "completed") return 1
    if (progress.daysRemaining <= 3) return 1
    if (progress.daysRemaining <= 7) return 0.9
    return 0.8
  }, [progress.status, progress.daysRemaining, isFrozen])

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
      {isFrozen && progress.status !== "completed" ? (
        <>
          <p className="text-sm text-muted-foreground">Zastaveno — odchod</p>
          <p className="text-sm">
            k {format(new Date(frozenAt!), "d.M.yyyy", { locale: cs })}
          </p>
          <p className="text-xs text-muted-foreground">
            zbývalo {progress.daysRemaining}{" "}
            {progress.daysRemaining === 1
              ? "den"
              : progress.daysRemaining < 5
                ? "dny"
                : "dní"}{" "}
            do {format(new Date(probationEndDate), "d.M.yyyy", { locale: cs })}
          </p>
        </>
      ) : progress.status === "completed" ? (
        <p className="text-sm">
          Termín uplynul{" "}
          {format(new Date(probationEndDate), "d.M.yyyy", { locale: cs })}
        </p>
      ) : (
        <>
          {progress.elapsedText && (
            <p className="text-xs text-muted-foreground">
              Uplynulo: {progress.elapsedText}
            </p>
          )}
          <p className="text-sm">Zbývá: {progress.remainingText}</p>
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
                <span
                  className={`select-none text-xs font-semibold tabular-nums ${
                    isFrozen
                      ? "text-gray-500 dark:text-gray-400"
                      : "text-black/70 dark:text-white/80"
                  }`}
                >
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
