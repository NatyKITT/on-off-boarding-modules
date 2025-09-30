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
import { Textarea } from "@/components/ui/textarea" /* ----------------------------- types ----------------------------- */

/* ----------------------------- types ----------------------------- */
type Mode = "create-planned" | "create-actual" | "edit"

export type FormValues = {
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

/* --------------------------- helpers ---------------------------- */
const nullIfEmpty = (v?: string | null) =>
  v == null || String(v).trim() === "" ? null : v
const fmt = (d: Date) => format(d, "yyyy-MM-dd")
const todayStr = () => fmt(new Date())

const managerialKeywords = ["vedení", "ředitel", "vedoucí", "tajemník"]
const stripAccents = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
const isManagerialPosition = (positionName: string): boolean => {
  const low = stripAccents(positionName)
  return managerialKeywords.some((kw) => low.includes(stripAccents(kw)))
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

  userEmail: z
    .string()
    .email("Neplatný firemní e-mail")
    .or(z.literal(""))
    .optional(),
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-muted-foreground hover:text-foreground"
          title="Vymazat čas"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

/* --------- window-safe úložiště newId --------- */
declare global {
  interface Window {
    __lastCreatedId?: number
  }
}

/* --------- body scroll lock při otevřených modalech --------- */
function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    const el = document.documentElement
    const body = document.body
    if (locked) {
      const prevHtml = el.style.overflow
      const prevBody = body.style.overflow
      el.style.overflow = "hidden"
      body.style.overflow = "hidden"
      return () => {
        el.style.overflow = prevHtml
        body.style.overflow = prevBody
      }
    }
  }, [locked])
}

/* ------------------- Success Modal Component ------------------- */
interface SuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  employeeName: string
  isActualMode: boolean
}

