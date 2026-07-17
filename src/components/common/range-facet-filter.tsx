"use client"

import * as React from "react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { type DayRangeValue, isDayRangeActive } from "@/lib/dates"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type RangeFacetOption = { value: string; label: string }

const DAYS_PER_MONTH = 30

type RangeFacetFilterProps = {
  label: string
  options: RangeFacetOption[]
  selected: string[]
  onSelectedChange: (values: string[]) => void
  range: DayRangeValue
  onRangeChange: (value: DayRangeValue) => void
  className?: string
}

export function RangeFacetFilter({
  label,
  options,
  selected,
  onSelectedChange,
  range,
  onRangeChange,
  className,
}: RangeFacetFilterProps) {
  const [open, setOpen] = React.useState(false)
  const [unit, setUnit] = React.useState<"days" | "months">("days")

  const rangeActive = isDayRangeActive(range)
  const activeCount = selected.length + (rangeActive ? 1 : 0)

  function toggleOption(value: string) {
    onSelectedChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  const toDisplay = (days: number | null) =>
    days == null
      ? ""
      : String(unit === "months" ? Math.round(days / DAYS_PER_MONTH) : days)

  const fromDisplay = (text: string): number | null => {
    if (text.trim() === "") return null

    const n = Number(text)
    if (Number.isNaN(n)) return null

    return Math.round(unit === "months" ? n * DAYS_PER_MONTH : n)
  }

  function clearAll(event: React.SyntheticEvent) {
    event.preventDefault()
    event.stopPropagation()
    onSelectedChange([])
    onRangeChange({ min: null, max: null })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9 justify-start gap-2 border-dashed",
            activeCount > 0 && "border-solid",
            className
          )}
        >
          {label}

          {activeCount > 0 && (
            <>
              <Badge
                variant="secondary"
                className="rounded-sm px-1.5 font-normal"
              >
                {activeCount}
              </Badge>
              <span
                role="button"
                tabIndex={0}
                onClick={clearAll}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    clearAll(event)
                  }
                }}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Zrušit filtr ${label}`}
              >
                <X className="size-3" />
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-3" align="start">
        <div className="mb-3 space-y-0.5">
          {options.map((option) => {
            const isSelected = selected.includes(option.value)

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleOption(option.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <div
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50"
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </div>
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            nebo vlastní rozsah
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mb-2 flex gap-1 rounded-md bg-muted p-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 flex-1 text-xs",
              unit === "days" && "bg-[#00847C] text-white hover:bg-[#0B6D73]"
            )}
            onClick={() => setUnit("days")}
          >
            Dny
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 flex-1 text-xs",
              unit === "months" &&
                "bg-[#00847C] text-white hover:bg-[#0B6D73]"
            )}
            onClick={() => setUnit("months")}
          >
            Měsíce
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Od
            </label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="min"
              value={toDisplay(range.min)}
              onChange={(event) =>
                onRangeChange({ ...range, min: fromDisplay(event.target.value) })
              }
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Do
            </label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="max"
              value={toDisplay(range.max)}
              onChange={(event) =>
                onRangeChange({ ...range, max: fromDisplay(event.target.value) })
              }
              className="h-8 text-sm"
            />
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          Kladné číslo = zbývá, záporné = už uplynulo.
          {unit === "months" ? " Měsíc počítán jako 30 dní." : ""}
        </p>
      </PopoverContent>
    </Popover>
  )
}
