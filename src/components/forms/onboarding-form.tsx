"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { addMonths, format } from "date-fns"
import {
  Calendar,
  Check,
  CheckCircle,
  ListChecks,
  RefreshCcw,
  Search,
  User,
  Users,
  X,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type Position } from "@/types/position"

import { cn } from "@/lib/utils"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"

type Mode = "create-planned" | "create-actual" | "edit"

export type FormValues = {
  hasCustomDates?: boolean
  titleBefore?: string
  name: string
  surname: string
  titleAfter?: string
  email: string

  positionNum: string
  positionName: string
  department: string
  unitName: string

  plannedStart?: string
  actualStart?: string
  startTime?: string
  probationEnd?: string

  userEmail?: string
  userName?: string
  personalNumber?: string

  supervisorName?: string
  supervisorEmail?: string
  mentorName?: string
  mentorEmail?: string

  notes?: string
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
}

export type PersonalNumberMeta = {
  lastUsedNumber?: string | null
  lastUsedName?: string | null
  skippedNumbers?: string[]
  lastDc2Number?: string | null
  lastDc2AssignedTo?: string | null
}

export type PersonalNumberCheckResult =
  | { ok: true }
  | { ok: false; usedBy?: string | null }

type Props = {
  positions: Position[]
  id?: number
  initial?: Partial<FormValues>
  mode?: Mode
  defaultCreateMode?: Mode
  prefillDate?: string
  editContext?: "planned" | "actual"
  onSuccess?: (newId?: number) => void
  personalNumberMeta?: PersonalNumberMeta
  validatePersonalNumber?: (
    personalNumber: string
  ) => Promise<PersonalNumberCheckResult>
}

type SearchablePosition = Position & {
  _key: string
  _hay: string
}

type OnboardingRowForMeta = {
  personalNumber?: string | null
  titleBefore?: string | null
  name?: string | null
  surname?: string | null
  titleAfter?: string | null
}

type OnboardingPayload = Record<string, unknown> & {
  generatedSkippedPersonalNumbers?: string[]
  supervisorManualOverride?: boolean
}

type EmployeePersonItem = {
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

type SupervisorApiResponse = {
  supervisor?: {
    gid?: string | null
    titleBefore?: string | null
    name?: string | null
    surname?: string | null
    titleAfter?: string | null
    fullName?: string | null
    email?: string | null
    position?: string | null
    department?: string | null
    unitName?: string | null
    personalNumber?: string | null
  }
}

const nullIfEmpty = (v?: string | null) =>
  v == null || String(v).trim() === "" ? null : v

const ensure = (v?: string | null, fb = "NEUVEDENO") => (v ?? "").trim() || fb

const fmt = (d: Date) => format(d, "yyyy-MM-dd")
const todayStr = () => fmt(new Date())

const managerialKeywords = ["vedení", "ředitel", "vedoucí", "tajemník"]

const stripAccents = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const isManagerialPosition = (positionName?: string): boolean => {
  if (!positionName) return false
  const low = stripAccents(positionName)
  return managerialKeywords.some((kw) => low.includes(stripAccents(kw)))
}

const computeProbationEnd = (
  start?: string,
  positionName?: string
): string | null => {
  if (!start) return null
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return null
  const monthsToAdd = isManagerialPosition(positionName) ? 8 : 4
  return fmt(addMonths(d, monthsToAdd))
}

const inferManualDates = (
  init: Partial<FormValues> | undefined,
  isActual: boolean
): boolean => {
  if (!init) return false
  if (typeof init.hasCustomDates === "boolean") return init.hasCustomDates
  const start = isActual ? init.actualStart : init.plannedStart
  const computed = computeProbationEnd(start, init.positionName)
  if (!start || !init.probationEnd || !computed) return false
  return init.probationEnd !== computed
}

const incrementPersonalNumber = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!/^\d+$/.test(trimmed)) return trimmed
  const next = (parseInt(trimmed, 10) + 1)
    .toString()
    .padStart(trimmed.length, "0")
  return next
}

const computeSkippedPersonalNumbers = (
  lastUsed?: string | null,
  current?: string | null
): string[] => {
  const last = (lastUsed ?? "").trim()
  const curr = (current ?? "").trim()
  if (!last || !curr) return []
  if (!/^\d+$/.test(last) || !/^\d+$/.test(curr)) return []
  const lastNum = parseInt(last, 10)
  const currNum = parseInt(curr, 10)
  if (currNum <= lastNum + 1) return []
  const padLen = Math.max(last.length, curr.length)
  const res: string[] = []
  for (let n = lastNum + 1; n < currNum; n++) {
    res.push(n.toString().padStart(padLen, "0"))
  }
  return res
}

const getBaselineLastPersonalNumber = (meta?: PersonalNumberMeta): string => {
  if (!meta) return ""
  const candidates: string[] = []

  if (meta.lastUsedNumber?.trim()) {
    candidates.push(meta.lastUsedNumber.trim())
  }
  if (meta.lastDc2Number?.trim()) {
    candidates.push(meta.lastDc2Number.trim())
  }
  if (!candidates.length) return ""

  let best = candidates[0]
  let bestNum = /^\d+$/.test(best) ? parseInt(best, 10) : NaN

  for (const cand of candidates.slice(1)) {
    const c = cand.trim()
    if (!c) continue

    if (!/^\d+$/.test(c)) {
      if (Number.isNaN(bestNum)) best = c
      continue
    }

    const n = parseInt(c, 10)
    if (Number.isNaN(bestNum) || n > bestNum) {
      best = c
      bestNum = n
    }
  }

  return best
}

