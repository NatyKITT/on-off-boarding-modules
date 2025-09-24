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

type Mode = "create-planned" | "create-actual" | "edit"

type FormValues = {
  titleBefore?: string
  name: string
  surname: string
  titleAfter?: string
  email?: string
  positionNum: string
  positionName?: string
  department?: string
  unitName?: string
  plannedStart?: string
  actualStart?: string
  userName?: string
  userEmail?: string
  personalNumber?: string
  notes?: string
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

type NullableInitial = Partial<{
  titleBefore: string | null
  name: string | null
  surname: string | null
  titleAfter: string | null
  email: string | null
  positionNum: string | number | null
  positionName: string | null
  department: string | null
  unitName: string | null
  plannedStart: string | null
  actualStart: string | null
  userName: string | null
  userEmail: string | null
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
  onSuccess?: (newId?: number) => void
}

/* ------------ helpers ------------ */
const toPosNumString = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : ""

const trimOrEmpty = (v?: string | null) =>
  typeof v === "string" ? v.trim() : (v ?? "")

const undefIfEmpty = (v?: string | null) =>
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
  plannedStart?: string | null
  actualStart?: string | null
  email?: string | null
  userEmail?: string | null
  titleBefore?: string | null
  titleAfter?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  positionNum?: string | number | null
  positionName?: string | null
  department?: string | null
  unitName?: string | null
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
    email: trimOrEmpty(d.email),
    positionNum: toPosNumString(d.positionNum),
    positionName: trimOrEmpty(d.positionName),
    department: trimOrEmpty(d.department),
    unitName: trimOrEmpty(d.unitName),
    plannedStart: dateOnly(d.plannedStart),
    actualStart: dateOnly(d.actualStart),
    userName: trimOrEmpty(d.userName),
    userEmail: trimOrEmpty(d.userEmail),
    personalNumber: trimOrEmpty(d.personalNumber),
    notes: trimOrEmpty(d.notes),
    status: (d.status as FormValues["status"]) ?? "NEW",
  }
}

/* ------------ schema ------------ */
const emailOptional = z.union([
  z.literal(""),
  z.string().trim().email("Neplatný e-mail"),
])

