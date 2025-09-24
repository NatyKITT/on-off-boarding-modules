"use client"

import * as React from "react"
import { useEffect, useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, type FieldErrors } from "react-hook-form"
import { z } from "zod"

import { type Position } from "@/types/position"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PositionCombobox } from "@/components/common/position-combobox"

/* -------------------------------- types -------------------------------- */
type Mode = "create-planned" | "create-actual" | "edit"

type FormValues = {
  titleBefore?: string
  name: string
  surname: string
  titleAfter?: string
  userEmail?: string
  positionNum: string
  positionName?: string
  department?: string
  unitName?: string
  plannedEnd?: string
  actualEnd?: string
  userName?: string
  personalNumber?: string
  notes?: string
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

type NullableInitial = Partial<{
  titleBefore: string | null
  name: string | null
  surname: string | null
  titleAfter: string | null
  userEmail: string | null
  positionNum: string | number | null
  positionName: string | null
  department: string | null
  unitName: string | null
  plannedEnd: string | null
  actualEnd: string | null
  userName: string | null
  personalNumber: string | null
  notes: string | null
  status: "NEW" | "IN_PROGRESS" | "COMPLETED" | null
}>

type Props = {
  positions: Position[]
  id?: number
  initial?: NullableInitial
  defaultCreateMode?: Mode
  prefillDate?: string
  editContext?: "planned" | "actual"
  submitLabel?: string
  onSuccess?: (newId?: number) => void
}

/* ------------------------------- helpers -------------------------------- */
const toPosNumString = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : ""

const trimOrEmpty = (v?: string | null) =>
  typeof v === "string" ? v.trim() : (v ?? "")
const nn = (v?: string | null) =>
  v == null || String(v).trim() === "" ? undefined : v
const nullIfEmpty = (v?: string | null) =>
  v == null || String(v).trim() === "" ? null : v

function firstErrorMessage(errors: FieldErrors<FormValues>) {
  const q: unknown[] = [errors]
  while (q.length) {
    const v = q.shift()
    if (!v || typeof v !== "object") continue
    const rec = v as Record<string, unknown>
    if (typeof rec.message === "string") return rec.message
    for (const val of Object.values(rec))
      if (val && typeof val === "object") q.push(val)
  }
  return undefined
}

type DirtyFlags<T> = Partial<Record<keyof T, boolean>>
function pickDirty<T extends Record<string, unknown>>(
  values: T,
  dirty: DirtyFlags<T>
) {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(values) as (keyof T)[])
    if (dirty[k]) out[k as string] = values[k]
  return out
}

type ApiRow = Partial<FormValues> & {
  id?: number
  plannedEnd?: string | null
  actualEnd?: string | null
  userEmail?: string | null
  positionNum?: string | number | null
  positionName?: string | null
  department?: string | null
  unitName?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED" | null
}

function apiToForm(d: ApiRow): FormValues {
  const dateOnly = (s?: string | null) =>
    typeof s === "string" && s ? s.slice(0, 10) : ""
  return {
    titleBefore: trimOrEmpty(d.titleBefore),
    name: trimOrEmpty(d.name),
    surname: trimOrEmpty(d.surname),
    titleAfter: trimOrEmpty(d.titleAfter),
    userEmail: trimOrEmpty(d.userEmail),
    positionNum: toPosNumString(d.positionNum),
    positionName: trimOrEmpty(d.positionName),
    department: trimOrEmpty(d.department),
    unitName: trimOrEmpty(d.unitName),
    plannedEnd: dateOnly(d.plannedEnd),
    actualEnd: dateOnly(d.actualEnd),
    userName: trimOrEmpty(d.userName),
    personalNumber: trimOrEmpty(d.personalNumber),
    notes: trimOrEmpty(d.notes),
    status: (d.status as FormValues["status"]) ?? "NEW",
  }
}

/* ------------------------------- schema --------------------------------- */
const emailOptional = z.union([
  z.literal(""),
  z.string().trim().email("Neplatný e-mail"),
])