function buildPersonalNumberMetaFromOnboardings(
  rows: OnboardingRowForMeta[],
  base?: PersonalNumberMeta
): PersonalNumberMeta {
  const parsed: { num: number; raw: string; fullName: string }[] = []

  for (const r of rows) {
    const raw = (r.personalNumber ?? "").trim()
    if (!raw) continue
    const match = raw.match(/\d+/)
    if (!match) continue
    const n = Number(match[0])
    if (!Number.isFinite(n)) continue

    const fullName =
      `${r.titleBefore ?? ""} ${r.name ?? ""} ${r.surname ?? ""} ${r.titleAfter ?? ""}`
        .replace(/\s+/g, " ")
        .trim()

    parsed.push({ num: n, raw, fullName })
  }

  const baseMeta: PersonalNumberMeta = {
    lastUsedNumber: base?.lastUsedNumber ?? null,
    lastUsedName: base?.lastUsedName ?? null,
    skippedNumbers: base?.skippedNumbers ?? [],
    lastDc2Number: base?.lastDc2Number ?? null,
    lastDc2AssignedTo: base?.lastDc2AssignedTo ?? null,
  }

  if (!parsed.length) return baseMeta

  parsed.sort((a, b) => a.num - b.num)
  const first = parsed[0]!
  const last = parsed[parsed.length - 1]!

  const usedSet = new Set(parsed.map((p) => p.num))
  const padLen = Math.max(last.raw.length, baseMeta.lastUsedNumber?.length ?? 0)

  const computedSkipped: string[] = []
  for (let n = first.num + 1; n < last.num; n++) {
    if (!usedSet.has(n)) {
      computedSkipped.push(n.toString().padStart(padLen, "0"))
    }
  }

  const unionSkipped = new Set<string>(baseMeta.skippedNumbers ?? [])
  for (const n of computedSkipped) unionSkipped.add(n)

  const sortedSkipped = Array.from(unionSkipped).sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
    return na - nb
  })

  return {
    ...baseMeta,
    lastUsedNumber: last.raw,
    lastUsedName: last.fullName || baseMeta.lastUsedName || null,
    skippedNumbers: sortedSkipped,
  }
}

const baseSchema = z.object({
  titleBefore: z.string().optional(),
  name: z.string().trim().min(1, "Jméno je povinné"),
  surname: z.string().trim().min(1, "Příjmení je povinné"),
  titleAfter: z.string().optional(),
  email: z.string().email("Neplatný e-mail").min(1, "E-mail je povinný"),

  positionNum: z.string().trim().min(1, "Číslo pozice je povinné"),
  positionName: z.string().trim().min(1, "Název pozice je povinný"),
  department: z.string().trim().min(1, "Odbor je povinný"),
  unitName: z.string().trim().min(1, "Oddělení je povinné"),

  plannedStart: z.string().optional(),
  actualStart: z.string().optional(),
  startTime: z.string().optional(),
  probationEnd: z.string().optional(),

  userEmail: z.string().email("Neplatný e-mail").or(z.literal("")).optional(),
  userName: z.string().optional(),
  personalNumber: z.string().optional(),

  supervisorName: z.string().optional(),
  supervisorEmail: z
    .string()
    .email("Neplatný e-mail")
    .or(z.literal(""))
    .optional(),

  mentorName: z.string().optional(),
  mentorEmail: z.string().email("Neplatný e-mail").or(z.literal("")).optional(),

  notes: z.string().optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
})

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
const textInputClass = `${focusRing} leading-normal py-2`