const baseSchema = z.object({
  titleBefore: z.string().optional(),
  name: z.string().trim().min(1, "Jméno je povinné"),
  surname: z.string().trim().min(1, "Příjmení je povinné"),
  titleAfter: z.string().optional(),
  email: emailOptional.optional(),
  userEmail: emailOptional.optional(),
  positionNum: z.string().trim().min(1, "Číslo pozice je povinné"),
  positionName: z.string().optional(),
  department: z.string().optional(),
  unitName: z.string().optional(),
  plannedStart: z.string().optional(),
  actualStart: z.string().optional(),
  userName: z.string().optional(),
  personalNumber: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

export function OnboardingFormUnified({
  positions,
  id,
  initial,
  defaultCreateMode = "create-planned",
  prefillDate,
  editContext,
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
      email: trimOrEmpty(initial.email),
      positionNum: toPosNumString(initial.positionNum),
      positionName: trimOrEmpty(initial.positionName),
      department: trimOrEmpty(initial.department),
      unitName: trimOrEmpty(initial.unitName),
      plannedStart: dateOnly(initial.plannedStart),
      actualStart: dateOnly(initial.actualStart),
      userName: trimOrEmpty(initial.userName),
      userEmail: trimOrEmpty(initial.userEmail),
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
      email: "",
      positionNum: normalizedInitial.positionNum ?? "",
      positionName: normalizedInitial.positionName ?? "",
      department: normalizedInitial.department ?? "",
      unitName: normalizedInitial.unitName ?? "",
      plannedStart:
        normalizedInitial.plannedStart ??
        (mode === "create-planned" ? (prefillDate ?? "") : ""),
      actualStart:
        normalizedInitial.actualStart ??
        (mode === "create-actual" ? (prefillDate ?? "") : ""),
      userName: normalizedInitial.userName ?? "",
      userEmail: normalizedInitial.userEmail ?? "",
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
        if (!vals.plannedStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["plannedStart"],
            message: "Datum plánovaného nástupu je povinné.",
          })
        }
      }
      if (isCreateActual) {
        if (!vals.actualStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["actualStart"],
            message: "Datum skutečného nástupu je povinné.",
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

  useEffect(() => {
    if (!initial) return
    form.reset({ ...defaults, ...normalizedInitial })
  }, [normalizedInitial])

  useEffect(() => {
    const initPos = normalizedInitial.positionNum
    if (initPos && form.getValues("positionNum") !== initPos) {
      form.setValue("positionNum", toPosNumString(initPos), {
        shouldValidate: false,
        shouldDirty: false,
      })
    }
  }, [positions.length, normalizedInitial.positionNum])

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

        if ("email" in body) body.email = nullIfEmpty(values.email)
        if ("userEmail" in body) body.userEmail = nullIfEmpty(values.userEmail)
        if ("titleBefore" in body)
          body.titleBefore = nullIfEmpty(values.titleBefore)
        if ("titleAfter" in body)
          body.titleAfter = nullIfEmpty(values.titleAfter)
        if ("userName" in body) body.userName = nullIfEmpty(values.userName)
        if ("personalNumber" in body)
          body.personalNumber = nullIfEmpty(values.personalNumber)
        if ("notes" in body) body.notes = nullIfEmpty(values.notes)

        if ("plannedStart" in body && !values.plannedStart)
          delete body.plannedStart
        if ("actualStart" in body && !values.actualStart)
          delete body.actualStart

        if (dirty.positionNum) {
          const pos = positions.find(
            (p) => toPosNumString(p.num) === values.positionNum
          )
          body.positionName = pos?.name ?? values.positionName ?? ""
          body.department = pos?.dept_name ?? values.department ?? ""
          body.unitName = pos?.unit_name ?? values.unitName ?? ""
        }

        const res = await fetch(`/api/nastupy/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok) throw new Error(j?.message ?? "Uložení se nezdařilo.")
        if (j?.data) form.reset(apiToForm(j.data as ApiRow))
        onSuccess?.()
        return
      }

      // CREATE
      const isCreateActual = mode === "create-actual"
      const pos = positions.find(
        (p) => toPosNumString(p.num) === values.positionNum
      )
      const body = {
        titleBefore: undefIfEmpty(values.titleBefore),
        name: values.name,
        surname: values.surname,
        titleAfter: undefIfEmpty(values.titleAfter),
        email: undefIfEmpty(values.email),
        userEmail: undefIfEmpty(values.userEmail),
        positionNum: values.positionNum, // string
        positionName: pos?.name ?? values.positionName ?? "",
        department: pos?.dept_name ?? values.department ?? "",
        unitName: pos?.unit_name ?? values.unitName ?? "",
        plannedStart:
          mode === "create-planned"
            ? undefIfEmpty(values.plannedStart)
            : undefIfEmpty(values.actualStart),
        actualStart: isCreateActual
          ? undefIfEmpty(values.actualStart)
          : undefined,
        userName: undefIfEmpty(values.userName),
        personalNumber: undefIfEmpty(values.personalNumber),
        notes: undefIfEmpty(values.notes),
        status: values.status ?? (isCreateActual ? "COMPLETED" : "NEW"),
      }

      const res = await fetch(`/api/nastupy`, {
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

  // // připravené položky pro Select (string value + "číslo – jméno")
  // const positionItems = useMemo(
  //   () =>
  //     positions.map((p) => ({
  //       value: toPosNumString(p.num),
  //       label: `${toPosNumString(p.num)} – ${p.name ?? ""}`,
  //     })),
  //   [positions]
  // )

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
              ["email", "E-mail (nepovinné)"],
            ] as const
          ).map(([field, label]) => (
            <FormField
              key={field}
              name={field as keyof FormValues}
              control={form.control}
              render={({ field: f }) => (
                <FormItem
                  className={
                    field === "name" || field === "surname"
                      ? "md:col-span-2"
                      : ""
                  }
                >
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input
                      {...f}
                      type={field === "email" ? "email" : "text"}
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

        {/* Plánovaný nástup */}
        {showPlanned && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              name="plannedStart"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Datum <span className="font-medium">plánovaného</span>{" "}
                    nástupu
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

        {/* Skutečný nástup + firemní údaje */}
        {showActual && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              name="actualStart"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Datum <span className="font-medium">skutečného</span>{" "}
                    nástupu
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
                  <FormLabel>Firemní účet (e-mail)</FormLabel>
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
              <FormLabel>Poznámka (HR / IT / obecně)</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="pt-1">
          <Button type="submit" className="w-full" disabled={submitDisabled}>
            {id
              ? "Uložit změny"
              : mode === "create-actual"
                ? "Zapsat skutečný nástup"
                : "Přidat plánovaný nástup"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