const baseSchema = z.object({
  titleBefore: z.string().optional(),
  name: z.string().trim().min(1, "Jméno je povinné"),
  surname: z.string().trim().min(1, "Příjmení je povinné"),
  titleAfter: z.string().optional(),
  userEmail: emailOptional.optional(),
  positionNum: z.string().trim().min(1, "Číslo pozice je povinné"),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),
  plannedEnd: z.string().optional(),
  actualEnd: z.string().optional(),
  userName: z.string().optional(),
  personalNumber: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

/* --------------------------------- UI ----------------------------------- */
export function OffboardingFormUnified({
  positions,
  id,
  initial,
  defaultCreateMode = "create-planned",
  prefillDate,
  editContext,
  submitLabel,
  onSuccess,
}: Props) {
  const mode = defaultCreateMode

  const normalizedInitial: Partial<FormValues> = useMemo(() => {
    if (!initial) return {}
    const dateOnly = (s?: string | null) =>
      typeof s === "string" && s ? s.slice(0, 10) : undefined
    return {
      titleBefore: trimOrEmpty(initial.titleBefore),
      name: trimOrEmpty(initial.name),
      surname: trimOrEmpty(initial.surname),
      titleAfter: trimOrEmpty(initial.titleAfter),
      userEmail: trimOrEmpty(initial.userEmail),
      positionNum: toPosNumString(initial.positionNum),
      positionName: trimOrEmpty(initial.positionName),
      department: trimOrEmpty(initial.department),
      unitName: trimOrEmpty(initial.unitName),
      plannedEnd: dateOnly(initial.plannedEnd),
      actualEnd: dateOnly(initial.actualEnd),
      userName: trimOrEmpty(initial.userName),
      personalNumber: trimOrEmpty(initial.personalNumber),
      notes: trimOrEmpty(initial.notes),
      status: initial.status ?? undefined,
    }
  }, [initial])

  const defaults: FormValues = useMemo(
    () => ({
      titleBefore: "",
      name: "",
      surname: "",
      titleAfter: "",
      userEmail: "",
      positionNum: normalizedInitial.positionNum ?? "",
      positionName: normalizedInitial.positionName ?? "",
      department: normalizedInitial.department ?? "",
      unitName: normalizedInitial.unitName ?? "",
      plannedEnd:
        normalizedInitial.plannedEnd ??
        (mode === "create-planned" ? (prefillDate ?? "") : ""),
      actualEnd:
        normalizedInitial.actualEnd ??
        (mode === "create-actual" ? (prefillDate ?? "") : ""),
      userName: normalizedInitial.userName ?? "",
      personalNumber: normalizedInitial.personalNumber ?? "",
      notes: normalizedInitial.notes ?? "",
      status: normalizedInitial.status ?? "NEW",
    }),
    [normalizedInitial, mode, prefillDate]
  )

  const schema = useMemo(() => {
    const isCreatePlanned = !id && mode === "create-planned"
    const isCreateActual = !id && mode === "create-actual"
    const isEditPlanned = !!id && editContext === "planned"
    return baseSchema.superRefine((vals, ctx) => {
      if (isCreatePlanned || isEditPlanned) {
        if (!vals.plannedEnd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["plannedEnd"],
            message: "Datum plánovaného odchodu je povinné.",
          })
        }
      }
      if (isCreateActual) {
        if (!vals.actualEnd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["actualEnd"],
            message: "Datum skutečného odchodu je povinné.",
          })
        }
      }
    })
  }, [id, mode, editContext])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onSubmit",
  })
  const isSubmitting = form.formState.isSubmitting

  // initial → form
  useEffect(() => {
    if (!initial) return
    form.reset({ ...defaults, ...normalizedInitial })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedInitial])

  // dorovnat positionNum po načtení pozic NEBO změně initial
  useEffect(() => {
    const initPos = normalizedInitial.positionNum
    if (initPos && form.getValues("positionNum") !== initPos) {
      form.setValue("positionNum", toPosNumString(initPos), {
        shouldValidate: false,
        shouldDirty: false,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length, normalizedInitial.positionNum])

  // auto-doplnění názvů dle pozice
  const watchPositionNum = form.watch("positionNum")
  const selected = useMemo(
    () => positions.find((p) => toPosNumString(p.num) === watchPositionNum),
    [positions, watchPositionNum]
  )
  useEffect(() => {
    if (selected) {
      form.setValue("positionName", selected.name ?? "", { shouldDirty: true })
      form.setValue("department", selected.dept_name ?? "", {
        shouldDirty: true,
      })
      form.setValue("unitName", selected.unit_name ?? "", { shouldDirty: true })
    }
  }, [selected, form])

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    alert(
      firstErrorMessage(errors) ?? "Zkontrolujte zvýrazněná pole ve formuláři."
    )
  }

  async function onSubmit(values: FormValues) {
    try {
      if (id) {
        const dirty = form.formState.dirtyFields as DirtyFlags<FormValues>
        const body = pickDirty(values, dirty)

        if ("userEmail" in body) body.userEmail = nullIfEmpty(values.userEmail)
        if ("plannedEnd" in body && !values.plannedEnd) delete body.plannedEnd
        if ("actualEnd" in body && !values.actualEnd) delete body.actualEnd

        if (dirty.positionNum) {
          const pos = positions.find(
            (p) => toPosNumString(p.num) === values.positionNum
          )
          body.positionName = pos?.name ?? values.positionName ?? ""
          body.department = pos?.dept_name ?? values.department ?? ""
          body.unitName = pos?.unit_name ?? values.unitName ?? ""
        }

        const res = await fetch(`/api/odchody/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok) throw new Error(j?.message ?? "Uložení se nezdařilo.")

        if (j?.data) {
          const next = apiToForm(j.data as ApiRow)
          form.reset(next)
        }
        onSuccess?.()
        return
      }

      // CREATE
      const isCreateActual = mode === "create-actual"
      const pos = positions.find(
        (p) => toPosNumString(p.num) === values.positionNum
      )
      const body = {
        titleBefore: nullIfEmpty(values.titleBefore),
        name: values.name,
        surname: values.surname,
        titleAfter: nullIfEmpty(values.titleAfter),
        positionNum: values.positionNum, // string
        positionName: pos?.name ?? values.positionName ?? "",
        department: pos?.dept_name ?? values.department ?? "",
        unitName: pos?.unit_name ?? values.unitName ?? "",
        plannedEnd:
          mode === "create-planned"
            ? nn(values.plannedEnd)
            : nn(values.actualEnd),
        actualEnd: isCreateActual ? nn(values.actualEnd) : undefined,
        userEmail: nullIfEmpty(values.userEmail),
        userName: nullIfEmpty(values.userName),
        personalNumber: nullIfEmpty(values.personalNumber),
        notes: nullIfEmpty(values.notes),
        status: values.status ?? (isCreateActual ? "COMPLETED" : "NEW"),
      }

      const res = await fetch(`/api/odchody`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message ?? "Vytvoření se nezdařilo.")
      if (j?.data) form.reset(apiToForm(j.data as ApiRow))
      onSuccess?.(j?.data?.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Operace se nezdařila.")
    }
  }

  const isEdit = Boolean(id) || mode === "edit"
  const showPlanned = isEdit
    ? editContext !== "actual"
    : mode !== "create-actual"
  const showActual = isEdit
    ? editContext !== "planned"
    : mode !== "create-planned"

  const submitDisabled =
    isSubmitting ||
    !form.getValues("positionNum") ||
    (positions.length > 0 &&
      !positions.some(
        (p) => toPosNumString(p.num) === form.getValues("positionNum")
      ))

  const btnClass = "inline-flex w-full items-center justify-center gap-2"

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="space-y-5"
      >
        {/* Identita */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(
            [
              ["titleBefore", "Titul před"],
              ["name", "Jméno *"],
              ["surname", "Příjmení *"],
              ["titleAfter", "Titul za"],
            ] as const
          ).map(([field, label]) => (
            <FormField
              key={field}
              name={field as keyof FormValues}
              control={form.control}
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input
                      {...f}
                      type="text"
                      value={typeof f.value === "string" ? f.value : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        {/* Pozice */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            name="positionNum"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Číslo pozice *</FormLabel>
                <FormControl>
                  <>
                    <PositionCombobox
                      positions={positions}
                      fields={{
                        num: "positionNum",
                        name: "positionName",
                        dept: "department",
                        unit: "unitName",
                      }}
                      placeholder="Napiš číslo nebo název…"
                      className="inline-flex items-center justify-center gap-2"
                    />
                    <input {...field} className="hidden" />
                  </>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {(["positionName", "department", "unitName"] as const).map(
            (fname) => (
              <FormField
                key={fname}
                name={fname}
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {fname === "positionName"
                        ? "Pozice"
                        : fname === "department"
                          ? "Odbor"
                          : "Oddělení"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={
                          typeof field.value === "string" ? field.value : ""
                        }
                        disabled
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )
          )}
        </div>

        {/* Plánovaný odchod */}
        {showPlanned && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              name="plannedEnd"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Datum <span className="font-medium">plánovaného</span>{" "}
                    odchodu
                    {!isEdit && mode === "create-planned" ? " *" : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={typeof field.value === "string" ? field.value : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Skutečný odchod + firemní údaje */}
        {showActual && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              name="actualEnd"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Datum <span className="font-medium">skutečného</span>{" "}
                    odchodu
                    {!isEdit && mode === "create-actual" ? " *" : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={typeof field.value === "string" ? field.value : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="userEmail"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firemní účet (e-mail, nepovinné)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      {...field}
                      value={typeof field.value === "string" ? field.value : ""}
                    />
                  </FormControl>
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
                      value={typeof field.value === "string" ? field.value : ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              name="personalNumber"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Osobní číslo</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={typeof field.value === "string" ? field.value : ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Poznámka */}
        <FormField
          name="notes"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Poznámka</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="pt-1">
          <Button type="submit" className={btnClass} disabled={submitDisabled}>
            {submitLabel ??
              (id
                ? "Uložit změny"
                : mode === "create-actual"
                  ? "Zapsat skutečný odchod"
                  : "Přidat plánovaný odchod")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
