"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { addMonths, format } from "date-fns"
import { Calendar, CheckCircle, Search, User, X } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type Position } from "@/types/position"

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
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"

/* ----------------------------- types ----------------------------- */
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

  notes?: string
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

type Props = {
  positions: Position[]
  id?: number
  initial?: Partial<FormValues>
  mode?: Mode
  defaultCreateMode?: Mode
  prefillDate?: string
  editContext?: "planned" | "actual"
  onSuccess?: (newId?: number) => void
}

type SearchablePosition = Position & {
  _key: string
  _hay: string
}

/* --------------------------- helpers ---------------------------- */
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
  const monthsToAdd = isManagerialPosition(positionName) ? 6 : 3
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

/* ---------------------------- schema ---------------------------- */
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

  notes: z.string().optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

/* -------------------- Clearable time input --------------------- */
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-muted-foreground hover:text-foreground
                     focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          title="Vymazat čas"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

/* ------------------------- main component ------------------------ */
export function OnboardingFormUnified({
  positions,
  id,
  initial,
  mode,
  defaultCreateMode,
  prefillDate,
  editContext,
  onSuccess,
}: Props) {
  const effectiveMode: Mode = useMemo(
    () => mode ?? defaultCreateMode ?? "create-planned",
    [mode, defaultCreateMode]
  )
  const isActualMode = useMemo(
    () => effectiveMode === "create-actual" || editContext === "actual",
    [effectiveMode, editContext]
  )

  const inferredManualFlag = useMemo(
    () => inferManualDates(initial, isActualMode),
    [initial, isActualMode]
  )

  const [successModal, setSuccessModal] = useState<{
    open: boolean
    mode: "create" | "edit"
    name: string
  }>({ open: false, mode: "create", name: "" })

  const [errorModal, setErrorModal] = useState<{
    open: boolean
    message: string
  }>({ open: false, message: "" })

  const [manualDates, setManualDates] = useState<boolean>(
    () => inferredManualFlag
  )
  useEffect(() => {
    setManualDates(inferredManualFlag)
  }, [inferredManualFlag, id])
  const [positionPickerOpen, setPositionPickerOpen] = useState(false)
  const positionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

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

    return {
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
      notes: "",
      status: "NEW",
      ...initial,
    }
  }, [
    id,
    initial,
    isActualMode,
    prefillDate,
    effectiveMode,
    inferredManualFlag,
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

  const isSubmitting = form.formState.isSubmitting

  const watchPositionNum = form.watch("positionNum")
  const watchPositionName = form.watch("positionName")
  const watchPlannedStart = form.watch("plannedStart")
  const watchActualStart = form.watch("actualStart")

  useEffect(() => {
    if (form.getValues("hasCustomDates") !== manualDates) {
      form.setValue("hasCustomDates", manualDates, { shouldDirty: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualDates])

  useEffect(() => {
    if (manualDates) return
    const start = isActualMode
      ? form.getValues("actualStart")
      : form.getValues("plannedStart")
    const computed = computeProbationEnd(start, form.getValues("positionName"))
    if (computed && (form.getValues("probationEnd") || "") !== computed) {
      form.setValue("probationEnd", computed, { shouldValidate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualDates])

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

  useEffect(() => {
    if (!watchPositionNum || !positions.length) return
    const pos = positions.find((p) => p.num === watchPositionNum)
    if (pos) {
      form.setValue("positionName", ensure(pos.name, "(nezjištěno)"))
      form.setValue("department", ensure(pos.dept_name, "(doplnit)"))
      form.setValue("unitName", ensure(pos.unit_name, "(doplnit)"))
    }
  }, [watchPositionNum, positions, form])

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

    if (!manualDates) {
      const start = isActualMode
        ? form.getValues("actualStart")
        : form.getValues("plannedStart")
      const computed = computeProbationEnd(start, p.name)
      if (computed)
        form.setValue("probationEnd", computed, { shouldValidate: true })
    }
    setPositionPickerOpen(false)
    requestAnimationFrame(() => positionTriggerRef.current?.focus())
  }

  async function onSubmit(values: FormValues) {
    try {
      const safePositionName = ensure(values.positionName, "(nezjištěno)")
      const safeDepartment = ensure(values.department, "(doplnit)")
      const safeUnitName = ensure(values.unitName, "(doplnit)")

      const payload: Record<string, unknown> = {
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
        notes: nullIfEmpty(values.notes),
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

  const focusRing =
    "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 focus:ring-offset-2 focus:ring-offset-background " +
    "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

  return (
    <>
      <Form {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="max-h-[80vh] space-y-6 overflow-y-auto overscroll-contain"
          data-lenis-prevent=""
        >
          {/* --- Osobní údaje --- */}
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
                          className={focusRing}
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
                          className={focusRing}
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
                          className={focusRing}
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
                          className={focusRing}
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
                          placeholder="jprijmeni@email.com"
                          className={focusRing}
                        />
                      </FormControl>
                      <FormDescription>E-mail pro komunikaci</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* --- Organizační údaje --- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" /> Organizační údaje
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
                        Vyhledejte pozici podle čísla nebo názvu
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
                      <FormDescription>Automaticky doplněno</FormDescription>
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
                      <FormDescription>Automaticky doplněno</FormDescription>
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
                      <FormDescription>Automaticky doplněno</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* --- Termíny nástupu --- */}
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
                  Upravit vlastní datumy (vypnout automatický výpočet zkušební
                  doby)
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
                              ? "Automatický výpočet vypnut"
                              : "Zkušební doba se počítá automaticky od tohoto data"}
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
                          <FormDescription>Nepovinné</FormDescription>
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
                              ? "Automatický výpočet vypnut"
                              : "Zkušební doba se počítá automaticky od tohoto data"}
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
                          <FormDescription>Nepovinné</FormDescription>
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
                          ? "Můžete upravit ručně"
                          : form.getValues("positionName") &&
                              isManagerialPosition(
                                form.getValues("positionName")
                              )
                            ? "Automatický výpočet (6 měsíců pro manažerské pozice)"
                            : "Automatický výpočet (3 měsíce pro standardní pozice)"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* --- Účty a přístupy --- */}
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
                          placeholder="jmeno.prijmeni@firma.cz"
                          className={focusRing}
                        />
                      </FormControl>
                      <FormDescription>
                        Nepovinné – vygeneruje IT oddělení po nástupu
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
                          placeholder="jprijmeni"
                        />
                      </FormControl>
                      <FormDescription>
                        Bude přiděleno po nástupu
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="personalNumber"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Osobní číslo</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className={`font-mono ${focusRing}`}
                          placeholder="123456"
                        />
                      </FormControl>
                      <FormDescription>
                        Bude přiděleno při nástupu
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* --- Poznámky --- */}
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
                      Další informace k nástupu zaměstnance
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* --- Submit --- */}
          <div className="space-y-3">
            <Button
              type="submit"
              className={`inline-flex w-full items-center justify-center gap-2 ${focusRing}`}
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

          {/* Minimalní globální úpravy nativních date/time vstupů */}
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

      {/* Success Modal */}
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
                    : "Změny byly uloženy"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm">
              <span className="font-medium">{successModal.name}</span>
              {successModal.mode === "create"
                ? ` byl${isActualMode ? "" : "a"} úspěšně ${isActualMode ? "zapsán jako skutečný nástup" : "přidán do plánovaných nástupů"}.`
                : " - změny byly úspěšně uloženy."}
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => handleSuccessModalClose(false)}>
              Pokračovat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Modal */}
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
                <DialogDescription>Operace se nepodařila</DialogDescription>
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
