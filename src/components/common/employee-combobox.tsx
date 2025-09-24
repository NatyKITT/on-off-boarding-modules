"use client"

import * as React from "react"
import { useState } from "react"
import { Check, X } from "lucide-react"
import { useFormContext } from "react-hook-form"

import { cn } from "@/lib/utils"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

type EmployeeItem = {
  id: string
  personalNumber: string
  name: string
  surname: string
  email: string
  titleBefore: string | null
  titleAfter: string | null
  positionName: string
  department: string
  unitName: string
  label: string
}

type Props = {
  formFields: {
    personalNumber: string
    name: string
    surname: string
    titleBefore: string
    titleAfter: string
    userEmail: string
    positionName: string
    department: string
    unitName: string
  }
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function EmployeeCombobox({
  formFields,
  placeholder = "Hledej osobní číslo / příjmení…",
  disabled,
  className,
}: Props) {
  const form = useFormContext()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [items, setItems] = useState<EmployeeItem[]>([])
  const [loading, setLoading] = useState(false)

  const currentPN = String(form.getValues(formFields.personalNumber) ?? "")

  async function search(term: string) {
    setLoading(true)
    try {
      const url = new URL("/api/zamestnanci/hledat", window.location.origin)
      url.searchParams.set("q", term)
      url.searchParams.set("limit", "50")
      const r = await fetch(url.toString(), { cache: "no-store" })
      const j = await r.json().catch(() => null)
      if (j?.status === "success" && Array.isArray(j.data)) {
        setItems(j.data as EmployeeItem[])
      } else {
        setItems([])
      }
    } finally {
      setLoading(false)
    }
  }

  function apply(e: EmployeeItem) {
    form.setValue(formFields.personalNumber, e.personalNumber, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(formFields.name, e.name, { shouldDirty: true })
    form.setValue(formFields.surname, e.surname, { shouldDirty: true })
    form.setValue(formFields.titleBefore, e.titleBefore ?? "", {
      shouldDirty: true,
    })
    form.setValue(formFields.titleAfter, e.titleAfter ?? "", {
      shouldDirty: true,
    })
    form.setValue(formFields.userEmail, e.email ?? "", { shouldDirty: true })
    form.setValue(formFields.positionName, e.positionName ?? "", {
      shouldDirty: true,
    })
    form.setValue(formFields.department, e.department ?? "", {
      shouldDirty: true,
    })
    form.setValue(formFields.unitName, e.unitName ?? "", { shouldDirty: true })
    setOpen(false)
  }

  function clear() {
    ;[
      formFields.personalNumber,
      formFields.name,
      formFields.surname,
      formFields.titleBefore,
      formFields.titleAfter,
      formFields.userEmail,
      formFields.positionName,
      formFields.department,
      formFields.unitName,
    ].forEach((f) =>
      form.setValue(f, "", { shouldDirty: true, shouldValidate: true })
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Input
            disabled={disabled}
            value={open ? q : currentPN}
            placeholder={placeholder}
            onFocus={() => {
              setOpen(true)
              setQ("")
              if (!items.length) void search("")
            }}
            onChange={(e) => {
              setQ(e.target.value)
              void search(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false)
                setQ("")
              }
            }}
          />
          {currentPN && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Vymazat výběr"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={clear}
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
      >
        <Command shouldFilter={false}>
          <CommandEmpty>
            {loading ? "Načítám…" : "Nic nenalezeno."}
          </CommandEmpty>
          <CommandGroup className="max-h-80 overflow-auto">
            {items.map((it) => {
              const active = it.personalNumber === currentPN
              return (
                <CommandItem
                  key={it.id}
                  value={it.personalNumber}
                  onSelect={() => apply(it)}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate">
                      {it.personalNumber} — {it.name} {it.surname}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[it.positionName, it.department, it.unitName]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
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
