"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cs } from "date-fns/locale"
import { format } from "date-fns"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const MONTH_LABELS = [
  "Led",
  "Úno",
  "Bře",
  "Dub",
  "Kvě",
  "Čvn",
  "Čvc",
  "Srp",
  "Zář",
  "Říj",
  "Lis",
  "Pro",
]

type MonthFilterProps = {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function MonthFilter({
  label,
  value,
  onChange,
  className,
}: MonthFilterProps) {
  const [open, setOpen] = React.useState(false)

  const selectedYear = value ? Number(value.slice(0, 4)) : null

  const [viewYear, setViewYear] = React.useState(
    selectedYear ?? new Date().getFullYear()
  )

  React.useEffect(() => {
    if (selectedYear) setViewYear(selectedYear)
  }, [selectedYear])

  const displayLabel = value
    ? format(new Date(`${value}-01T00:00:00`), "LLLL yyyy", { locale: cs })
    : label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9 justify-start gap-2 border-dashed capitalize",
            value && "border-solid",
            className
          )}
        >
          {displayLabel}

          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                onChange("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  event.stopPropagation()
                  onChange("")
                }
              }}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label="Zrušit výběr měsíce"
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setViewYear((year) => year - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="text-sm font-medium">{viewYear}</span>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setViewYear((year) => year + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((monthLabel, index) => {
            const monthValue = `${viewYear}-${String(index + 1).padStart(2, "0")}`
            const isSelected = value === monthValue

            return (
              <Button
                key={monthValue}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 px-1 text-xs",
                  isSelected && "bg-[#00847C] text-white hover:bg-[#0B6D73]"
                )}
                onClick={() => {
                  onChange(monthValue)
                  setOpen(false)
                }}
              >
                {monthLabel}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