function SuccessModal({
  open,
  onOpenChange,
  mode,
  employeeName,
  isActualMode,
}: SuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle className="size-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <DialogTitle>Úspěšně dokončeno</DialogTitle>
              <DialogDescription>
                {mode === "create"
                  ? `${isActualMode ? "Skutečný" : "Plánovaný"} nástup byl založen`
                  : "Změny byly uloženy"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm">
            <span className="font-medium">{employeeName}</span>
            {mode === "create"
              ? ` byl${isActualMode ? "" : "a"} úspěšně ${isActualMode ? "zapsán jako skutečný nástup" : "přidán do plánovaných nástupů"}.`
              : " - změny byly úspěšně uloženy."}
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Pokračovat</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------- Error Modal Component ------------------- */
interface ErrorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: string
}

function ErrorModal({ open, onOpenChange, message }: ErrorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zkusit znovu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

  // Modální okna pro feedback
  const [successModal, setSuccessModal] = useState<{
    open: boolean
    mode: "create" | "edit"
    name: string
  }>({ open: false, mode: "create", name: "" })

  const [errorModal, setErrorModal] = useState<{
    open: boolean
    message: string
  }>({ open: false, message: "" })

  // zamkni pozadí, když je otevřený modal
  useBodyScrollLock(successModal.open || errorModal.open)

  const [manualDates, setManualDates] = useState<boolean>(false)
  const [posOpen, setPosOpen] = useState(false)

  // bezpečné defaulty + merge s initial + prefillDate
  const defaults: FormValues = useMemo(() => {
    const isEdit = Boolean(id) || effectiveMode === "edit"
    const base: FormValues = {
      titleBefore: "",
      name: "",
      surname: "",
      titleAfter: "",
      email: "",
      positionNum: "",
      positionName: "",
      department: "",
      unitName: "",
      plannedStart: isActualMode ? undefined : todayStr(),
      actualStart: isActualMode ? todayStr() : undefined,
      startTime: "",
      probationEnd: "",
      userEmail: "",
      userName: "",
      personalNumber: "",
      notes: "",
      status: "NEW",
      ...initial,
    }
    if (prefillDate && !isEdit) {
      if (isActualMode) base.actualStart = prefillDate
      else base.plannedStart = prefillDate
    }
    return base
  }, [id, initial, isActualMode, prefillDate, effectiveMode])

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

  const syncingRef = useRef(false)

  // automatický výpočet zkušebky (3M/6M)
  useEffect(() => {
    if (manualDates || syncingRef.current) return
    const startDate = isActualMode ? watchActualStart : watchPlannedStart
    if (!startDate || !watchPositionName) return
    const date = new Date(startDate)
    if (Number.isNaN(date.getTime())) return
    const monthsToAdd = isManagerialPosition(watchPositionName) ? 6 : 3
    const probationEndDate = fmt(addMonths(date, monthsToAdd))
    const currentProbationEnd = form.getValues("probationEnd") ?? ""
    if (currentProbationEnd !== probationEndDate) {
      syncingRef.current = true
      form.setValue("probationEnd", probationEndDate, { shouldValidate: true })
      syncingRef.current = false
    }
  }, [
    watchPlannedStart,
    watchActualStart,
    watchPositionName,
    manualDates,
    isActualMode,
    form,
  ])

  useBodyScrollLock(true)

  // doplnění názvu/oddělení po výběru čísla pozice
  useEffect(() => {
    if (!watchPositionNum || !positions.length) return
    const pos = positions.find((p) => p.num === watchPositionNum)
    if (pos) {
      form.setValue("positionName", pos.name)
      form.setValue("department", pos.dept_name)
      form.setValue("unitName", pos.unit_name)
    }
  }, [watchPositionNum, positions, form])

  async function onSubmit(values: FormValues) {
    try {
      const payload: Record<string, unknown> = {
        titleBefore: nullIfEmpty(values.titleBefore),
        titleAfter: nullIfEmpty(values.titleAfter),
        name: values.name,
        surname: values.surname,
        email: values.email,
        positionNum: values.positionNum,
        positionName: values.positionName,
        department: values.department,
        unitName: values.unitName,
        startTime: nullIfEmpty(values.startTime),
        probationEnd: nullIfEmpty(values.probationEnd),
        userEmail: nullIfEmpty(values.userEmail),
        userName: nullIfEmpty(values.userName),
        personalNumber: nullIfEmpty(values.personalNumber),
        notes: nullIfEmpty(values.notes),
      }

      // PŘESNĚ jeden datum podle režimu
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

      if (!id && json?.data?.id) window.__lastCreatedId = Number(json.data.id)

      const fullName = `${values.name} ${values.surname}`
      setSuccessModal({
        open: true,
        mode: id ? "edit" : "create",
        name: fullName,
      })

      // Po úspěchu zavřeme formulář
      onSuccess?.(window.__lastCreatedId)
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

  const positionsForSearch = useMemo(() => {
    return positions.map((p) => ({
      ...p,
      _key: `${p.num} ${p.name}`,
      _normNum: stripAccents(p.num),
      _normName: stripAccents(p.name),
    }))
  }, [positions])

  const pickPosition = (p: Position) => {
    form.setValue("positionNum", p.num, { shouldValidate: true })
    form.setValue("positionName", p.name, { shouldValidate: true })
    form.setValue("department", p.dept_name, { shouldValidate: true })
    form.setValue("unitName", p.unit_name, { shouldValidate: true })
    setPosOpen(false)
  }

  const handleSuccessModalClose = (open: boolean) => {
    setSuccessModal((prev) => ({ ...prev, open }))
    if (!open) {
      window.__lastCreatedId = undefined
    }
  }

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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder="např. Ing."
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder="např. Ph.D."
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder="Křestní jméno"
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder="Rodinné příjmení"
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
                      <FormLabel>Osobní e-mail *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder="osobni@email.com"
                        />
                      </FormControl>
                      <FormDescription>
                        E-mail pro komunikaci před nástupem
                      </FormDescription>
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
                        <Popover open={posOpen} onOpenChange={setPosOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
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
                          >
                            <Command
                              filter={(val, search) => {
                                const s = stripAccents(search)
                                const v = stripAccents(val)
                                return v.includes(s) ? 1 : 0
                              }}
                            >
                              <CommandInput placeholder="Hledat číslo nebo název pozice..." />
                              <CommandEmpty>
                                Žádná pozice nenalezena
                              </CommandEmpty>

                              <CommandList
                                className="max-h-80 overflow-y-auto overscroll-contain"
                                onWheel={(e) => e.stopPropagation()}
                              >
                                <CommandGroup>
                                  {positionsForSearch.map((p) => (
                                    <CommandItem
                                      key={p.id}
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
                        <Input
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className="bg-muted"
                          readOnly
                        />
                      </FormControl>
                      <FormDescription>Automaticky vyplněno</FormDescription>
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
                        <Input
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className="bg-muted"
                          readOnly
                        />
                      </FormControl>
                      <FormDescription>Automaticky vyplněno</FormDescription>
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
                        <Input
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className="bg-muted"
                          readOnly
                        />
                      </FormControl>
                      <FormDescription>Automaticky vyplněno</FormDescription>
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
                  onCheckedChange={(v) => setManualDates(Boolean(v))}
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
                              value={
                                typeof field.value === "string"
                                  ? field.value
                                  : ""
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            {manualDates
                              ? "Automatika vypnutá"
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
                              value={
                                typeof field.value === "string"
                                  ? field.value
                                  : ""
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            {manualDates
                              ? "Automatika vypnutá"
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className={manualDates ? "" : "bg-muted"}
                          readOnly={!manualDates}
                        />
                      </FormControl>
                      <FormDescription>
                        {manualDates
                          ? "Můžete upravit ručně"
                          : watchPositionName &&
                              isManagerialPosition(watchPositionName)
                            ? "Automaticky (6 měsíců pro manažerské pozice)"
                            : "Automaticky (3 měsíce pro standardní pozice)"}
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder="jmeno.prijmeni@firma.cz"
                        />
                      </FormControl>
                      <FormDescription>
                        Nepovinné – vygeneruje se po nástupu
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className="font-mono"
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
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className="font-mono"
                          placeholder="123456"
                        />
                      </FormControl>
                      <FormDescription>
                        Bude přiděleno po nástupu
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
                      />
                    </FormControl>
                    <FormDescription>
                      Další informace k nástupu zaměstnanca
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
              className="inline-flex w-full items-center justify-center gap-2"
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

          {/* CSS pro date/time inputy */}
          <style jsx>{`
            :global(input[type="date"]),
            :global(input[type="time"]) {
              outline: none !important;
              box-shadow: none !important;
              border: 1px solid hsl(var(--border)) !important;
              appearance: none;
              -webkit-appearance: none;
              -moz-appearance: textfield;
            }
            :global(input[type="date"]::-webkit-inner-spin-button),
            :global(input[type="time"]::-webkit-inner-spin-button),
            :global(input[type="time"]::-webkit-clear-button) {
              display: none;
            }
            :global(input[type="date"]::-webkit-calendar-picker-indicator),
            :global(input[type="time"]::-webkit-calendar-picker-indicator) {
              opacity: 0.6;
            }
          `}</style>
        </form>
      </Form>

      {/* Success Modal */}
      <SuccessModal
        open={successModal.open}
        onOpenChange={handleSuccessModalClose}
        mode={successModal.mode}
        employeeName={successModal.name}
        isActualMode={isActualMode}
      />

      {/* Error Modal */}
      <ErrorModal
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
        message={errorModal.message}
      />
    </>
  )
}
