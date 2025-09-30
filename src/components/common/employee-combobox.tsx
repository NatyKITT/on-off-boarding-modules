"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, User, X } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { cn } from "@/lib/utils"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

export type EmployeeItem = {
  id: string
  personalNumber: string
  name: string
  surname: string
  email: string
  titleBefore?: string | null
  titleAfter?: string | null
  positionNum: string
  positionName: string
  department: string
  unitName: string
  label: string
  userName?: string | null
}

type Props = {
  formFields: {
    personalNumber: string
    name: string
    surname: string
    titleBefore: string
    titleAfter: string
    userEmail: string
    positionNum: string
    positionName: string
    department: string
    unitName: string
    userName?: string
  }
  placeholder?: string
  disabled?: boolean
  className?: string
  onSelect?: (employee: EmployeeItem) => void | Promise<void>
  fetchLimit?: number
  excludePersonalNumbers?: string[]
}

const toStr = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" ? v : ""

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

export function EmployeeCombobox({
  formFields,
  placeholder = "Vyberte zaměstnance…",
  disabled,
  className,
  onSelect,
  fetchLimit = 500,
  excludePersonalNumbers = [],
}: Props) {
  const form = useFormContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [allEmployees, setAllEmployees] = useState<EmployeeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ✅ OPRAVA: Sledování osobního čísla s fallbackem na prázdný string
  const watchedPersonalNumber = useWatch({
    control: form.control,
    name: formFields.personalNumber,
    defaultValue: "",
  })
  const currentPersonalNumber = toStr(watchedPersonalNumber).trim()

  const selectedEmployee = useMemo(
    () =>
      currentPersonalNumber
        ? (allEmployees.find(
            (e) => e.personalNumber === currentPersonalNumber
          ) ?? null)
        : null,
    [allEmployees, currentPersonalNumber]
  )

  // ✅ OPRAVA: Zobrazený text - pokud není vybraný zaměstnanec, vrať prázdný string
  const selectedLabel = selectedEmployee
    ? `${selectedEmployee.personalNumber}  ·  ${[
        selectedEmployee.titleBefore,
        selectedEmployee.name,
        selectedEmployee.surname,
        selectedEmployee.titleAfter,
      ]
        .filter(Boolean)
        .join(" ")}`
    : ""

  // Načtení zaměstnanců
  useEffect(() => {
    if (!open || allEmployees.length > 0) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("q", "1")
        url.searchParams.set("limit", String(fetchLimit))
        if (excludePersonalNumbers.length > 0) {
          url.searchParams.set("exclude", excludePersonalNumbers.join(","))
        }

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })
        if (!res.ok) {
          throw new Error(
            res.status === 502
              ? "EOS služba není dostupná"
              : `Chyba při načítání zaměstnanců (${res.status})`
          )
        }
        const json = await res.json().catch(() => null)
        const data: EmployeeItem[] = Array.isArray(json?.data) ? json.data : []
        setAllEmployees(data)
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "Chyba vyhledávání")
        }
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, allEmployees.length, fetchLimit, excludePersonalNumbers])

  // po zavření popoveru vyčisti hledání
  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  // živé filtrování
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return allEmployees
    return allEmployees.filter((e) => {
      const num = normalize(e.personalNumber)
      const nm = normalize(
        `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`
      )
      const org = normalize(`${e.positionName} ${e.department} ${e.unitName}`)
      return num.includes(q) || nm.includes(q) || org.includes(q)
    })
  }, [allEmployees, query])

  async function applyEmployee(e: EmployeeItem) {
    const opts = {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    } as const

    form.setValue(formFields.personalNumber, e.personalNumber, opts)
    form.setValue(formFields.name, e.name, opts)
    form.setValue(formFields.surname, e.surname, opts)
    form.setValue(formFields.titleBefore, e.titleBefore ?? "", opts)
    form.setValue(formFields.titleAfter, e.titleAfter ?? "", opts)
    form.setValue(formFields.userEmail, e.email ?? "", opts)
    form.setValue(formFields.positionNum, e.positionNum ?? "", opts)
    form.setValue(formFields.positionName, e.positionName ?? "", opts)
    form.setValue(formFields.department, e.department ?? "", opts)
    form.setValue(formFields.unitName, e.unitName ?? "", opts)
    if (formFields.userName)
      form.setValue(formFields.userName, e.userName ?? "", opts)

    form.clearErrors?.("personalNumber")

    await onSelect?.(e)
    setOpen(false)
    setQuery("")
    await form.trigger()
  }

  // ✅ OPRAVA: Vylepšená funkce pro vyčištění
  function clearEmployee() {
    const keys = [
      formFields.personalNumber,
      formFields.name,
      formFields.surname,
      formFields.titleBefore,
      formFields.titleAfter,
      formFields.userEmail,
      formFields.positionNum,
      formFields.positionName,
      formFields.department,
      formFields.unitName,
      formFields.userName,
    ].filter(Boolean) as string[]

    // Vyčisti všechna pole
    keys.forEach((k) =>
      form.setValue(k, "", {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
    )

    form.clearErrors?.("personalNumber")
    setQuery("")
    setOpen(false)

    // ✅ Vynucení validace po vyčištění
    setTimeout(() => {
      void form.trigger()
    }, 0)
  }

  // ✅ OPRAVA: Použití key prop na input pro vynucení rerenderu
  const inputKey = `employee-input-${currentPersonalNumber || "empty"}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Input
            key={inputKey}
            readOnly
            value={selectedLabel}
            placeholder={placeholder}
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
            onKeyDown={(e) => {
              if (disabled) return
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault()
                setOpen(true)
              }
              if (e.key === "Escape") {
                e.preventDefault()
                setOpen(false)
              }
            }}
          />
          {!!currentPersonalNumber && !disabled && (
            <button
              type="button"
              title="Vymazat výběr"
              aria-label="Vymazat výběr"
              className="absolute inset-y-0 right-2 my-auto inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                clearEmployee()
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
      >
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder="Pište číslo, jméno nebo příjmení…"
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                title="Vymazat hledání"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery("")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <CommandEmpty>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <div className="mr-2 size-4 animate-spin rounded-full border-b-2 border-current" />
                Načítám zaměstnance…
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-6 text-sm text-destructive">
                <User className="mb-2 size-8 opacity-50" />
                {error}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-sm text-muted-foreground">
                <User className="mb-2 size-8 opacity-50" />
                Nic nenalezeno.
              </div>
            )}
          </CommandEmpty>

          <CommandList
            className="max-h-80 overflow-y-auto overscroll-contain"
            onWheel={(e) => {
              e.stopPropagation()
            }}
          >
            <CommandGroup>
              {filtered.map((e) => (
                <CommandItem
                  key={e.id}
                  value={e.personalNumber}
                  onSelect={() => void applyEmployee(e)}
                  className="flex cursor-pointer items-start gap-3 py-3"
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      currentPersonalNumber === e.personalNumber
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-sm text-muted-foreground">
                        {e.personalNumber}
                      </span>
                      <span className="truncate font-medium">
                        {[e.titleBefore, e.name, e.surname, e.titleAfter]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                    </div>

                    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                      {e.positionName && (
                        <div className="truncate">
                          <span className="font-medium">Pozice:</span>{" "}
                          {e.positionName}
                        </div>
                      )}
                      {(e.department || e.unitName) && (
                        <div className="truncate">
                          {[e.department, e.unitName]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      )}
                      {e.email && (
                        <div className="truncate">
                          <span className="font-medium">Email:</span> {e.email}
                        </div>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
