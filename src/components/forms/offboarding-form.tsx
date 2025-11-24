"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { addMonths, format, subMonths } from "date-fns"
import { AlertCircle, Calendar, Trash2, User } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
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
import { Textarea } from "@/components/ui/textarea"
import { EmployeeCombobox } from "@/components/common/employee-combobox"

type Mode = "create-planned" | "create-actual" | "edit"

export type FormValues = {
  titleBefore?: string
  name: string
  surname: string
  titleAfter?: string
  personalNumber: string
  positionNum: string
  positionName: string
  department: string
  unitName: string
  userEmail?: string
  noticeFiled: string
  plannedEnd?: string
  actualEnd?: string
  notes?: string
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
  noticeEnd?: string
  noticeMonths?: number
  hasCustomDates?: boolean
}

type Props = {
  id?: number
  initial?: Partial<FormValues>
  mode?: Mode
  defaultCreateMode?: Mode
  prefillDate?: string
  editContext?: "planned" | "actual"
  excludePersonalNumbers?: string[]
  onSuccess?: (newId?: number) => void | Promise<void>
}

/* --------------------------- helpers ---------------------------- */
const undefIfEmpty = (v?: string | null) =>
  v == null || String(v).trim() === "" ? undefined : v
const ensure = (v?: string | null, fb = "-") => (v ?? "").trim() || fb
const toYMD = (d: Date) => format(d, "yyyy-MM-dd")
const todayStr = () => toYMD(new Date())

const nextTempPersonalNumber = (exclude: string[] = []): string => {
  const ban = new Set(exclude.map((x) => x.trim()))
  let i = 1
  while (ban.has(String(i))) i++
  return String(i)
}

function inferManualDates(
  init: Partial<FormValues> | undefined,
  isActual: boolean
): boolean {
  if (!init) return false
  if (typeof init.hasCustomDates === "boolean") return init.hasCustomDates
  const notice = init.noticeFiled || init.noticeEnd
  const end = isActual ? init.actualEnd : init.plannedEnd
  if (!notice || !end) return false
  const n = new Date(notice)
  const e = new Date(end)
  if (Number.isNaN(n.getTime()) || Number.isNaN(e.getTime())) return false
  return toYMD(addMonths(n, 2)) !== toYMD(e)
}

/* ---------------------------- schema ---------------------------- */
const baseSchema = z.object({
  titleBefore: z.string().optional(),
  name: z.string().trim().min(1, "Jméno je povinné"),
  surname: z.string().trim().min(1, "Příjmení je povinné"),
  titleAfter: z.string().optional(),
  personalNumber: z.string().trim().min(1, "Osobní číslo je povinné"),
  userEmail: z.string().email("Neplatný e-mail").or(z.literal("")).optional(),
  positionNum: z.string().trim().min(1, "Číslo pozice je povinné"),
  positionName: z.string().trim().min(1, "Název pozice je povinný"),
  department: z.string().trim().min(1, "Odbor je povinný"),
  unitName: z.string().trim().min(1, "Oddělení je povinné"),
  noticeFiled: z.string().trim().min(1, "Datum podání výpovědi je povinné"),
  plannedEnd: z
    .string()
    .optional()
    .refine(
      (v) => !v || !Number.isNaN(new Date(v).getTime()),
      "Neplatné datum"
    ),
  actualEnd: z
    .string()
    .optional()
    .refine(
      (v) => !v || !Number.isNaN(new Date(v).getTime()),
      "Neplatné datum"
    ),
  notes: z.string().optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED"]).optional(),
})

