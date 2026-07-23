"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { differenceInCalendarDays, format } from "date-fns"

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

type DepartureVariant = "planned" | "actual" | "notice"

export function DepartureProgressBar({
  targetDate,
  startDate,
  variant = "planned",
  label,
  className = "",
}: {
  targetDate: string
  startDate?: string | null
  variant?: DepartureVariant
  label?: string
  className?: string
}) {
  const today = new Date()
  const target = new Date(targetDate)

  // Běžný, neposunutý rozdíl dat - "N dní zbývá" počítá dny od zítřka do
  // cílového data včetně, přesně jak to ukazuje kalendář. Jediná výjimka je
  // samotný poslední den (rawRemaining === 0): ten se pořád počítá jako
  // běžící (zaměstnanec je ještě v práci), ne jako už uplynulý.
  const rawRemaining = differenceInCalendarDays(target, today)
  const isCompleted = rawRemaining < 0
  const daysRemaining = rawRemaining === 0 ? 1 : Math.max(rawRemaining, 0)

  const start = startDate ? new Date(startDate) : null
  const maxDays = start
    ? Math.max(differenceInCalendarDays(target, start), 1)
    : variant === "notice"
      ? 60
      : 90

  const pct = Math.max(
    0,
    Math.min(100, ((maxDays - daysRemaining) / maxDays) * 100)
  )

  const [animatedPct, setAnimatedPct] = useState(0)
  useEffect(() => {
    setAnimatedPct(0)
    const id = requestAnimationFrame(() =>
      setAnimatedPct(isCompleted ? 100 : pct)
    )
    return () => cancelAnimationFrame(id)
  }, [pct, isCompleted, targetDate, variant])

  const trackBg = useMemo(() => {
    switch (variant) {
      case "planned":
        return "rgba(249,115,22,0.15)"
      case "actual":
        return "rgba(239,68,68,0.15)"
      default:
        return "rgba(59,130,246,0.15)"
    }
  }, [variant])

  const fillGradient = useMemo(() => {
    switch (variant) {
      case "planned":
        return "linear-gradient(90deg, rgba(251,146,60,0.8) 0%, rgba(249,115,22,0.95) 100%)" // orange-400 -> 500
      case "actual":
        return "linear-gradient(90deg, rgba(248,113,113,0.8) 0%, rgba(239,68,68,0.95) 100%)" // red-400 -> 500
      default:
        return "linear-gradient(90deg, rgba(96,165,250,0.8) 0%, rgba(59,130,246,0.95) 100%)" // blue-400 -> 500
    }
  }, [variant])

  const completedGradient = useMemo(() => {
    switch (variant) {
      case "planned":
        return "linear-gradient(90deg, #fb923c 0%, #f97316 100%)"
      case "actual":
        return "linear-gradient(90deg, #f87171 0%, #ef4444 100%)"
      default:
        return "linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%)"
    }
  }, [variant])

  const urgentOpacity = useMemo(() => {
    if (isCompleted) return 1
    if (daysRemaining <= 3) return 1
    if (daysRemaining <= 7) return 0.9
    return 0.8
  }, [isCompleted, daysRemaining])

  const innerText = isCompleted
    ? variant === "notice"
      ? "Uplynula"
      : "Odešel"
    : rawRemaining === 0
      ? "1d"
      : formatHumanDurationCompact(today, target)

  const elapsedText = start ? formatHumanDurationBetween(start, today) : null
  const remainingText =
    rawRemaining === 0
      ? formatDayCountCs(1)
      : formatHumanDurationBetween(today, target)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`relative cursor-help ${className}`}>
            <div
              className="relative h-6 w-24 overflow-hidden rounded-full"
              style={{ background: trackBg }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(animatedPct)}
              aria-label={label || "Stav termínu"}
            >
              <div
                className="duration-600 h-full rounded-full transition-[width,background,opacity] ease-out"
                style={{
                  width: `${animatedPct}%`,
                  background: isCompleted ? completedGradient : fillGradient,
                  opacity: pct < 8 && !isCompleted ? 0.6 : urgentOpacity,
                }}
              />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="select-none text-xs font-semibold tabular-nums text-black/70 dark:text-white/80">
                  {innerText}
                </span>
              </div>
            </div>
          </div>
        </TooltipTrigger>

        <TooltipContent side="bottom" className="max-w-xs">
          <div className="text-center">
            <p className="font-medium">{label || "Stav termínu"}</p>
            {isCompleted ? (
              <p className="text-sm">
                Termín uplynul {format(target, "d.M.yyyy")}
              </p>
            ) : (
              <>
                {elapsedText && (
                  <p className="text-xs text-muted-foreground">
                    Uplynulo: {elapsedText}
                  </p>
                )}
                <p className="text-sm">Zbývá: {remainingText}</p>
                <p className="text-xs text-muted-foreground">
                  do {format(target, "d.M.yyyy")}
                </p>
              </>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              Progress: {Math.round(animatedPct)}%
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
