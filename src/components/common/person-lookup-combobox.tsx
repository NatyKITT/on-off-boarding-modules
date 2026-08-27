"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, User, X } from "lucide-react"

import { useIncrementalReveal } from "@/hooks/use-incremental-reveal"
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
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type PersonLookupItem = {
  id: string
  personalNumber: string
  name: string
  surname: string
  email: string
  titleBefore?: string | null
  titleAfter?: string | null
  positionNum?: string
  positionName?: string
  department?: string
  unitName?: string
  label?: string
  userName?: string | null
}

type Props = {
  valueName?: string
  valueEmail?: string
  placeholder?: string
  disabled?: boolean
  onSelect: (employee: PersonLookupItem) => void | Promise<void>
  className?: string
  variant?: "input" | "button"
}

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 " +
  "focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary " +
  "focus-visible:ring-2 focus-visible:ring-primary/55 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background"

const DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g")

function normalize(value: string) {
  return value.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLowerCase()
}

function dedupeAdjacentWords(value: string): string {
  const parts = value.split(" ")
  const result: string[] = []

  for (const part of parts) {
    const prev = result[result.length - 1]
    if (prev && prev.localeCompare(part, "cs", { sensitivity: "base" }) === 0) {
      continue
    }
    result.push(part)
  }

  return result.join(" ").trim()
}

export function buildPersonFullName(person: Partial<PersonLookupItem>) {
  const joined = [
    person.titleBefore,
    person.name,
    person.surname,
    person.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return dedupeAdjacentWords(joined)
}

export function PersonLookupCombobox({
  valueName,
  valueEmail,
  placeholder,
  disabled,
  onSelect,
  className,
  variant = "input",
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [allEmployees, setAllEmployees] = useState<PersonLookupItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || allEmployees.length > 0) return

    const controller = new AbortController()

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("listAll", "true")
        url.searchParams.set("limit", "500")

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
  }, [open, allEmployees.length])

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return allEmployees

    return allEmployees.filter((e) => {
      const num = normalize(e.personalNumber ?? "")
      const nm = normalize(
        `${e.titleBefore ?? ""} ${e.name ?? ""} ${e.surname ?? ""} ${e.titleAfter ?? ""}`
      )
      const org = normalize(
        `${e.positionName ?? ""} ${e.department ?? ""} ${e.unitName ?? ""}`
      )
      const email = normalize(e.email ?? "")

      return (
        num.includes(q) ||
        nm.includes(q) ||
        org.includes(q) ||
        email.includes(q)
      )
    })
  }, [allEmployees, query])

  const { visibleItems, hasMore, listRef, onScroll } = useIncrementalReveal(
    filtered,
    `${open}:${query}`
  )

  const selectedLabel =
    valueName || valueEmail
      ? [valueName, valueEmail].filter(Boolean).join(" · ")
      : ""

  const emptyState = (
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
  )

  const resultList = (
    <CommandList
      ref={listRef}
      onScroll={onScroll}
      className="max-h-80 overflow-y-auto overscroll-contain"
    >
      <CommandGroup>
        {visibleItems.map((e) => (
          <CommandItem
            key={e.id}
            value={e.personalNumber || e.id}
            onPointerDown={(ev) => {
              ev.preventDefault()
              void onSelect(e)
              setOpen(false)
              setQuery("")
            }}
            onSelect={() => {}}
            className="flex cursor-pointer items-start gap-3 py-3"
          >
            <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {e.personalNumber ? (
                  <span className="font-mono text-sm text-muted-foreground">
                    {e.personalNumber}
                  </span>
                ) : null}
                <span className="truncate py-0.5 font-medium leading-normal">
                  {buildPersonFullName(e)}
                </span>
              </div>

              <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                {e.positionName ? (
                  <div className="truncate">
                    <span className="font-medium">Pozice:</span>{" "}
                    {e.positionName}
                  </div>
                ) : null}
                {e.department || e.unitName ? (
                  <div className="truncate">
                    {[e.department, e.unitName].filter(Boolean).join(" • ")}
                  </div>
                ) : null}
                {e.email ? (
                  <div className="truncate">
                    <span className="font-medium">Email:</span> {e.email}
                  </div>
                ) : null}
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
  )

  if (variant === "button") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("w-full justify-between text-xs", className)}
            disabled={disabled}
          >
            <span className="truncate">
              {selectedLabel || (placeholder ?? "Vyhledat v EOS…")}
            </span>
            <ChevronDown className="ml-2 size-3 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[420px] p-0" align="start">
          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                placeholder="Osobní číslo, jméno nebo e-mail…"
                value={query}
                onValueChange={setQuery}
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQuery("")}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {emptyState}
            {resultList}
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Input
            readOnly
            value={selectedLabel}
            placeholder={placeholder ?? "Vybrat osobu z EOS…"}
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
            className={focusRing}
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        sideOffset={4}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder="Pište číslo, jméno, příjmení nebo e-mail…"
              value={query}
              onValueChange={setQuery}
              autoFocus
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

          {emptyState}
          {resultList}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
