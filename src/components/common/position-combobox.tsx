"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { Check, X } from "lucide-react"
import { useFormContext } from "react-hook-form"

import type { Position } from "@/types/position"

import { cn } from "@/lib/utils"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

type Props = {
  positions: Position[]
  fields: {
    num: string
    name: string
    dept: string
    unit: string
  }
  placeholder?: string
  disabled?: boolean
  className?: string
}

const toStr = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" ? v : ""

export function PositionCombobox({
  positions,
  fields,
  placeholder = "Napiš číslo nebo název…",
  disabled,
  className,
}: Props) {
  const form = useFormContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const currentNum = toStr(form.getValues(fields.num))
  const selected = useMemo(
    () => positions.find((p) => toStr(p.num) === currentNum) ?? null,
    [positions, currentNum]
  )

  const selectedLabel = selected
    ? `${toStr(selected.num)} — ${selected.name ?? ""}`
    : ""

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return positions
    return positions.filter((p) => {
      const hay =
        `${toStr(p.num)} ${p.name ?? ""} ${p.dept_name ?? ""} ${p.unit_name ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [positions, query])

  function apply(
    p: Pick<Position, "num" | "name" | "dept_name" | "unit_name">
  ) {
    form.setValue(fields.num, toStr(p.num), {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(fields.name, p.name ?? "", { shouldDirty: true })
    form.setValue(fields.dept, p.dept_name ?? "", { shouldDirty: true })
    form.setValue(fields.unit, p.unit_name ?? "", { shouldDirty: true })
    setOpen(false)
  }

  function clear() {
    form.setValue(fields.num, "", { shouldDirty: true, shouldValidate: true })
    form.setValue(fields.name, "", { shouldDirty: true })
    form.setValue(fields.dept, "", { shouldDirty: true })
    form.setValue(fields.unit, "", { shouldDirty: true })
    setQuery("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Input
            readOnly
            value={selectedLabel}
            placeholder={placeholder}
            disabled={disabled}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") {
                setOpen(true)
              }
              if (e.key === "Escape") setOpen(false)
            }}
          />
          {Boolean(currentNum) && (
            <button
              type="button"
              title="Vymazat výběr"
              aria-label="Vymazat výběr"
              className="absolute inset-y-0 right-2 my-auto inline-flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={(ev) => {
                ev.preventDefault()
                clear()
              }}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        sideOffset={4}
        align="start"
        data-lenis-prevent
        data-lenis-prevent-wheel
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Hledej číslem nebo názvem…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandEmpty>Nic nenalezeno.</CommandEmpty>
          <CommandGroup
            className="max-h-80 overflow-auto overscroll-contain"
            data-lenis-prevent
            data-lenis-prevent-wheel
            data-lenis-prevent-touch
            onWheelCapture={(e) => e.stopPropagation()}
            onTouchMoveCapture={(e) => e.stopPropagation()}
          >
            {items.map((p) => {
              const isSelected = selected?.num === p.num
              return (
                <CommandItem
                  key={String(p.id ?? p.num)}
                  value={toStr(p.num)}
                  onSelect={() => apply(p)}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="truncate">
                    {toStr(p.num)} — {p.name}
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