export function OffboardingFormUnified({
  id,
  initial,
  mode,
  defaultCreateMode,
  prefillDate,
  editContext,
  excludePersonalNumbers = [],
  onSuccess,
}: Props) {
  const effectiveMode: Mode = useMemo(
    () => mode ?? defaultCreateMode ?? "create-planned",
    [mode, defaultCreateMode]
  )
  const isEdit = Boolean(id) || effectiveMode === "edit"
  const isActualMode = useMemo(
    () => effectiveMode === "create-actual" || editContext === "actual",
    [effectiveMode, editContext]
  )

  const inferredManualFlag = useMemo(
    () => inferManualDates(initial, isActualMode),
    [initial, isActualMode]
  )

  const [selectedFromEos, setSelectedFromEos] = useState<boolean>(() =>
    Boolean(isEdit || initial?.personalNumber?.trim())
  )
  const [manualDates, setManualDates] = useState<boolean>(
    () => inferredManualFlag
  )
  useEffect(() => {
    setManualDates(inferredManualFlag)
  }, [inferredManualFlag, id])

  const lastEditedRef = useRef<"notice" | "end" | null>(null)

  const [openSuccess, setOpenSuccess] = useState(false)
  const [openError, setOpenError] = useState(false)
  const [successName, setSuccessName] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const firstDateRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    firstDateRef.current?.focus()
  }, [])

  /* ---------------------------- defaults ---------------------------- */
  const defaults: FormValues = useMemo(() => {
    const base: FormValues = {
      titleBefore: "",
      name: "",
      surname: "",
      titleAfter: "",
      personalNumber: "",
      userEmail: "",
      positionNum: "",
      positionName: "",
      department: "",
      unitName: "",
      noticeFiled: "",
      plannedEnd: "",
      actualEnd: "",
      notes: "",
      status: "NEW",
      hasCustomDates: inferredManualFlag,
    }

    if (initial) {
      Object.assign(base, initial)
      if (isEdit && initial.noticeEnd)
        base.noticeFiled = initial.noticeEnd.slice(0, 10)
    }

    if (!isEdit && !prefillDate) {
      if (!base.noticeFiled) base.noticeFiled = todayStr()
      const endAuto = toYMD(addMonths(new Date(base.noticeFiled), 2))
      if (isActualMode) base.actualEnd ||= endAuto
      else base.plannedEnd ||= endAuto
    }

    if (!isEdit && prefillDate) {
      if (isActualMode) base.actualEnd = prefillDate
      else base.plannedEnd = prefillDate
      if (!base.noticeFiled) {
        const end = new Date(prefillDate)
        if (!Number.isNaN(end.getTime()))
          base.noticeFiled = toYMD(subMonths(end, 2))
      }
    }

    if (isEdit && !base.noticeFiled) {
      const endStr = base.actualEnd || base.plannedEnd
      if (endStr) {
        const end = new Date(endStr)
        if (!Number.isNaN(end.getTime()))
          base.noticeFiled = toYMD(subMonths(end, 2))
      }
    }

    base.personalNumber = base.personalNumber?.trim()
      ? base.personalNumber
      : nextTempPersonalNumber(excludePersonalNumbers)

    return base
  }, [
    initial,
    isActualMode,
    prefillDate,
    isEdit,
    inferredManualFlag,
    excludePersonalNumbers,
  ])

  const schema = useMemo(
    () =>
      baseSchema.superRefine((vals, ctx) => {
        if (!isEdit && !selectedFromEos) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["personalNumber"],
            message: "Musíte vybrat zaměstnance z EOS systému.",
          })
        }
        if (isActualMode) {
          if (!vals.actualEnd) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actualEnd"],
              message: "Datum skutečného odchodu je povinné.",
            })
          }
        } else {
          if (!vals.plannedEnd) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["plannedEnd"],
              message: "Datum předpokládaného odchodu je povinné.",
            })
          }
        }
      }),
    [isEdit, selectedFromEos, isActualMode]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(defaults)
    lastEditedRef.current = null
  }, [defaults, form])

  const isSubmitting = form.formState.isSubmitting
  const watchPersonal = form.watch("personalNumber")

  useEffect(() => {
    const ok = Boolean(watchPersonal && watchPersonal.trim() !== "")
    setSelectedFromEos(ok || isEdit)
    if (ok) form.clearErrors("personalNumber")
  }, [watchPersonal, form, isEdit])

  const endField: "plannedEnd" | "actualEnd" = isActualMode
    ? "actualEnd"
    : "plannedEnd"

  const noticeWatch = form.watch("noticeFiled")
  const endWatch = form.watch(endField)

  useEffect(() => {
    if (manualDates) return
    if (lastEditedRef.current !== "notice") return
    if (!noticeWatch) {
      lastEditedRef.current = null
      return
    }
    const base = new Date(noticeWatch)
    if (isNaN(base.getTime())) {
      lastEditedRef.current = null
      return
    }
    const nextEnd = toYMD(addMonths(base, 2))
    const curEnd = form.getValues(endField) || ""
    if (curEnd !== nextEnd) {
      form.setValue(endField, nextEnd, {
        shouldValidate: true,
        shouldDirty: true,
      })
    }
    lastEditedRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeWatch, endField, manualDates])

  useEffect(() => {
    if (manualDates) return
    if (lastEditedRef.current !== "end") return
    if (!endWatch) {
      lastEditedRef.current = null
      return
    }
    const d = new Date(endWatch)
    if (isNaN(d.getTime())) {
      lastEditedRef.current = null
      return
    }
    const nextNotice = toYMD(subMonths(d, 2))
    const curNotice = form.getValues("noticeFiled") || ""
    if (curNotice !== nextNotice) {
      form.setValue("noticeFiled", nextNotice, {
        shouldValidate: true,
        shouldDirty: true,
      })
    }
    lastEditedRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endWatch, manualDates])

  useEffect(() => {
    if (manualDates) return
    const e = form.getValues(endField)
    const n = form.getValues("noticeFiled")
    if (e) {
      const d = new Date(e)
      if (!isNaN(d.getTime())) {
        form.setValue("noticeFiled", toYMD(subMonths(d, 2)), {
          shouldValidate: true,
        })
        return
      }
    }
    if (n) {
      const d = new Date(n)
      if (!isNaN(d.getTime())) {
        form.setValue(endField, toYMD(addMonths(d, 2)), {
          shouldValidate: true,
        })
      }
    }
  }, [manualDates, endField, form])

  async function onSubmit(values: FormValues) {
    try {
      let noticeMonths = 2
      if (values.noticeFiled && (values.plannedEnd || values.actualEnd)) {
        const noticeDate = new Date(values.noticeFiled)
        const endDate = new Date(values.actualEnd || values.plannedEnd || "")
        if (!isNaN(noticeDate.getTime()) && !isNaN(endDate.getTime())) {
          const daysDiff = Math.round(
            (endDate.getTime() - noticeDate.getTime()) / 86400000
          )
          const monthsDiff = Math.round(daysDiff / 30.44)
          noticeMonths = Math.max(1, monthsDiff)
        }
      }

      const body = {
        ...values,
        personalNumber: ensure(
          values.personalNumber,
          nextTempPersonalNumber(excludePersonalNumbers)
        ),
        positionNum: ensure(values.positionNum, "0"),
        positionName: ensure(values.positionName, "-"),
        department: ensure(values.department, "-"),
        unitName: ensure(values.unitName, "-"),

        titleBefore: undefIfEmpty(values.titleBefore),
        titleAfter: undefIfEmpty(values.titleAfter),
        userEmail: undefIfEmpty(values.userEmail),
        plannedEnd: undefIfEmpty(values.plannedEnd),
        actualEnd: undefIfEmpty(values.actualEnd),
        notes: undefIfEmpty(values.notes),

        status: values.status ?? (isActualMode ? "COMPLETED" : "NEW"),
        noticeEnd: values.noticeFiled || undefined,
        noticeMonths,
        hasCustomDates: manualDates,
      }

      const url = id ? `/api/odchody/${id}` : `/api/odchody`
      const method = id ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message ?? "Operace se nezdařila.")

      setSuccessName(`${values.name} ${values.surname}`)
      await onSuccess?.(json?.data?.id)
      setOpenSuccess(true)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Operace se nezdařila.")
      setOpenError(true)
    }
  }

  async function onDelete() {
    if (!id) return
    try {
      const res = await fetch(`/api/odchody/${id}`, { method: "DELETE" })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message ?? "Smazání se nezdařilo.")
      setSuccessName(form.getValues("name") + " " + form.getValues("surname"))
      await onSuccess?.()
      setOpenSuccess(true)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Smazání se nezdařilo.")
      setOpenError(true)
    }
  }

  const submitDisabled = isSubmitting || (!selectedFromEos && !isEdit)
  const focusRing =
    "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 focus:ring-offset-2 focus:ring-offset-background " +
    "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="max-h-[80vh] space-y-6 overflow-y-auto overscroll-contain"
        data-lenis-prevent=""
      >
        {!isEdit && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" />
                Vybrat zaměstnance z EOS systému
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeCombobox
                formFields={{
                  personalNumber: "personalNumber",
                  name: "name",
                  surname: "surname",
                  titleBefore: "titleBefore",
                  titleAfter: "titleAfter",
                  userEmail: "userEmail",
                  positionNum: "positionNum",
                  positionName: "positionName",
                  department: "department",
                  unitName: "unitName",
                }}
                placeholder="Vyberte zaměstnance…"
                fetchLimit={500}
                excludePersonalNumbers={excludePersonalNumbers}
                onSelect={async () => {
                  if (!form.getValues("personalNumber")?.trim()) {
                    form.setValue(
                      "personalNumber",
                      nextTempPersonalNumber(excludePersonalNumbers),
                      { shouldDirty: true }
                    )
                  }
                  if (!form.getValues("positionNum")?.trim())
                    form.setValue("positionNum", "0", { shouldDirty: true })
                  if (!form.getValues("positionName")?.trim())
                    form.setValue("positionName", "-", { shouldDirty: true })
                  if (!form.getValues("department")?.trim())
                    form.setValue("department", "-", { shouldDirty: true })
                  if (!form.getValues("unitName")?.trim())
                    form.setValue("unitName", "-", { shouldDirty: true })

                  setSelectedFromEos(true)
                  form.clearErrors("personalNumber")
                  await form.trigger()
                }}
              />
              {!selectedFromEos && (
                <Alert className="mt-4">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    Pro vytvoření záznamu musíte vybrat existujícího zaměstnance
                    z EOS systému.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5" />
              Osobní a organizační údaje (z EOS)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(
                [
                  ["personalNumber", "Osobní číslo *"],
                  ["titleBefore", "Titul před"],
                  ["name", "Jméno *"],
                  ["surname", "Příjmení *"],
                  ["titleAfter", "Titul za"],
                  ["positionNum", "Číslo pozice *"],
                  ["positionName", "Pozice *"],
                  ["department", "Odbor *"],
                  ["unitName", "Oddělení *"],
                  ["userEmail", "Firemní e-mail"],
                ] as const
              ).map(([name, label]) => (
                <FormField
                  key={name}
                  name={name as keyof FormValues}
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type={name === "userEmail" ? "email" : "text"}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className={`bg-muted ${
                            name === "positionNum" || name === "personalNumber"
                              ? "font-mono"
                              : ""
                          } ${focusRing}`}
                          readOnly
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-5" />
              Termíny odchodu
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
                }}
              />
              <label htmlFor="manualDates" className="text-sm">
                Upravit vlastní datumy (vypnout automatický výpočet ±2 měsíce)
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                name="noticeFiled"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Datum podání výpovědi *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        ref={firstDateRef}
                        onChange={(e) => {
                          lastEditedRef.current = "notice"
                          field.onChange(e)
                        }}
                        value={
                          typeof field.value === "string" ? field.value : ""
                        }
                        className={focusRing}
                      />
                    </FormControl>
                    <FormDescription>
                      {manualDates
                        ? "Automatický dopočet vypnutý."
                        : "Změna přepočítá datum konce (+2 měsíce)."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isActualMode ? (
                <FormField
                  name="plannedEnd"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datum předpokládaného odchodu *</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => {
                            lastEditedRef.current = "end"
                            field.onChange(e)
                          }}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className={focusRing}
                        />
                      </FormControl>
                      <FormDescription>
                        {manualDates
                          ? "Automatický dopočet vypnutý."
                          : "Změna přepočítá datum podání výpovědi (−2 měsíce)."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  name="actualEnd"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datum skutečného odchodu *</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => {
                            lastEditedRef.current = "end"
                            field.onChange(e)
                          }}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          className={focusRing}
                        />
                      </FormControl>
                      <FormDescription>
                        {manualDates
                          ? "Automatický dopočet vypnutý."
                          : "Změna přepočítá datum podání výpovědi (−2 měsíce)."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
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
                    <Textarea {...field} rows={3} className={focusRing} />
                  </FormControl>
                  <FormDescription>
                    Další informace k odchodu zaměstnance
                  </FormDescription>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            className={`inline-flex w-full items-center justify-center gap-2 ${focusRing}`}
            disabled={submitDisabled}
          >
            {isSubmitting && (
              <div className="mr-2 size-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
            )}
            {id
              ? "Uložit změny"
              : isActualMode
                ? "Zapsat skutečný odchod"
                : "Přidat předpokládaný odchod"}
          </Button>

          {id && (
            <Button
              type="button"
              variant="destructive"
              className={`inline-flex w-full items-center justify-center gap-2 ${focusRing}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Smazat záznam
            </Button>
          )}
        </div>

        <Dialog open={openSuccess} onOpenChange={setOpenSuccess}>
          <DialogContent>
            <DialogTitle>Hotovo</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {id
                ? `Změny byly úspěšně uloženy pro ${successName}.`
                : `Záznam byl úspěšně zpracován pro ${successName}.`}
            </p>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setOpenSuccess(false)}>OK</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={openError} onOpenChange={setOpenError}>
          <DialogContent>
            <DialogTitle>Nepodařilo se</DialogTitle>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setOpenError(false)}>
                Zavřít
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
  )
}
