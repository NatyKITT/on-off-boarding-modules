"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { useFormContext } from "react-hook-form"

import type { Position } from "@/types/position"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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

const stripAccents = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

export function PositionCombobox({
  positions,
  fields,
  placeholder = "Vyhledejte číslo nebo název pozice...",
  disabled,
  className,
}: Props) {
  const form = useFormContext()
  const [open, setOpen] = useState(false)

  const currentNum = toStr(form.getValues(fields.num))
  const currentName = toStr(form.getValues(fields.name))

  const selected = useMemo(
    () => positions.find((p) => toStr(p.num) === currentNum) ?? null,
    [positions, currentNum]
  )

  const positionsForSearch = useMemo(() => {
    return positions.map((p) => ({
      ...p,
      _key: `${p.num} ${p.name}`,
      _normNum: stripAccents(toStr(p.num)),
      _normName: stripAccents(p.name || ""),
    }))
  }, [positions])

  function apply(p: Position) {
    form.setValue(fields.num, toStr(p.num), {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(fields.name, p.name ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(fields.dept, p.dept_name ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(fields.unit, p.unit_name ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !currentNum && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate text-left">
            {currentNum ? (
              <span>
                <span className="font-mono text-muted-foreground">
                  {currentNum}
                </span>
                {" — "}
                <span>{currentName}</span>
              </span>
            ) : (
              placeholder
            )}
          </span>
          <Search className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
      >
        <Command
          filter={(val, search) => {
            const s = stripAccents(search)
            const v = stripAccents(val)
            return v.includes(s) ? 1 : 0
          }}
        >
          <CommandInput placeholder="Hledat číslo nebo název pozice..." />
          <CommandEmpty>Žádná pozice nenalezena</CommandEmpty>
          <CommandList
            className="max-h-80 overflow-y-auto overscroll-contain"
            onWheel={(e) => {
              e.stopPropagation()
            }}
          >
            <CommandGroup>
              {positionsForSearch.map((p) => {
                const isSelected = selected?.num === p.num
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.num} ${p.name}`}
                    onSelect={() => apply(p)}
                    className="flex items-start gap-3 py-3"
                  >
                    <span className="min-w-[80px] rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                      {p.num}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.dept_name} • {p.unit_name}
                      </div>
                    </div>
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
