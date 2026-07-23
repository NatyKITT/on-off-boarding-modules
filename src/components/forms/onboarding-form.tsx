"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { addMonths, format } from "date-fns"
import {
  Calendar,
  Check,
  CheckCircle,
  GraduationCap,
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

import { useIsReadonly } from "@/hooks/use-current-role"
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

type ProbationExtensionType =
  | "sick_leave"
  | "vacation"
  | "family_care"
  | "maternity_parental"
  | "other_obstacle"
  | "unexcused_absence"

export type ProbationExtension = {
  id: string
  type: ProbationExtensionType
  from: string
  to: string
  days: number
  note?: string
}

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
  supervisorPosition?: string
  supervisorDepartment?: string
  supervisorUnitName?: string
  mentorName?: string
  mentorEmail?: string

  notes?: string
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  probationExtensions?: ProbationExtension[]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizePositionsResponse(api: unknown): Position[] {
  const source: unknown[] = Array.isArray(api)
    ? api
    : isRecord(api) && Array.isArray(api.data)
      ? api.data
      : []

  const output: Position[] = []

  for (const item of source) {
    if (!isRecord(item)) continue

    const num = typeof item.num === "string" ? item.num : ""
    const name = typeof item.name === "string" ? item.name : ""

    if (!num || !name) continue

    output.push({
      id: String(
        typeof item.id === "string" || typeof item.id === "number"
          ? item.id
          : num
      ),
      num,
      name,
      dept_name: typeof item.dept_name === "string" ? item.dept_name : "",
      unit_name: typeof item.unit_name === "string" ? item.unit_name : "",
      supervisorName:
        typeof item.supervisorName === "string"
          ? item.supervisorName
          : typeof item.supervisor_name === "string"
            ? item.supervisor_name
            : "",
      supervisorEmail:
        typeof item.supervisorEmail === "string"
          ? item.supervisorEmail
          : typeof item.supervisor_email === "string"
            ? item.supervisor_email
            : "",
    })
  }

  return output
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

function formatDateCz(value?: string | null) {
  if (!value) return "—"

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return "—"

  return format(date, "d.M.yyyy")
}

function formatDaysLabel(days: number) {
  if (days === 1) return "1 pracovní den"
  if (days >= 2 && days <= 4) return `${days} pracovní dny`
  return `${days} pracovních dnů`
}

const managerialKeywords = ["vedení", "ředitel", "vedoucí", "tajemník"]

const probationExtensionTypeLabels: Record<ProbationExtensionType, string> = {
  sick_leave: "Dočasná pracovní neschopnost / nemoc",
  vacation: "Dovolená",
  family_care: "OČR / ošetřování člena rodiny",
  maternity_parental: "Mateřská / rodičovská dovolená",
  other_obstacle: "Jiná celodenní překážka v práci",
  unexcused_absence: "Neomluvená absence",
}

function isWeekday(date: Date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}

function countWeekdaysInclusive(from?: string, to?: string) {
  if (!from || !to) return 0

  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  if (end < start) return 0

  let days = 0
  const cursor = new Date(start)

  while (cursor <= end) {
    if (isWeekday(cursor)) days += 1
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

function parseDateOnly(value?: string | null) {
  if (!value) return null

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function dateRangesOverlap(args: {
  firstFrom?: string | null
  firstTo?: string | null
  secondFrom?: string | null
  secondTo?: string | null
}) {
  const firstFromDate = parseDateOnly(args.firstFrom)
  const firstToDate = parseDateOnly(args.firstTo)
  const secondFromDate = parseDateOnly(args.secondFrom)
  const secondToDate = parseDateOnly(args.secondTo)

  if (!firstFromDate || !firstToDate || !secondFromDate || !secondToDate) {
    return false
  }

  return firstFromDate <= secondToDate && secondFromDate <= firstToDate
}

function findOverlappingProbationExtension(args: {
  extensions: ProbationExtension[]
  from?: string | null
  to?: string | null
  excludeId?: string | null
}) {
  if (!args.from || !args.to) return null

  return (
    args.extensions.find((extension) => {
      if (args.excludeId && extension.id === args.excludeId) return false

      return dateRangesOverlap({
        firstFrom: args.from,
        firstTo: args.to,
        secondFrom: extension.from,
        secondTo: extension.to,
      })
    }) ?? null
  )
}

function addWeekdaysAfterDate(baseDate: Date, days: number) {
  const result = new Date(baseDate)
  let remaining = Math.max(0, days)

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    if (isWeekday(result)) remaining -= 1
  }

  return result
}

function sumProbationExtensionDays(extensions: ProbationExtension[]) {
  return extensions.reduce((sum, extension) => sum + (extension.days || 0), 0)
}

function computeProbationEndWithExtensions(args: {
  start?: string
  positionName?: string
  extensions: ProbationExtension[]
}) {
  const base = computeProbationEnd(args.start, args.positionName)
  if (!base) return null

  const extensionDays = sumProbationExtensionDays(args.extensions)
  if (extensionDays <= 0) return base

  const baseDate = new Date(`${base}T00:00:00`)
  if (Number.isNaN(baseDate.getTime())) return base

  return fmt(addWeekdaysAfterDate(baseDate, extensionDays))
}

function formatProbationExtensionSummary(extensions: ProbationExtension[]) {
  if (extensions.length === 0) return ""

  const lines = extensions.map((extension) => {
    const label = probationExtensionTypeLabels[extension.type]
    const note = extension.note?.trim()
      ? `; pozn.: ${extension.note.trim()}`
      : ""

    return `- ${label}: ${formatDateCz(extension.from)} – ${formatDateCz(
      extension.to
    )}, prodlouženo o ${formatDaysLabel(extension.days)}${note}`
  })

  return [`Prodloužení zkušební doby:`, ...lines].join("\n")
}

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
  supervisorPosition: z.string().optional(),
  supervisorDepartment: z.string().optional(),
  supervisorUnitName: z.string().optional(),

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
  const isReadonly = useIsReadonly()
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
  const [fallbackPositions, setFallbackPositions] = useState<Position[]>([])
  const [positionsLoadingFallback, setPositionsLoadingFallback] =
    useState(false)
  const [positionsFallbackError, setPositionsFallbackError] = useState<
    string | null
  >(null)

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

  const [probationExtensions, setProbationExtensions] = useState<
    ProbationExtension[]
  >(() => initial?.probationExtensions ?? [])
  const [extensionType, setExtensionType] =
    useState<ProbationExtensionType>("sick_leave")
  const [extensionFrom, setExtensionFrom] = useState("")
  const [extensionTo, setExtensionTo] = useState("")
  const [extensionNote, setExtensionNote] = useState("")
  const [probationExtensionApplied, setProbationExtensionApplied] =
    useState<boolean>(() => Boolean(initial?.probationExtensions?.length))

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
    const initialExtensions = initial?.probationExtensions ?? []

    setProbationExtensions(initialExtensions)
    setProbationExtensionApplied(initialExtensions.length > 0)
    setExtensionType("sick_leave")
    setExtensionFrom("")
    setExtensionTo("")
    setExtensionNote("")
  }, [initial?.probationExtensions, id])

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
      supervisorPosition: "",
      supervisorDepartment: "",
      supervisorUnitName: "",
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

  // `defaults` mění referenci i tehdy, když volající předává `initial` jako
  // nový objekt na každý render (aniž by se editovaný záznam skutečně změnil).
  // Reset formuláře smí přepsat rozepsané hodnoty jen při skutečné změně
  // editovaného záznamu/režimu, ne při každém re-renderu rodiče.
  const resetKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const resetKey = `${id ?? "new"}:${effectiveMode}`
    if (resetKeyRef.current === resetKey) return
    resetKeyRef.current = resetKey

    form.reset(defaults)
    setPersonalCheck({ status: "idle" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, effectiveMode, form])

  const isSubmitting = form.formState.isSubmitting

  const watchPositionNum = form.watch("positionNum")
  const watchPositionName = form.watch("positionName")
  const watchPlannedStart = form.watch("plannedStart")
  const watchActualStart = form.watch("actualStart")

  const activePositions = useMemo(
    () => (positions.length > 0 ? positions : fallbackPositions),
    [fallbackPositions, positions]
  )

  const loadFallbackPositions = useCallback(async () => {
    if (positions.length > 0 || fallbackPositions.length > 0) return

    try {
      setPositionsLoadingFallback(true)
      setPositionsFallbackError(null)

      const res = await fetch("/api/systemizace", { cache: "no-store" })

      if (!res.ok) {
        throw new Error("Nepodařilo se načíst seznam pozic ze systemizace.")
      }

      const json = await res.json().catch(() => null)
      setFallbackPositions(normalizePositionsResponse(json))
    } catch (error) {
      console.error("Nepodařilo se načíst pozice:", error)
      setPositionsFallbackError(
        error instanceof Error
          ? error.message
          : "Nepodařilo se načíst seznam pozic."
      )
    } finally {
      setPositionsLoadingFallback(false)
    }
  }, [fallbackPositions.length, positions.length])

  useEffect(() => {
    if (!positionPickerOpen) return
    void loadFallbackPositions()
  }, [positionPickerOpen, loadFallbackPositions])

  const extensionDraftDays = useMemo(
    () => countWeekdaysInclusive(extensionFrom, extensionTo),
    [extensionFrom, extensionTo]
  )

  const baseProbationEnd = useMemo(() => {
    const start = isActualMode ? watchActualStart : watchPlannedStart
    return computeProbationEnd(start, watchPositionName)
  }, [isActualMode, watchActualStart, watchPlannedStart, watchPositionName])

  const draftProbationExtension = useMemo<ProbationExtension | null>(() => {
    if (!extensionFrom || !extensionTo || extensionDraftDays <= 0) return null

    return {
      id: "__draft__",
      type: extensionType,
      from: extensionFrom,
      to: extensionTo,
      days: extensionDraftDays,
      note: extensionNote.trim() || undefined,
    }
  }, [
    extensionDraftDays,
    extensionFrom,
    extensionNote,
    extensionTo,
    extensionType,
  ])

  const overlappingProbationExtension = useMemo(
    () =>
      findOverlappingProbationExtension({
        extensions: probationExtensions,
        from: extensionFrom,
        to: extensionTo,
      }),
    [extensionFrom, extensionTo, probationExtensions]
  )

  const invalidExtensionRange = Boolean(
    extensionFrom && extensionTo && extensionDraftDays <= 0
  )

  const extensionsWithDraft = useMemo(
    () =>
      draftProbationExtension
        ? [...probationExtensions, draftProbationExtension]
        : probationExtensions,
    [draftProbationExtension, probationExtensions]
  )

  const extendedProbationEnd = useMemo(() => {
    const start = isActualMode ? watchActualStart : watchPlannedStart
    return computeProbationEndWithExtensions({
      start,
      positionName: watchPositionName,
      extensions: probationExtensions,
    })
  }, [
    isActualMode,
    probationExtensions,
    watchActualStart,
    watchPlannedStart,
    watchPositionName,
  ])

  const proposedProbationEnd = useMemo(() => {
    const start = isActualMode ? watchActualStart : watchPlannedStart
    return computeProbationEndWithExtensions({
      start,
      positionName: watchPositionName,
      extensions: extensionsWithDraft,
    })
  }, [
    extensionsWithDraft,
    isActualMode,
    watchActualStart,
    watchPlannedStart,
    watchPositionName,
  ])

  const totalExtensionDays = useMemo(
    () => sumProbationExtensionDays(probationExtensions),
    [probationExtensions]
  )

  const proposedTotalExtensionDays = useMemo(
    () => sumProbationExtensionDays(extensionsWithDraft),
    [extensionsWithDraft]
  )

  const hasProbationExtensionCalculation = probationExtensions.length > 0
  const hasProbationExtensionDraft = Boolean(draftProbationExtension)
  const canApplyProbationExtensionDraft = Boolean(
    draftProbationExtension &&
      proposedProbationEnd &&
      !overlappingProbationExtension
  )

  useEffect(() => {
    if (!probationExtensionApplied) return
    if (!extendedProbationEnd) return

    if ((form.getValues("probationEnd") || "") !== extendedProbationEnd) {
      form.setValue("probationEnd", extendedProbationEnd, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [extendedProbationEnd, form, probationExtensionApplied])

  function clearProbationExtensionDraft() {
    setExtensionType("sick_leave")
    setExtensionFrom("")
    setExtensionTo("")
    setExtensionNote("")
  }

  function createProbationExtensionFromDraft(): ProbationExtension | null {
    const days = countWeekdaysInclusive(extensionFrom, extensionTo)

    if (!extensionFrom || !extensionTo || days <= 0) return null

    return {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: extensionType,
      from: extensionFrom,
      to: extensionTo,
      days,
      note: extensionNote.trim() || undefined,
    }
  }

  function buildOverlapMessage(extension: ProbationExtension) {
    return `Zadané období se překrývá s již použitou nepřítomností: ${
      probationExtensionTypeLabels[extension.type]
    } ${formatDateCz(extension.from)} – ${formatDateCz(extension.to)}.`
  }

  function syncProbationExtensions(nextExtensions: ProbationExtension[]) {
    setProbationExtensions(nextExtensions)
    form.setValue("probationExtensions", nextExtensions, {
      shouldDirty: true,
      shouldValidate: false,
    })
  }

  function applyProbationExtensionsToTerm(
    nextExtensions: ProbationExtension[]
  ) {
    const start = isActualMode
      ? form.getValues("actualStart")
      : form.getValues("plannedStart")

    const nextEnd =
      nextExtensions.length > 0
        ? computeProbationEndWithExtensions({
            start,
            positionName: form.getValues("positionName"),
            extensions: nextExtensions,
          })
        : computeProbationEnd(start, form.getValues("positionName"))

    if (nextEnd) {
      form.setValue("probationEnd", nextEnd, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    const hasExtensions = nextExtensions.length > 0

    setProbationExtensionApplied(hasExtensions)
    setManualDates(hasExtensions)
    form.setValue("hasCustomDates", hasExtensions, {
      shouldDirty: true,
      shouldValidate: false,
    })
  }

  function removeProbationExtension(extensionId: string) {
    const nextExtensions = probationExtensions.filter(
      (extension) => extension.id !== extensionId
    )

    syncProbationExtensions(nextExtensions)
    applyProbationExtensionsToTerm(nextExtensions)
  }

  function applyProbationExtensionEnd() {
    const nextExtension = createProbationExtensionFromDraft()

    if (!nextExtension) return

    const overlap = findOverlappingProbationExtension({
      extensions: probationExtensions,
      from: nextExtension.from,
      to: nextExtension.to,
    })

    if (overlap) {
      setErrorModal({
        open: true,
        message: `${buildOverlapMessage(overlap)} Upravte rozsah od–do nebo nejdříve smažte původní řádek v části Termíny nástupu.`,
      })
      return
    }

    const nextExtensions = [...probationExtensions, nextExtension]
    const start = isActualMode
      ? form.getValues("actualStart")
      : form.getValues("plannedStart")
    const nextEnd = computeProbationEndWithExtensions({
      start,
      positionName: form.getValues("positionName"),
      extensions: nextExtensions,
    })

    if (!nextEnd) return

    syncProbationExtensions(nextExtensions)
    setProbationExtensionApplied(true)
    setManualDates(true)

    form.setValue("hasCustomDates", true, {
      shouldDirty: true,
      shouldValidate: false,
    })
    form.setValue("probationEnd", nextEnd, {
      shouldDirty: true,
      shouldValidate: true,
    })

    clearProbationExtensionDraft()
  }

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
        form.setValue("supervisorPosition", "", { shouldValidate: false })
        form.setValue("supervisorDepartment", "", { shouldValidate: false })
        form.setValue("supervisorUnitName", "", { shouldValidate: false })
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
          form.setValue("supervisorPosition", "", { shouldValidate: false })
          form.setValue("supervisorDepartment", "", { shouldValidate: false })
          form.setValue("supervisorUnitName", "", { shouldValidate: false })
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
        form.setValue("supervisorPosition", supervisor?.position ?? "", {
          shouldDirty: false,
          shouldValidate: false,
        })
        form.setValue("supervisorDepartment", supervisor?.department ?? "", {
          shouldDirty: false,
          shouldValidate: false,
        })
        form.setValue("supervisorUnitName", supervisor?.unitName ?? "", {
          shouldDirty: false,
          shouldValidate: false,
        })
        setSupervisorLoadError(null)
      } catch (error) {
        if (requestId !== supervisorRequestRef.current) return

        console.error("Nepodařilo se dohledat vedoucího:", error)
        form.setValue("supervisorName", "", { shouldValidate: true })
        form.setValue("supervisorEmail", "", { shouldValidate: true })
        form.setValue("supervisorPosition", "", { shouldValidate: false })
        form.setValue("supervisorDepartment", "", { shouldValidate: false })
        form.setValue("supervisorUnitName", "", { shouldValidate: false })
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
    if (!watchPositionNum) return

    const pos = activePositions.find((p) => p.num === watchPositionNum)
    if (!pos) return

    form.setValue("positionName", ensure(pos.name, "(nezjištěno)"), {
      shouldValidate: true,
    })
    form.setValue("department", ensure(pos.dept_name, "(doplnit)"), {
      shouldValidate: true,
    })
    form.setValue("unitName", ensure(pos.unit_name, "(doplnit)"), {
      shouldValidate: true,
    })
  }, [activePositions, watchPositionNum, form])

  const previousAutoSupervisorPositionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!watchPositionNum) {
      previousAutoSupervisorPositionRef.current = null
      form.setValue("supervisorName", "", { shouldValidate: true })
      form.setValue("supervisorEmail", "", { shouldValidate: true })
      form.setValue("supervisorPosition", "", { shouldValidate: false })
      form.setValue("supervisorDepartment", "", { shouldValidate: false })
      form.setValue("supervisorUnitName", "", { shouldValidate: false })
      setSupervisorLoadError(null)
      return
    }

    if (previousAutoSupervisorPositionRef.current === watchPositionNum) return
    previousAutoSupervisorPositionRef.current = watchPositionNum

    if (
      Boolean(id) &&
      !supervisorManuallyChanged &&
      form.getValues("supervisorName")
    ) {
      return
    }

    void loadSupervisorForPosition(watchPositionNum)
  }, [
    form,
    id,
    loadSupervisorForPosition,
    supervisorManuallyChanged,
    watchPositionNum,
  ])

  const positionsForSearch: SearchablePosition[] = useMemo(
    () =>
      activePositions.map((p) => ({
        ...p,
        _key: `${p.num} ${p.name}`,
        _hay: stripAccents(`${p.num} ${p.name} ${p.dept_name} ${p.unit_name}`),
      })),
    [activePositions]
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
    form.setValue("supervisorPosition", "", { shouldValidate: false })
    form.setValue("supervisorDepartment", "", { shouldValidate: false })
    form.setValue("supervisorUnitName", "", { shouldValidate: false })

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

      const effectiveProbationExtensions = probationExtensions
      const hasExtensionCalculation = effectiveProbationExtensions.length > 0
      const hasUnappliedExtensionDraft = Boolean(
        extensionFrom || extensionTo || extensionNote.trim()
      )

      if (hasUnappliedExtensionDraft) {
        throw new Error(
          "V sekci Prodloužení zkušební doby máte rozpracované zadání. Nejdříve klikněte na „Použít navržený konec zkušební doby“, nebo rozpracované zadání vymažte."
        )
      }

      if (hasExtensionCalculation && !extendedProbationEnd) {
        throw new Error(
          "Nepodařilo se dopočítat nový konec zkušební doby. Zkontrolujte datum nástupu, pozici a zadané nepřítomnosti."
        )
      }

      if (
        hasExtensionCalculation &&
        extendedProbationEnd &&
        values.probationEnd !== extendedProbationEnd
      ) {
        throw new Error(
          "U prodloužení zkušební doby nesedí konec zkušební doby s výpočtem. Klikněte na „Použít navržený konec zkušební doby“, nebo odeberte řádek prodloužení."
        )
      }

      const effectiveProbationEnd = values.probationEnd

      const effectiveHasCustomDates = Boolean(
        manualDates || hasExtensionCalculation
      )

      const shouldSaveSupervisorSnapshot = Boolean(
        supervisorManuallyChanged ||
          values.supervisorName?.trim() ||
          values.supervisorEmail?.trim() ||
          values.supervisorPosition?.trim() ||
          values.supervisorDepartment?.trim() ||
          values.supervisorUnitName?.trim()
      )

      const payload: OnboardingPayload = {
        hasCustomDates: effectiveHasCustomDates,
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
        probationEnd: nullIfEmpty(effectiveProbationEnd),
        userEmail: nullIfEmpty(values.userEmail),
        userName: nullIfEmpty(values.userName),
        personalNumber: nullIfEmpty(values.personalNumber),
        mentorName: nullIfEmpty(values.mentorName),
        mentorEmail: nullIfEmpty(values.mentorEmail),
        notes: nullIfEmpty(values.notes),
        supervisorManualOverride: shouldSaveSupervisorSnapshot,
        probationExtensions: effectiveProbationExtensions,
        probationExtensionSummary: hasExtensionCalculation
          ? formatProbationExtensionSummary(effectiveProbationExtensions)
          : null,
      }

      if (shouldSaveSupervisorSnapshot) {
        payload.supervisorName = nullIfEmpty(values.supervisorName)
        payload.supervisorEmail = nullIfEmpty(values.supervisorEmail)
        payload.supervisorPosition = nullIfEmpty(values.supervisorPosition)
        payload.supervisorDepartment = nullIfEmpty(values.supervisorDepartment)
        payload.supervisorUnitName = nullIfEmpty(values.supervisorUnitName)
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
        if (values.actualStart) {
          payload.actualStart = values.actualStart
        }

        if (!id) {
          payload.status = "COMPLETED"
        }
      } else {
        if (values.plannedStart) {
          payload.plannedStart = values.plannedStart
        }

        if (!id) {
          payload.status = "NEW"
        }
      }

      const url = id ? `/api/nastupy/${id}` : `/api/nastupy`
      const method = id ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Operace se nezdařila.")
      }

      if (isActualMode && newlySkipped.length > 0) {
        setSkippedNumbersState((prev) => {
          const set = new Set([...(prev ?? []), ...newlySkipped])
          const arr = Array.from(set)

          arr.sort((a, b) => {
            const na = parseInt(a, 10)
            const nb = parseInt(b, 10)

            if (Number.isNaN(na) || Number.isNaN(nb)) {
              return a.localeCompare(b)
            }

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
                          autoComplete="off"
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
                            if (open) void loadFallbackPositions()
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
                                {positionsLoadingFallback
                                  ? "Načítám pozice…"
                                  : positionsFallbackError ||
                                    "Žádná pozice nenalezena"}
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

          <Card className="border-l-4 border-l-[#00847C]">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <User className="size-5" /> Vedoucí odboru
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
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
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <FormLabel>Vybrat vedoucího odboru z EOS</FormLabel>
                  <FormControl>
                    <PersonLookupCombobox
                      valueName={form.watch("supervisorName")}
                      valueEmail={form.watch("supervisorEmail")}
                      placeholder="Vyhledejte vedoucího odboru v EOS…"
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
                        form.setValue("supervisorEmail", employee.email ?? "", {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                        form.setValue(
                          "supervisorPosition",
                          employee.positionName ?? "",
                          {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: false,
                          }
                        )
                        form.setValue(
                          "supervisorDepartment",
                          employee.department ?? "",
                          {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: false,
                          }
                        )
                        form.setValue(
                          "supervisorUnitName",
                          employee.unitName ?? "",
                          {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: false,
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
                            form.setValue("supervisorPosition", "", {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            form.setValue("supervisorDepartment", "", {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            form.setValue("supervisorUnitName", "", {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
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
                          autoComplete="off"
                          {...field}
                          placeholder="vedouci@praha6.cz"
                          className={focusRing}
                          onChange={(e) => {
                            setSupervisorManuallyChanged(true)
                            form.setValue("supervisorPosition", "", {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            form.setValue("supervisorDepartment", "", {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            form.setValue("supervisorUnitName", "", {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            field.onChange(e)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="size-5" /> Mentor
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Mentora lze vybrat z EOS nebo doplnit ručně.
              </p>
            </CardHeader>
            <CardContent>
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
                          autoComplete="off"
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
                          autoComplete="off"
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
                          ? probationExtensionApplied
                            ? "Datum je nastavené podle prodloužení zkušební doby."
                            : "Můžete upravit ručně."
                          : form.getValues("positionName") &&
                              isManagerialPosition(
                                form.getValues("positionName")
                              )
                            ? "Automatický výpočet (8 měsíců pro manažerské pozice)."
                            : "Automatický výpočet (4 měsíce pro standardní pozice)."}
                      </FormDescription>

                      {hasProbationExtensionCalculation && (
                        <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <div className="font-medium text-foreground">
                            Info k prodloužení zkušební doby
                          </div>

                          <div className="mt-2 space-y-2">
                            {probationExtensions.map((extension, index) => (
                              <div
                                key={extension.id}
                                className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium text-foreground">
                                    {index + 1}.{" "}
                                    {
                                      probationExtensionTypeLabels[
                                        extension.type
                                      ]
                                    }
                                  </div>
                                  <div className="mt-0.5 text-muted-foreground">
                                    {formatDateCz(extension.from)} –{" "}
                                    {formatDateCz(extension.to)}, prodlouženo o{" "}
                                    {formatDaysLabel(extension.days)}
                                    {extension.note
                                      ? ` · ${extension.note}`
                                      : ""}
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() =>
                                    removeProbationExtension(extension.id)
                                  }
                                  title="Vymazat tento řádek prodloužení a přepočítat konec zkušební doby"
                                >
                                  <X className="size-4" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          <div className="mt-2 rounded bg-background px-3 py-2">
                            <div>
                              Základní konec zkušební doby:{" "}
                              {formatDateCz(baseProbationEnd)}
                            </div>
                            <div>
                              Prodloužení celkem:{" "}
                              {formatDaysLabel(totalExtensionDays)}
                            </div>
                            <div className="font-semibold text-foreground">
                              Aktuální konec zkušební doby po prodloužení:{" "}
                              {formatDateCz(extendedProbationEnd)}
                            </div>
                          </div>
                        </div>
                      )}

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
                <Calendar className="size-5" /> Prodloužení zkušební doby
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Přidejte období nepřítomnosti (nemoc, dovolená, neomluvená
                  absence) a konec zkušební doby se o tyto pracovní dny
                  automaticky prodlouží. Počítají se dny pondělí–pátek; u jiného
                  rozvrhu směn datum raději zkontrolujte ručně.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <FormLabel>Typ nepřítomnosti</FormLabel>
                  <select
                    value={extensionType}
                    onChange={(event) =>
                      setExtensionType(
                        event.target.value as ProbationExtensionType
                      )
                    }
                    className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${focusRing}`}
                  >
                    {Object.entries(probationExtensionTypeLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="space-y-2">
                  <FormLabel>Od</FormLabel>
                  <Input
                    type="date"
                    value={extensionFrom}
                    onChange={(event) => setExtensionFrom(event.target.value)}
                    className={focusRing}
                  />
                </div>

                <div className="space-y-2">
                  <FormLabel>Do</FormLabel>
                  <Input
                    type="date"
                    value={extensionTo}
                    onChange={(event) => setExtensionTo(event.target.value)}
                    className={focusRing}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <FormLabel>Poznámka</FormLabel>
                  <Input
                    value={extensionNote}
                    onChange={(event) => setExtensionNote(event.target.value)}
                    placeholder="Např. PN, dovolená, OČR…"
                    className={focusRing}
                  />
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">
                  Návrh prodloužení podle aktuálně zadané nepřítomnosti
                </div>

                {hasProbationExtensionDraft ? (
                  <div className="mt-2 space-y-2 text-muted-foreground">
                    <div className="space-y-1">
                      <div>
                        Typ: {probationExtensionTypeLabels[extensionType]}
                      </div>
                      <div>
                        Rozsah: {formatDateCz(extensionFrom)} –{" "}
                        {formatDateCz(extensionTo)}
                      </div>
                      <div>
                        Prodloužení za tento řádek:{" "}
                        {formatDaysLabel(extensionDraftDays)}
                      </div>
                      <div>
                        Základní konec zkušební doby:{" "}
                        {formatDateCz(baseProbationEnd)}
                      </div>
                      {hasProbationExtensionCalculation && (
                        <div>
                          Konec po již použitých prodlouženích:{" "}
                          {formatDateCz(extendedProbationEnd)}
                        </div>
                      )}
                      <div className="font-semibold text-foreground">
                        Nový navržený konec po přidání této nepřítomnosti:{" "}
                        {formatDateCz(proposedProbationEnd)}
                      </div>
                      <div>
                        Prodloužení celkem po použití:{" "}
                        {formatDaysLabel(proposedTotalExtensionDays)}
                      </div>
                    </div>

                    {overlappingProbationExtension && (
                      <Alert className="border-destructive/40 bg-destructive/5 text-destructive">
                        <AlertDescription>
                          {buildOverlapMessage(overlappingProbationExtension)}{" "}
                          Stejné nebo překrývající se datum nelze použít pro
                          další typ nepřítomnosti.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : invalidExtensionRange ? (
                  <Alert className="mt-2 border-destructive/40 bg-destructive/5 text-destructive">
                    <AlertDescription>
                      Datum „Do“ musí být stejné nebo pozdější než datum „Od“ a
                      rozsah musí obsahovat alespoň jeden pracovní den.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    Zadejte typ nepřítomnosti a rozsah od–do. Potom použijte
                    navržený konec zkušební doby. Nepřítomnost se propíše jako
                    další očíslovaný řádek pod pole „Konec zkušební doby“.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Počet pracovních dnů v aktuálně zadaném rozsahu:{" "}
                  <span className="font-medium text-foreground">
                    {extensionDraftDays}
                  </span>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearProbationExtensionDraft}
                    disabled={!extensionFrom && !extensionTo && !extensionNote}
                  >
                    Vymazat aktuální zadání
                  </Button>
                  <Button
                    type="button"
                    className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
                    disabled={!canApplyProbationExtensionDraft}
                    onClick={applyProbationExtensionEnd}
                  >
                    <Check className="mr-2 size-4" />
                    Použít navržený konec zkušební doby
                  </Button>
                </div>
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
              disabled={isSubmitting || isReadonly}
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
