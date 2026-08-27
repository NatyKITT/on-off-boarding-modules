"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, User, X } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { useIncrementalReveal } from "@/hooks/use-incremental-reveal"
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
  searchMode?: "eager" | "lazy"
  confirmBeforeApply?: boolean
}

const toStr = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" ? v : ""

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 " +
  "focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary " +
  "focus-visible:ring-2 focus-visible:ring-primary/55 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background"

export function EmployeeCombobox({
  formFields,
  placeholder = "Vyberte zaměstnance…",
  disabled,
  className,
  onSelect,
  fetchLimit = 500,
  excludePersonalNumbers = [],
  searchMode = "eager",
  confirmBeforeApply = false,
}: Props) {
  const form = useFormContext()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [allEmployees, setAllEmployees] = useState<EmployeeItem[]>([])
  const [lazyResults, setLazyResults] = useState<EmployeeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingEmployee, setPendingEmployee] = useState<EmployeeItem | null>(
    null
  )
  const abortRef = useRef<AbortController | null>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)

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
          ) ??
          lazyResults.find((e) => e.personalNumber === currentPersonalNumber) ??
          null)
        : null,
    [allEmployees, lazyResults, currentPersonalNumber]
  )

  const selectedLabel = selectedEmployee
    ? `${selectedEmployee.personalNumber}  ·  ${[
        selectedEmployee.titleBefore,
        selectedEmployee.name,
        selectedEmployee.surname,
        selectedEmployee.titleAfter,
      ]
        .filter(Boolean)
        .join(" ")}`
    : currentPersonalNumber
      ? `${currentPersonalNumber}  ·  (načítám…)`
      : ""

  useEffect(() => {
    if (searchMode !== "eager") return
    if (allEmployees.length > 0) return
    if (!open && !currentPersonalNumber) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("listAll", "true")
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
        setAllEmployees(Array.isArray(json?.data) ? json.data : [])
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "Chyba vyhledávání")
        }
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [
    searchMode,
    open,
    allEmployees.length,
    fetchLimit,
    excludePersonalNumbers,
    currentPersonalNumber,
  ])

  useEffect(() => {
    if (searchMode !== "lazy") return
    if (!open) return

    const q = query.trim()

    if (q.length < 2) {
      setLazyResults([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const timeout = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("q", q)
        url.searchParams.set("limit", String(Math.min(fetchLimit, 20)))
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
              : `Chyba při hledání (${res.status})`
          )
        }
        const json = await res.json().catch(() => null)
        setLazyResults(Array.isArray(json?.data) ? json.data : [])
        setError(null)
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "Chyba vyhledávání")
          setLazyResults([])
        }
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      clearTimeout(timeout)
      abortRef.current?.abort()
    }
  }, [searchMode, open, query, fetchLimit, excludePersonalNumbers])

  useEffect(() => {
    if (!open) {
      setQuery("")
      if (searchMode === "lazy") setLazyResults([])
    }
  }, [open, searchMode])

  const displayItems = useMemo(() => {
    if (searchMode === "lazy") return lazyResults

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
  }, [searchMode, allEmployees, lazyResults, query])

  const { visibleItems, hasMore, listRef, onScroll } = useIncrementalReveal(
    displayItems,
    `${open}:${query}`
  )

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
    if (searchMode === "lazy") setLazyResults([])
    await form.trigger()
  }

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
    if (searchMode === "lazy") setLazyResults([])

    setTimeout(() => void form.trigger(), 0)
  }

  const inputKey = `employee-input-${currentPersonalNumber || "empty"}`

  const lazyPlaceholder =
    searchMode === "lazy"
      ? "Pište jméno nebo osobní číslo (min. 2 znaky)…"
      : "Pište číslo, jméno nebo příjmení…"

  const lazyEmptyHint =
    searchMode === "lazy" && query.trim().length < 2
      ? "Zadejte alespoň 2 znaky pro vyhledání."
      : null

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
            className={focusRing}
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

          {pendingEmployee && (
            <div className="absolute inset-x-0 top-full z-10 mt-2 rounded-lg border bg-background p-3 text-sm shadow-md">
              <p className="mb-2">
                Načíst údaje z EOS pro{" "}
                <span className="font-medium">
                  {[
                    pendingEmployee.titleBefore,
                    pendingEmployee.name,
                    pendingEmployee.surname,
                    pendingEmployee.titleAfter,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </span>{" "}
                (#{pendingEmployee.personalNumber})?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                  onClick={() => setPendingEmployee(null)}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    void applyEmployee(pendingEmployee)
                    setPendingEmployee(null)
                  }}
                >
                  Načíst údaje
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        sideOffset={4}
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          setTimeout(() => commandInputRef.current?.focus(), 0)
        }}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              ref={commandInputRef}
              placeholder={lazyPlaceholder}
              value={query}
              onValueChange={setQuery}
              className={focusRing}
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
                {searchMode === "lazy" ? "Hledám…" : "Načítám zaměstnance…"}
              </div>
            ) : lazyEmptyHint ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {lazyEmptyHint}
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
            ref={listRef}
            onScroll={onScroll}
            className="max-h-80 overflow-y-auto overscroll-contain"
            onWheelCapture={(e) => e.stopPropagation()}
          >
            <CommandGroup>
              {visibleItems.map((e) => (
                <CommandItem
                  key={e.id}
                  value={e.personalNumber}
                  onSelect={() => {
                    if (confirmBeforeApply) {
                      setPendingEmployee(e)
                      setOpen(false)
                      setQuery("")
                      if (searchMode === "lazy") setLazyResults([])
                      return
                    }
                    void applyEmployee(e)
                  }}
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

            {hasMore && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                Načítám další…
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
