"use client"

import { useEffect, useMemo, useState } from "react"
import { Check } from "lucide-react"

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type PositionSearchItem = {
  id?: string | number | null
  num: string
  name: string
  dept_name?: string | null
  unit_name?: string | null
  personName?: string | null
  personPersonalNumber?: string | null
}

type Props<T extends PositionSearchItem> = {
  positions: T[]
  value?: string
  onSelect: (position: T) => void
  trigger: (state: { open: boolean; selected: T | null }) => React.ReactNode
  placeholder?: string
  showOccupantInfo?: boolean
  selectFirstOnEnter?: boolean
  disabled?: boolean
  popoverClassName?: string
  popoverAlign?: "start" | "center" | "end"
  onFallbackLoaded?: (positions: T[]) => void
}

const DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g")

function normalize(value: string) {
  return value.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLowerCase()
}

function normalizePositionsPayload<T extends PositionSearchItem>(
  payload: unknown
): T[] {
  const source: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: unknown[] }).data
      : []

  const output: PositionSearchItem[] = []

  for (const item of source) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>

    const num = typeof rec.num === "string" ? rec.num : ""
    const name = typeof rec.name === "string" ? rec.name : ""
    if (!num || !name) continue

    output.push({
      id:
        typeof rec.id === "string" || typeof rec.id === "number"
          ? String(rec.id)
          : num,
      num,
      name,
      dept_name: typeof rec.dept_name === "string" ? rec.dept_name : "",
      unit_name: typeof rec.unit_name === "string" ? rec.unit_name : "",
      personName: typeof rec.personName === "string" ? rec.personName : null,
      personPersonalNumber:
        typeof rec.personPersonalNumber === "string"
          ? rec.personPersonalNumber
          : null,
    })
  }

  return output as T[]
}

export function PositionCombobox<T extends PositionSearchItem>({
  positions,
  value,
  onSelect,
  trigger,
  placeholder = "Hledat číslo, název pozice nebo odbor…",
  showOccupantInfo = true,
  selectFirstOnEnter = false,
  disabled,
  popoverClassName,
  popoverAlign = "start",
  onFallbackLoaded,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [fallbackPositions, setFallbackPositions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolvedPositions = positions.length > 0 ? positions : fallbackPositions

  useEffect(() => {
    if (!open || positions.length > 0 || fallbackPositions.length > 0) return

    const controller = new AbortController()

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/systemizace", {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })

        if (!res.ok) {
          throw new Error("Nepodařilo se načíst seznam pozic ze systemizace.")
        }

        const json = await res.json().catch(() => null)
        const normalized = normalizePositionsPayload<T>(json)
        setFallbackPositions(normalized)
        onFallbackLoaded?.(normalized)
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "Nepodařilo se načíst pozice.")
        }
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, positions.length, fallbackPositions.length])

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return resolvedPositions

    return resolvedPositions.filter((p) => {
      const hay = normalize(
        `${p.num} ${p.name} ${p.dept_name ?? ""} ${p.unit_name ?? ""}`
      )
      return hay.includes(q)
    })
  }, [resolvedPositions, query])

  const { visibleItems, hasMore, listRef, onScroll } = useIncrementalReveal(
    filtered,
    `${open}:${query}`
  )

  const selected = resolvedPositions.find((p) => p.num === value) ?? null

  function commit(position: T) {
    onSelect(position)
    setOpen(false)
    setQuery("")
  }

  return (
    <div className="space-y-1">
      <Popover
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (disabled) return
          setOpen(next)
        }}
      >
        <PopoverTrigger asChild disabled={disabled}>
          {trigger({ open, selected })}
        </PopoverTrigger>

        <PopoverContent
          className={cn(
            "w-[--radix-popover-trigger-width] p-0",
            popoverClassName
          )}
          align={popoverAlign}
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onWheelCapture={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={setQuery}
              autoFocus
              onKeyDown={(e) => {
                if (!selectFirstOnEnter || e.key !== "Enter") return
                e.preventDefault()
                const first = filtered[0]
                if (first) commit(first)
                else setOpen(false)
              }}
            />

            <CommandEmpty>
              {loading
                ? "Načítám pozice…"
                : error || "Žádná pozice nenalezena."}
            </CommandEmpty>

            <CommandList
              ref={listRef}
              onScroll={onScroll}
              className="max-h-80 overflow-y-auto overscroll-contain"
            >
              <CommandGroup>
                {visibleItems.map((position) => (
                  <CommandItem
                    key={position.id ?? position.num}
                    value={`${position.num} ${position.name}`}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      commit(position)
                    }}
                    onSelect={() => {}}
                    className="flex cursor-pointer items-start gap-3 py-3"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        value === position.num ? "opacity-100" : "opacity-0"
                      )}
                    />

                    <span className="min-w-[80px] rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                      {position.num}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {position.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[position.dept_name, position.unit_name]
                          .filter(Boolean)
                          .join(" • ")}
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

      {showOccupantInfo && selected && (
        <p className="text-xs text-muted-foreground">
          {selected.personPersonalNumber
            ? `Obsazeno: ${selected.personName ?? "—"} (osobní číslo ${selected.personPersonalNumber})`
            : "Neobsazená pracovní pozice."}
        </p>
      )}
    </div>
  )
}