function cleanDisplayValue(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function dedupeAdjacentWords(value?: string | null): string {
  const raw = cleanDisplayValue(value)
  if (!raw) return ""

  const parts = raw.split(" ")
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

function buildDisplayName(parts: Array<string | null | undefined>): string {
  return dedupeAdjacentWords(parts.filter(Boolean).join(" "))
}

function buildEmployeeFullName(person: Partial<EmployeePersonItem>) {
  return buildDisplayName([
    person.titleBefore,
    person.name,
    person.surname,
    person.titleAfter,
  ])
}

function buildSupervisorFullName(
  supervisor?: SupervisorApiResponse["supervisor"]
): string {
  if (!supervisor) return ""

  if (supervisor.fullName) {
    return dedupeAdjacentWords(supervisor.fullName)
  }

  return buildDisplayName([
    supervisor.titleBefore,
    supervisor.name,
    supervisor.surname,
    supervisor.titleAfter,
  ])
}

function PersonLookupCombobox({
  valueName,
  valueEmail,
  placeholder,
  disabled,
  onSelect,
  className,
}: {
  valueName?: string
  valueEmail?: string
  placeholder?: string
  disabled?: boolean
  onSelect: (employee: EmployeePersonItem) => void | Promise<void>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [allEmployees, setAllEmployees] = useState<EmployeePersonItem[]>([])
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
        url.searchParams.set("q", "1")
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
        const data: EmployeePersonItem[] = Array.isArray(json?.data)
          ? json.data
          : []

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

  const selectedLabel =
    valueName || valueEmail
      ? [valueName, valueEmail].filter(Boolean).join(" • ")
      : ""

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

          <CommandList className="max-h-80 overflow-y-auto overscroll-contain">
            <CommandGroup>
              {filtered.map((e) => (
                <CommandItem
                  key={e.id}
                  value={e.personalNumber || e.id}
                  onSelect={() => {
                    void onSelect(e)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex cursor-pointer items-start gap-3 py-3"
                >
                  <Check className="mt-0.5 size-4 shrink-0 opacity-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <User className="size-4 shrink-0 text-muted-foreground" />
                      {e.personalNumber ? (
                        <span className="font-mono text-sm text-muted-foreground">
                          {e.personalNumber}
                        </span>
                      ) : null}
                      <span className="truncate py-0.5 font-medium leading-normal">
                        {buildEmployeeFullName(e)}
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
                          {[e.department, e.unitName]
                            .filter(Boolean)
                            .join(" • ")}
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ClearableTimeInput({
  value,
  onChange,
  id,
  disabled,
}: {
  value?: string
  onChange: (v: string) => void
  id?: string
  disabled?: boolean
}) {
  const showClear = typeof value === "string" && value.trim() !== ""
  return (
    <div className="relative">
      <Input
        id={id}
        type="time"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="pr-9"
      />
      {showClear && (
        <button
          type="button"
          aria-label="Vymazat čas"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          title="Vymazat čas"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

export function OnboardingFormUnified({
  positions,
  id,
  initial,
  mode,
  defaultCreateMode,
  prefillDate,
  editContext,
  onSuccess,
  personalNumberMeta,
  validatePersonalNumber,
}: Props) {
  const effectiveMode: Mode = useMemo(
    () => mode ?? defaultCreateMode ?? "create-planned",
    [mode, defaultCreateMode]
  )

  const isActualMode = useMemo(
    () => effectiveMode === "create-actual" || editContext === "actual",
    [effectiveMode, editContext]
  )

  const [resolvedPersonalMeta, setResolvedPersonalMeta] = useState<
    PersonalNumberMeta | undefined
  >(personalNumberMeta)

  const [successModal, setSuccessModal] = useState<{
    open: boolean
    mode: "create" | "edit"
    name: string
  }>({ open: false, mode: "create", name: "" })

  const [errorModal, setErrorModal] = useState<{
    open: boolean
    message: string
  }>({ open: false, message: "" })

  const [positionPickerOpen, setPositionPickerOpen] = useState(false)
  const positionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const [skippedOpen, setSkippedOpen] = useState(false)
  const [skippedNumbersState, setSkippedNumbersState] = useState<string[]>([])

  const [isSupervisorLoading, setIsSupervisorLoading] = useState(false)
  const [supervisorLoadError, setSupervisorLoadError] = useState<string | null>(
    null
  )
  const supervisorRequestRef = useRef(0)

  const [supervisorManuallyChanged, setSupervisorManuallyChanged] =
    useState(false)

  const inferredManualFlag = useMemo(
    () => inferManualDates(initial, isActualMode),
    [initial, isActualMode]
  )

  const [manualDates, setManualDates] = useState<boolean>(
    () => inferredManualFlag
  )

  useEffect(() => {
    setResolvedPersonalMeta(personalNumberMeta)
  }, [personalNumberMeta])

  useEffect(() => {
    if (personalNumberMeta && personalNumberMeta.skippedNumbers?.length) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch("/api/nastupy", { cache: "no-store" })
        if (!res.ok) return

        const json = await res.json().catch(() => null)
        const rows: OnboardingRowForMeta[] = Array.isArray(json?.data)
          ? json.data
          : []

        const computed = buildPersonalNumberMetaFromOnboardings(
          rows,
          personalNumberMeta
        )

        if (!cancelled) {
          setResolvedPersonalMeta(computed)
        }
      } catch (e) {
        console.error("Nepodařilo se načíst osobní čísla pro meta:", e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [personalNumberMeta])

  useEffect(() => {
    setSkippedNumbersState(resolvedPersonalMeta?.skippedNumbers ?? [])
  }, [resolvedPersonalMeta])

  useEffect(() => {
    setManualDates(inferredManualFlag)
  }, [inferredManualFlag, id])

  useEffect(() => {
    setSupervisorManuallyChanged(false)
  }, [id, initial?.positionNum])

  const suggestedPersonalNumber = useMemo(() => {
    const last = getBaselineLastPersonalNumber(resolvedPersonalMeta)
    if (!last.trim()) return ""
    return incrementPersonalNumber(last)
  }, [resolvedPersonalMeta])

  type PersonalCheckState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ok" }
    | { status: "taken"; usedBy?: string }
    | { status: "error"; message?: string }

  const [personalCheck, setPersonalCheck] = useState<PersonalCheckState>({
    status: "idle",
  })

  const defaults: FormValues = useMemo(() => {
    const isEdit = Boolean(id) || effectiveMode === "edit"
    const basePlanned = isActualMode ? undefined : todayStr()
    const baseActual = isActualMode ? todayStr() : undefined
    const basePosition = initial?.positionName

    const plannedStart = isEdit
      ? initial?.plannedStart
      : prefillDate && !isActualMode
        ? prefillDate
        : basePlanned

    const actualStart = isEdit
      ? initial?.actualStart
      : prefillDate && isActualMode
        ? prefillDate
        : baseActual

    const initialProbation =
      (inferredManualFlag
        ? initial?.probationEnd
        : computeProbationEnd(
            isActualMode ? actualStart : plannedStart,
            basePosition
          )) ?? ""

    const base: FormValues = {
      hasCustomDates: inferredManualFlag,
      titleBefore: "",
      name: "",
      surname: "",
      titleAfter: "",
      email: "",
      positionNum: "",
      positionName: "",
      department: "",
      unitName: "",
      plannedStart,
      actualStart,
      startTime: "",
      probationEnd: initialProbation,
      userEmail: "",
      userName: "",
      personalNumber: "",
      supervisorName: "",
      supervisorEmail: "",
      mentorName: "",
      mentorEmail: "",
      notes: "",
      status: "NEW",
      ...initial,
    }

    if (!isEdit && !base.personalNumber && suggestedPersonalNumber) {
      base.personalNumber = suggestedPersonalNumber
    }

    return base
  }, [
    id,
    initial,
    isActualMode,
    prefillDate,
    effectiveMode,
    inferredManualFlag,
    suggestedPersonalNumber,
  ])

  const schema = useMemo(
    () =>
      baseSchema.superRefine((vals, ctx) => {
        if (isActualMode) {
          if (!vals.actualStart) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actualStart"],
              message: "Datum skutečného nástupu je povinné.",
            })
          }
          if (!vals.personalNumber || !vals.personalNumber.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["personalNumber"],
              message: "Osobní číslo je pro skutečný nástup povinné.",
            })
          }
        } else {
          if (!vals.plannedStart) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["plannedStart"],
              message: "Datum předpokládaného nástupu je povinné.",
            })
          }
        }
      }),
    [isActualMode]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(defaults)
    setPersonalCheck({ status: "idle" })
  }, [defaults, form])

  const isSubmitting = form.formState.isSubmitting

  const watchPositionNum = form.watch("positionNum")
  const watchPositionName = form.watch("positionName")
  const watchPlannedStart = form.watch("plannedStart")
  const watchActualStart = form.watch("actualStart")

  useEffect(() => {
    if (form.getValues("hasCustomDates") !== manualDates) {
      form.setValue("hasCustomDates", manualDates, { shouldDirty: true })
    }
  }, [manualDates, form])

  useEffect(() => {
    if (manualDates) return
    const start = isActualMode
      ? form.getValues("actualStart")
      : form.getValues("plannedStart")
    const computed = computeProbationEnd(start, form.getValues("positionName"))
    if (computed && (form.getValues("probationEnd") || "") !== computed) {
      form.setValue("probationEnd", computed, { shouldValidate: true })
    }
  }, [manualDates, isActualMode, form])

  useEffect(() => {
    const start = isActualMode
      ? form.getValues("actualStart")
      : form.getValues("plannedStart")
    const computed = computeProbationEnd(start, form.getValues("positionName"))
    if (!computed) return
    if (manualDates && !form.getValues("probationEnd")) {
      form.setValue("probationEnd", computed, { shouldValidate: true })
    }
    if (!manualDates) {
      form.setValue("probationEnd", computed, { shouldValidate: true })
    }
  }, [manualDates, isActualMode, form])

  useEffect(() => {
    if (manualDates) return
    const start = isActualMode ? watchActualStart : watchPlannedStart
    const computed = computeProbationEnd(start, watchPositionName)
    if (computed && (form.getValues("probationEnd") || "") !== computed) {
      form.setValue("probationEnd", computed, { shouldValidate: true })
    }
  }, [
    watchPlannedStart,
    watchActualStart,
    watchPositionName,
    manualDates,
    isActualMode,
    form,
  ])

  const loadSupervisorForPosition = useCallback(
    async (positionNum: string, options?: { force?: boolean }) => {
      const trimmed = positionNum.trim()

      if (!trimmed) {
        form.setValue("supervisorName", "", { shouldValidate: true })
        form.setValue("supervisorEmail", "", { shouldValidate: true })
        setSupervisorLoadError(null)
        return
      }

      if (supervisorManuallyChanged && !options?.force) {
        return
      }

      const requestId = ++supervisorRequestRef.current
      setIsSupervisorLoading(true)
      setSupervisorLoadError(null)

      try {
        const res = await fetch(
          `/api/systemizace/superior?positionNum=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        )

        if (!res.ok) {
          if (requestId !== supervisorRequestRef.current) return

          form.setValue("supervisorName", "", { shouldValidate: true })
          form.setValue("supervisorEmail", "", { shouldValidate: true })
          setSupervisorLoadError("Vedoucí nebyl pro tuto pozici nalezen.")
          return
        }

        const json = (await res
          .json()
          .catch(() => null)) as SupervisorApiResponse | null
        const supervisor = json?.supervisor
        const fullName = buildSupervisorFullName(supervisor)

        if (requestId !== supervisorRequestRef.current) return

        form.setValue("supervisorName", fullName, {
          shouldDirty: false,
          shouldValidate: true,
        })
        form.setValue("supervisorEmail", supervisor?.email ?? "", {
          shouldDirty: false,
          shouldValidate: true,
        })
        setSupervisorLoadError(null)
      } catch (error) {
        if (requestId !== supervisorRequestRef.current) return

        console.error("Nepodařilo se dohledat vedoucího:", error)
        form.setValue("supervisorName", "", { shouldValidate: true })
        form.setValue("supervisorEmail", "", { shouldValidate: true })
        setSupervisorLoadError("Nepodařilo se načíst vedoucího.")
      } finally {
        if (requestId === supervisorRequestRef.current) {
          setIsSupervisorLoading(false)
        }
      }
    },
    [form, supervisorManuallyChanged]
  )

  useEffect(() => {
    if (!watchPositionNum) {
      form.setValue("supervisorName", "", { shouldValidate: true })
      form.setValue("supervisorEmail", "", { shouldValidate: true })
      setSupervisorLoadError(null)
      return
    }

    if (!positions.length) return

    const pos = positions.find((p) => p.num === watchPositionNum)
    if (!pos) return

    form.setValue("positionName", ensure(pos.name, "(nezjištěno)"))
    form.setValue("department", ensure(pos.dept_name, "(doplnit)"))
    form.setValue("unitName", ensure(pos.unit_name, "(doplnit)"))

    void loadSupervisorForPosition(watchPositionNum)
  }, [watchPositionNum, positions, form, loadSupervisorForPosition])

  const positionsForSearch: SearchablePosition[] = useMemo(
    () =>
      positions.map((p) => ({
        ...p,
        _key: `${p.num} ${p.name}`,
        _hay: stripAccents(`${p.num} ${p.name} ${p.dept_name} ${p.unit_name}`),
      })),
    [positions]
  )

  const filteredPositions: SearchablePosition[] = useMemo(() => {
    const q = stripAccents(searchQuery)
    if (!q) return positionsForSearch
    return positionsForSearch.filter((p) => p._hay.includes(q))
  }, [positionsForSearch, searchQuery])

  const pickPosition = (p: Position) => {
    form.setValue("positionNum", p.num, { shouldValidate: true })
    form.setValue("positionName", ensure(p.name, "(nezjištěno)"), {
      shouldValidate: true,
    })
    form.setValue("department", ensure(p.dept_name, "(doplnit)"), {
      shouldValidate: true,
    })
    form.setValue("unitName", ensure(p.unit_name, "(doplnit)"), {
      shouldValidate: true,
    })

    form.setValue("supervisorName", "", { shouldValidate: true })
    form.setValue("supervisorEmail", "", { shouldValidate: true })

    setSupervisorLoadError(null)
    setSupervisorManuallyChanged(false)

    if (!manualDates) {
      const start = isActualMode
        ? form.getValues("actualStart")
        : form.getValues("plannedStart")
      const computed = computeProbationEnd(start, p.name)
      if (computed) {
        form.setValue("probationEnd", computed, { shouldValidate: true })
      }
    }

    void loadSupervisorForPosition(p.num, { force: true })

    setPositionPickerOpen(false)
    requestAnimationFrame(() => positionTriggerRef.current?.focus())
  }

  const restoreSupervisorFromPosition = () => {
    const currentPositionNum = form.getValues("positionNum")
    if (!currentPositionNum) return
    setSupervisorManuallyChanged(false)
    void loadSupervisorForPosition(currentPositionNum, { force: true })
  }

  const checkPersonalNumber = useCallback(
    async (value: string) => {
      const v = value.trim()
      const originalPn = (initial?.personalNumber ?? "").trim()
      const isEditMode = Boolean(id)

      if (!v || !validatePersonalNumber) {
        setPersonalCheck({ status: "idle" })
        form.clearErrors("personalNumber")
        return
      }

      if (isEditMode && v === originalPn) {
        setPersonalCheck({ status: "idle" })
        form.clearErrors("personalNumber")
        return
      }

      try {
        setPersonalCheck({ status: "checking" })
        const res = await validatePersonalNumber(v)
        if (res.ok) {
          setPersonalCheck({ status: "ok" })
          form.clearErrors("personalNumber")
        } else {
          setPersonalCheck({
            status: "taken",
            usedBy: res.usedBy ?? undefined,
          })
          form.setError("personalNumber", {
            type: "manual",
            message: res.usedBy
              ? `Osobní číslo již v EOS používá ${res.usedBy}.`
              : "Toto osobní číslo je již v EOS použito.",
          })
        }
      } catch (err) {
        setPersonalCheck({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Nepodařilo se ověřit číslo v EOS.",
        })
        form.setError("personalNumber", {
          type: "manual",
          message: "Nepodařilo se ověřit osobní číslo v EOS.",
        })
      }
    },
    [validatePersonalNumber, form, initial?.personalNumber, id]
  )

  async function onSubmit(values: FormValues) {
    try {
      let newlySkipped: string[] = []

      if (isActualMode) {
        const pn = (values.personalNumber ?? "").trim()
        const originalPn = (initial?.personalNumber ?? "").trim()
        const isEditMode = Boolean(id)

        if (!pn) {
          throw new Error("Pro skutečný nástup je osobní číslo povinné.")
        }

        const personalNumberChanged = !isEditMode || pn !== originalPn

        if (personalNumberChanged && validatePersonalNumber) {
          const res = await validatePersonalNumber(pn)
          if (!res.ok) {
            throw new Error(
              res.usedBy
                ? `Osobní číslo již v EOS používá ${res.usedBy}.`
                : "Toto osobní číslo je již v EOS použito."
            )
          }
        }
      }

      const safePositionName = ensure(values.positionName, "(nezjištěno)")
      const safeDepartment = ensure(values.department, "(doplnit)")
      const safeUnitName = ensure(values.unitName, "(doplnit)")

      const payload: OnboardingPayload = {
        hasCustomDates: manualDates,
        titleBefore: nullIfEmpty(values.titleBefore),
        titleAfter: nullIfEmpty(values.titleAfter),
        name: values.name,
        surname: values.surname,
        email: values.email,
        positionNum: ensure(values.positionNum),
        positionName: safePositionName,
        department: safeDepartment,
        unitName: safeUnitName,
        startTime: nullIfEmpty(values.startTime),
        probationEnd: nullIfEmpty(values.probationEnd),
        userEmail: nullIfEmpty(values.userEmail),
        userName: nullIfEmpty(values.userName),
        personalNumber: nullIfEmpty(values.personalNumber),
        mentorName: nullIfEmpty(values.mentorName),
        mentorEmail: nullIfEmpty(values.mentorEmail),
        notes: nullIfEmpty(values.notes),
        supervisorManualOverride: supervisorManuallyChanged,
      }

      if (supervisorManuallyChanged) {
        payload.supervisorName = nullIfEmpty(values.supervisorName)
        payload.supervisorEmail = nullIfEmpty(values.supervisorEmail)
      }

      if (isActualMode) {
        const baselineLast = getBaselineLastPersonalNumber(resolvedPersonalMeta)
        newlySkipped = computeSkippedPersonalNumbers(
          baselineLast,
          values.personalNumber
        )
        if (newlySkipped.length > 0) {
          payload.generatedSkippedPersonalNumbers = newlySkipped
        }
      }

      if (isActualMode) {
        if (values.actualStart) payload.actualStart = values.actualStart
        if (!id) payload.status = "COMPLETED"
      } else {
        if (values.plannedStart) payload.plannedStart = values.plannedStart
        if (!id) payload.status = "NEW"
      }

      const url = id ? `/api/nastupy/${id}` : `/api/nastupy`
      const method = id ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message ?? "Operace se nezdařila.")

      if (isActualMode && newlySkipped.length > 0) {
        setSkippedNumbersState((prev) => {
          const set = new Set([...(prev ?? []), ...newlySkipped])
          const arr = Array.from(set)
          arr.sort((a, b) => {
            const na = parseInt(a, 10)
            const nb = parseInt(b, 10)
            if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
            return na - nb
          })
          return arr
        })
      }

      const fullName = `${values.name} ${values.surname}`
      setSuccessModal({
        open: true,
        mode: id ? "edit" : "create",
        name: fullName,
      })

      onSuccess?.(json?.data?.id)
    } catch (err) {
      setErrorModal({
        open: true,
        message:
          err instanceof Error
            ? err.message
            : "Operace se nezdařila. Zkuste to znovu.",
      })
    }
  }

  const handleSuccessModalClose = (open: boolean) => {
    setSuccessModal((prev) => ({ ...prev, open }))
  }

  return (
    <>
      <Form {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6"
          data-lenis-prevent=""
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" /> Osobní údaje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="titleBefore"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Titul před</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Např. Ing."
                          className={textInputClass}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="titleAfter"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Titul za</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Např. Ph.D."
                          className={textInputClass}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="name"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jméno *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Křestní jméno"
                          className={textInputClass}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="surname"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Příjmení *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Příjmení"
                          className={textInputClass}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="email"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>E-mail *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          placeholder="jmeno.prijmeni@email.cz"
                          className={focusRing}
                        />
                      </FormControl>
                      <FormDescription>Kontaktní e-mail.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" /> Organizační údaje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="positionNum"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Pozice *</FormLabel>
                      <FormControl>
                        <Popover
                          open={positionPickerOpen}
                          onOpenChange={(open) => {
                            setPositionPickerOpen(open)
                            if (!open) setSearchQuery("")
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              ref={positionTriggerRef}
                              type="button"
                              className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground [&>span]:line-clamp-1 ${focusRing} data-[state=open]:ring-2 data-[state=open]:ring-primary/55 data-[state=open]:ring-offset-2 data-[state=open]:ring-offset-background`}
                              onClick={() => setPositionPickerOpen((s) => !s)}
                            >
                              <span className="truncate text-left">
                                {field.value ? (
                                  <span>
                                    <span className="font-mono text-muted-foreground">
                                      {field.value}
                                    </span>
                                    {" — "}
                                    <span>
                                      {form.getValues("positionName") || ""}
                                    </span>
                                  </span>
                                ) : (
                                  "Vyhledejte číslo nebo název pozice..."
                                )}
                              </span>
                              <Search className="ml-2 size-4 opacity-60" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--w)] min-w-[var(--w)] p-0 [--w:var(--radix-popover-trigger-width)]"
                            align="start"
                            sideOffset={4}
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            onWheelCapture={(e) => e.stopPropagation()}
                          >
                            <Command>
                              <CommandInput
                                placeholder="Hledat číslo nebo název pozice..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    const first = filteredPositions[0]
                                    if (first) pickPosition(first)
                                    else setPositionPickerOpen(false)
                                  }
                                }}
                              />
                              <CommandEmpty>
                                Žádná pozice nenalezena
                              </CommandEmpty>
                              <CommandList className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
                                <CommandGroup>
                                  {filteredPositions.map((p) => (
                                    <CommandItem
                                      key={p.id ?? p.num}
                                      value={`${p.num} ${p.name}`}
                                      onSelect={() => pickPosition(p)}
                                      className="flex items-start gap-3 py-3"
                                    >
                                      <span className="min-w-[80px] rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                                        {p.num}
                                      </span>
                                      <div className="flex-1">
                                        <div className="text-sm font-medium">
                                          {p.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {p.dept_name} • {p.unit_name}
                                        </div>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </FormControl>
                      <FormDescription>
                        Vyhledejte pozici podle čísla nebo názvu.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="positionName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Název pozice *</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-muted" readOnly />
                      </FormControl>
                      <FormDescription>Automaticky doplněno.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="department"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Odbor *</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-muted" readOnly />
                      </FormControl>
                      <FormDescription>Automaticky doplněno.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="unitName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Oddělení *</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-muted" readOnly />
                      </FormControl>
                      <FormDescription>Automaticky doplněno.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" /> Vedoucí a mentor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Přímý nadřízený</h3>
                    <p className="text-sm text-muted-foreground">
                      Načítá se automaticky podle vybrané pozice, ale lze ho
                      změnit.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={restoreSupervisorFromPosition}
                    disabled={
                      !form.getValues("positionNum") || isSupervisorLoading
                    }
                  >
                    <RefreshCcw className="mr-2 size-4" />
                    Obnovit dle pozice
                  </Button>
                </div>

                {isSupervisorLoading && (
                  <Alert>
                    <AlertDescription>
                      Načítám vedoucího podle pozice…
                    </AlertDescription>
                  </Alert>
                )}

                {!isSupervisorLoading && supervisorLoadError && (
                  <Alert>
                    <AlertDescription>{supervisorLoadError}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormItem className="md:col-span-2">
                    <FormLabel>Vybrat vedoucího z EOS</FormLabel>
                    <FormControl>
                      <PersonLookupCombobox
                        valueName={form.watch("supervisorName")}
                        valueEmail={form.watch("supervisorEmail")}
                        placeholder="Vyhledejte vedoucího v EOS…"
                        onSelect={async (employee) => {
                          setSupervisorManuallyChanged(true)

                          form.setValue(
                            "supervisorName",
                            buildEmployeeFullName(employee),
                            {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            }
                          )
                          form.setValue(
                            "supervisorEmail",
                            employee.email ?? "",
                            {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            }
                          )
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Použijte, pokud má být vedoucí jiný než automaticky
                      dohledaný.
                    </FormDescription>
                  </FormItem>

                  <FormField
                    name="supervisorName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jméno vedoucího</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Např. Bc. Jana Nováková"
                            className={`${focusRing} leading-normal`}
                            onChange={(e) => {
                              setSupervisorManuallyChanged(true)
                              field.onChange(e)
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name="supervisorEmail"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail vedoucího</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            {...field}
                            placeholder="vedouci@praha6.cz"
                            className={focusRing}
                            onChange={(e) => {
                              setSupervisorManuallyChanged(true)
                              field.onChange(e)
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="text-sm font-semibold">Mentor</h3>
                  <p className="text-sm text-muted-foreground">
                    Mentora lze vybrat z EOS nebo doplnit ručně.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormItem className="md:col-span-2">
                    <FormLabel>Vybrat mentora z EOS</FormLabel>
                    <FormControl>
                      <PersonLookupCombobox
                        valueName={form.watch("mentorName")}
                        valueEmail={form.watch("mentorEmail")}
                        placeholder="Vyhledejte mentora v EOS…"
                        onSelect={async (employee) => {
                          form.setValue(
                            "mentorName",
                            buildEmployeeFullName(employee),
                            {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            }
                          )
                          form.setValue("mentorEmail", employee.email ?? "", {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          })
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Vyhledávání v databázi zaměstnanců.
                    </FormDescription>
                  </FormItem>

                  <FormField
                    name="mentorName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jméno mentora</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Doplní HR"
                            className={`${focusRing} leading-normal`}
                          />
                        </FormControl>
                        <FormDescription>Lze upravit ručně.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name="mentorEmail"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail mentora</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            {...field}
                            placeholder="mentor@praha6.cz"
                            className={focusRing}
                          />
                        </FormControl>
                        <FormDescription>Nepovinné.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" /> Účty a přístupy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="userEmail"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Firemní e-mail</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          placeholder="např. jmeno.prijmeni@praha6.cz"
                          className={focusRing}
                        />
                      </FormControl>
                      <FormDescription>
                        Doporučený formát:{" "}
                        <span className="font-mono">
                          jmeno.prijmeni@praha6.cz
                        </span>
                        .
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="userName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uživatelské jméno</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className={`font-mono ${focusRing}`}
                          placeholder="např. jprijmeni"
                        />
                      </FormControl>
                      <FormDescription>
                        Doporučený formát:{" "}
                        <span className="font-mono">jprijmeni</span>.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="personalNumber"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <FormLabel>
                          Osobní číslo
                          {isActualMode && (
                            <span className="text-destructive"> *</span>
                          )}
                        </FormLabel>
                        {skippedNumbersState.length > 0 && (
                          <Popover
                            open={skippedOpen}
                            onOpenChange={setSkippedOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                              >
                                <ListChecks className="size-3" />
                                Přeskočená čísla
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-72 p-3"
                              align="end"
                              sideOffset={4}
                              onOpenAutoFocus={(e) => e.preventDefault()}
                              onWheelCapture={(e) => e.stopPropagation()}
                            >
                              <p className="text-xs text-muted-foreground">
                                Osobní čísla, která byla přeskočena a dosud
                                nejsou využita.
                              </p>

                              <div className="mt-2 max-h-[min(40vh,220px)] overflow-y-auto pr-1">
                                <div className="flex flex-wrap gap-2">
                                  {skippedNumbersState.map((num) => (
                                    <button
                                      key={num}
                                      type="button"
                                      className="rounded bg-muted px-2 py-1 font-mono text-xs hover:bg-muted/80"
                                      onClick={() => {
                                        form.setValue("personalNumber", num, {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        })
                                        void checkPersonalNumber(num)
                                        setSkippedOpen(false)
                                      }}
                                    >
                                      {num}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>

                      <FormControl>
                        <Input
                          {...field}
                          className={`font-mono ${focusRing}`}
                          placeholder={suggestedPersonalNumber || "např. 0123"}
                          onChange={(e) => {
                            setPersonalCheck({ status: "idle" })
                            form.clearErrors("personalNumber")
                            field.onChange(e)
                          }}
                          onBlur={async (e) => {
                            field.onBlur()
                            await checkPersonalNumber(e.target.value)
                          }}
                        />
                      </FormControl>

                      <FormDescription>
                        {!isActualMode ? (
                          <>Nepovinné – lze doplnit později.</>
                        ) : (
                          <>Povinné u skutečného nástupu.</>
                        )}
                      </FormDescription>

                      {(resolvedPersonalMeta?.lastUsedNumber ||
                        resolvedPersonalMeta?.lastDc2Number) && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <ul className="list-disc space-y-1 pl-5">
                            {resolvedPersonalMeta?.lastUsedNumber && (
                              <li>
                                Poslední použité číslo:{" "}
                                <span className="font-mono font-semibold">
                                  {resolvedPersonalMeta.lastUsedNumber}
                                </span>
                                {resolvedPersonalMeta.lastUsedName ? (
                                  <> – {resolvedPersonalMeta.lastUsedName}</>
                                ) : null}
                              </li>
                            )}

                            {resolvedPersonalMeta?.lastDc2Number && (
                              <li>
                                Poslední číslo v DC2:{" "}
                                <span className="font-mono font-semibold">
                                  {resolvedPersonalMeta.lastDc2Number}
                                </span>
                                {resolvedPersonalMeta.lastDc2AssignedTo ? (
                                  <>
                                    {" "}
                                    – {resolvedPersonalMeta.lastDc2AssignedTo}
                                  </>
                                ) : null}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {suggestedPersonalNumber && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              form.setValue(
                                "personalNumber",
                                suggestedPersonalNumber,
                                {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                }
                              )
                              await checkPersonalNumber(suggestedPersonalNumber)
                            }}
                          >
                            Použít návrh
                          </Button>
                        )}

                        {personalCheck.status === "checking" && (
                          <span className="text-muted-foreground">
                            Ověřuji číslo v EOS…
                          </span>
                        )}
                        {personalCheck.status === "ok" && (
                          <span className="text-green-600">
                            Číslo je v EOS volné.
                          </span>
                        )}
                        {personalCheck.status === "taken" && (
                          <span className="text-red-600">
                            Číslo už je v EOS použito
                            {personalCheck.usedBy
                              ? ` – ${personalCheck.usedBy}.`
                              : "."}
                          </span>
                        )}
                        {personalCheck.status === "error" && (
                          <span className="text-red-600">
                            {personalCheck.message ??
                              "Nepodařilo se ověřit číslo v EOS."}
                          </span>
                        )}
                      </div>

                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="size-5" /> Termíny nástupu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="manualDates"
                  checked={manualDates}
                  onCheckedChange={(v) => {
                    const b = Boolean(v)
                    setManualDates(b)
                    form.setValue("hasCustomDates", b, { shouldDirty: true })

                    const start = isActualMode
                      ? form.getValues("actualStart")
                      : form.getValues("plannedStart")
                    const computed = computeProbationEnd(
                      start,
                      form.getValues("positionName")
                    )
                    if (
                      computed &&
                      (!manualDates || !form.getValues("probationEnd"))
                    ) {
                      form.setValue("probationEnd", computed, {
                        shouldValidate: true,
                      })
                    }
                  }}
                />
                <label htmlFor="manualDates" className="text-sm">
                  Upravit vlastní datumy
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {!isActualMode ? (
                  <>
                    <FormField
                      name="plannedStart"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Datum plánovaného nástupu *</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              className={focusRing}
                            />
                          </FormControl>
                          <FormDescription>
                            {manualDates
                              ? "Automatický výpočet vypnut."
                              : "Zkušební doba se počítá automaticky od tohoto data."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="startTime"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Čas nástupu</FormLabel>
                          <FormControl>
                            <ClearableTimeInput
                              value={field.value}
                              onChange={(v) => field.onChange(v)}
                            />
                          </FormControl>
                          <FormDescription>Nepovinné.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                ) : (
                  <>
                    <FormField
                      name="actualStart"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Datum skutečného nástupu *</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              className={focusRing}
                            />
                          </FormControl>
                          <FormDescription>
                            {manualDates
                              ? "Automatický výpočet vypnut."
                              : "Zkušební doba se počítá automaticky od tohoto data."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="startTime"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Čas nástupu</FormLabel>
                          <FormControl>
                            <ClearableTimeInput
                              value={field.value}
                              onChange={(v) => field.onChange(v)}
                            />
                          </FormControl>
                          <FormDescription>Nepovinné.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  name="probationEnd"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Konec zkušební doby</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          className={`${manualDates ? "" : "bg-muted"} ${focusRing}`}
                          readOnly={!manualDates}
                        />
                      </FormControl>
                      <FormDescription>
                        {manualDates
                          ? "Můžete upravit ručně."
                          : form.getValues("positionName") &&
                              isManagerialPosition(
                                form.getValues("positionName")
                              )
                            ? "Automatický výpočet (8 měsíců pro manažerské pozice)."
                            : "Automatický výpočet (4 měsíce pro standardní pozice)."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FormField
                name="notes"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Poznámky</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Další informace k nástupu zaměstnance..."
                        className={focusRing}
                      />
                    </FormControl>
                    <FormDescription>
                      Nepovinné doplňující informace.
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              type="submit"
              className={`inline-flex w-full items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] ${focusRing}`}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <div className="mr-2 size-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
              )}
              {id
                ? "Uložit změny"
                : isActualMode
                  ? "Zapsat skutečný nástup"
                  : "Přidat plánovaný nástup"}
            </Button>
          </div>

          <style jsx global>{`
            input[type="date"],
            input[type="time"] {
              appearance: none;
              -webkit-appearance: none;
              -moz-appearance: textfield;
            }
            input[type="date"]::-webkit-inner-spin-button,
            input[type="time"]::-webkit-inner-spin-button,
            input[type="time"]::-webkit-clear-button {
              display: none;
            }
            input[type="date"]::-webkit-calendar-picker-indicator,
            input[type="time"]::-webkit-calendar-picker-indicator {
              opacity: 0.6;
            }
          `}</style>
        </form>
      </Form>

      <Dialog open={successModal.open} onOpenChange={handleSuccessModalClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <DialogTitle>Úspěšně dokončeno</DialogTitle>
                <DialogDescription>
                  {successModal.mode === "create"
                    ? `${isActualMode ? "Skutečný" : "Plánovaný"} nástup byl založen`
                    : "Změny byly uloženy."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm">
              <span className="font-medium">{successModal.name}</span>
              {successModal.mode === "create"
                ? ` byl${isActualMode ? "" : "a"} úspěšně ${
                    isActualMode
                      ? "zapsán jako skutečný nástup"
                      : "přidán do plánovaných nástupů"
                  }.`
                : " – změny byly úspěšně uloženy."}
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => handleSuccessModalClose(false)}>
              Pokračovat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <X className="size-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <DialogTitle>Chyba při ukládání</DialogTitle>
                <DialogDescription>Operace se nepodařila.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {errorModal.message}
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setErrorModal((p) => ({ ...p, open: false }))}
            >
              Zkusit znovu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
