"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { addMonths, format, subMonths } from "date-fns"
import { AlertCircle, Calendar, RefreshCcw, Trash2, User } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useIsReadonly } from "@/hooks/use-current-role"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

type LinkedOnboardingSummary = {
  id: number
  positionName: string | null
  probationEnd: string | null
  exitDuringProbation: boolean
  label: string
  description: string
}

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
  supervisorName?: string
  supervisorEmail?: string
  supervisorPosition?: string
  supervisorDepartment?: string
  supervisorUnitName?: string
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

const undefIfEmpty = (v?: string | null) =>
  v == null || String(v).trim() === "" ? undefined : v
const nullIfEmpty = (v?: string | null) =>
  v == null || String(v).trim() === "" ? null : v
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

const baseSchema = z.object({
  titleBefore: z.string().optional(),
  name: z.string().trim().min(1, "Jméno je povinné"),
  surname: z.string().trim().min(1, "Příjmení je povinné"),
  titleAfter: z.string().optional(),
  personalNumber: z.string().trim().min(1, "Osobní číslo je povinné"),
  userEmail: z.string().email("Neplatný e-mail").or(z.literal("")).optional(),
  positionNum: z.string().trim().min(1, "Číslo funkce je povinné"),
  positionName: z.string().trim().min(1, "Název pozice je povinný"),
  department: z.string().trim().min(1, "Odbor je povinný"),
  unitName: z.string().trim().min(1, "Oddělení je povinné"),
  supervisorName: z.string().optional(),
  supervisorEmail: z
    .string()
    .email("Neplatný e-mail")
    .or(z.literal(""))
    .optional(),
  supervisorPosition: z.string().optional(),
  supervisorDepartment: z.string().optional(),
  supervisorUnitName: z.string().optional(),
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

type SupervisorApiResponse = {
  supervisor?: {
    titleBefore?: string | null
    name?: string | null
    surname?: string | null
    titleAfter?: string | null
    fullName?: string | null
    email?: string | null
    position?: string | null
    department?: string | null
    unitName?: string | null
  }
}

function buildSupervisorFullName(
  supervisor?: SupervisorApiResponse["supervisor"]
): string {
  if (!supervisor) return ""
  if (supervisor.fullName) return supervisor.fullName

  return [
    supervisor.titleBefore,
    supervisor.name,
    supervisor.surname,
    supervisor.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

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
  const isReadonly = useIsReadonly()
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
  const [manualData, setManualData] = useState<boolean>(false)
  const [supervisorManuallyChanged, setSupervisorManuallyChanged] =
    useState(false)
  const [isSupervisorLoading, setIsSupervisorLoading] = useState(false)
  const [supervisorLoadError, setSupervisorLoadError] = useState<string | null>(
    null
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
  const [probationConfirm, setProbationConfirm] = useState<{
    linkedOnboarding: LinkedOnboardingSummary
    values: FormValues
  } | null>(null)
  const [probationConfirmBusy, setProbationConfirmBusy] = useState(false)
  const firstDateRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    firstDateRef.current?.focus()
  }, [])

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
      supervisorName: "",
      supervisorEmail: "",
      supervisorPosition: "",
      supervisorDepartment: "",
      supervisorUnitName: "",
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

    return base
  }, [initial, isActualMode, prefillDate, isEdit, inferredManualFlag])

  const schema = useMemo(
    () =>
      baseSchema.superRefine((vals, ctx) => {
        if (!isEdit && !selectedFromEos && !manualData) {
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
    [isEdit, selectedFromEos, manualData, isActualMode]
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
    lastEditedRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, effectiveMode, form])

  const isSubmitting = form.formState.isSubmitting
  const watchPersonal = form.watch("personalNumber")

  useEffect(() => {
    const ok = Boolean(watchPersonal && watchPersonal.trim() !== "")
    setSelectedFromEos(ok || isEdit)
    if (ok) form.clearErrors("personalNumber")
  }, [watchPersonal, form, isEdit])

  const loadSupervisorForPosition = useCallback(
    async (positionNum: string, options?: { force?: boolean }) => {
      const trimmed = positionNum.trim()

      if (!trimmed) {
        setSupervisorLoadError(null)
        return
      }

      if (supervisorManuallyChanged && !options?.force) {
        return
      }

      setIsSupervisorLoading(true)
      setSupervisorLoadError(null)

      try {
        const res = await fetch(
          `/api/systemizace/superior?positionNum=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        )

        if (!res.ok) {
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
      } catch {
        setSupervisorLoadError("Nepodařilo se načíst vedoucího.")
      } finally {
        setIsSupervisorLoading(false)
      }
    },
    [form, supervisorManuallyChanged]
  )

  const watchOffboardingPositionNum = form.watch("positionNum")
  const previousAutoSupervisorPositionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!watchOffboardingPositionNum) return

    if (
      previousAutoSupervisorPositionRef.current === watchOffboardingPositionNum
    )
      return
    previousAutoSupervisorPositionRef.current = watchOffboardingPositionNum

    if (
      Boolean(id) &&
      !supervisorManuallyChanged &&
      form.getValues("supervisorName")
    ) {
      return
    }

    void loadSupervisorForPosition(watchOffboardingPositionNum)
  }, [
    form,
    id,
    loadSupervisorForPosition,
    supervisorManuallyChanged,
    watchOffboardingPositionNum,
  ])

  const restoreSupervisorFromPosition = () => {
    const currentPositionNum = form.getValues("positionNum")
    if (!currentPositionNum) return
    setSupervisorManuallyChanged(false)
    void loadSupervisorForPosition(currentPositionNum, { force: true })
  }

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

  async function submitOffboarding(
    values: FormValues,
    probationStopDecision?: "STOP" | "KEEP"
  ) {
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

    const shouldSaveSupervisorSnapshot = Boolean(
      supervisorManuallyChanged ||
        values.supervisorName?.trim() ||
        values.supervisorEmail?.trim() ||
        values.supervisorPosition?.trim() ||
        values.supervisorDepartment?.trim() ||
        values.supervisorUnitName?.trim()
    )

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

      titleBefore: nullIfEmpty(values.titleBefore),
      titleAfter: nullIfEmpty(values.titleAfter),
      userEmail: nullIfEmpty(values.userEmail),
      plannedEnd: undefIfEmpty(values.plannedEnd),
      actualEnd: undefIfEmpty(values.actualEnd),
      notes: nullIfEmpty(values.notes),

      status: values.status ?? (isActualMode ? "COMPLETED" : "NEW"),
      noticeEnd: values.noticeFiled || undefined,
      noticeMonths,
      hasCustomDates: manualDates,

      supervisorManualOverride: shouldSaveSupervisorSnapshot,
      supervisorName: shouldSaveSupervisorSnapshot
        ? nullIfEmpty(values.supervisorName)
        : undefined,
      supervisorEmail: shouldSaveSupervisorSnapshot
        ? nullIfEmpty(values.supervisorEmail)
        : undefined,
      supervisorPosition: shouldSaveSupervisorSnapshot
        ? nullIfEmpty(values.supervisorPosition)
        : undefined,
      supervisorDepartment: shouldSaveSupervisorSnapshot
        ? nullIfEmpty(values.supervisorDepartment)
        : undefined,
      supervisorUnitName: shouldSaveSupervisorSnapshot
        ? nullIfEmpty(values.supervisorUnitName)
        : undefined,

      ...(probationStopDecision ? { probationStopDecision } : {}),
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

    if (json?.status === "confirm_required" && json?.linkedOnboarding) {
      setProbationConfirm({ linkedOnboarding: json.linkedOnboarding, values })
      return
    }

    setSuccessName(`${values.name} ${values.surname}`)
    await onSuccess?.(json?.data?.id)
    setOpenSuccess(true)
  }

  async function onSubmit(values: FormValues) {
    try {
      await submitOffboarding(values)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Operace se nezdařila.")
      setOpenError(true)
    }
  }

  async function handleProbationDecision(decision: "STOP" | "KEEP") {
    if (!probationConfirm) return
    setProbationConfirmBusy(true)
    try {
      await submitOffboarding(probationConfirm.values, decision)
      setProbationConfirm(null)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Operace se nezdařila.")
      setOpenError(true)
    } finally {
      setProbationConfirmBusy(false)
    }
  }

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    checked: boolean
    willReactivateProbation: boolean
    linkedLabel: string | null
    linkedChangesCount: number
    loading: boolean
  }>({
    open: false,
    checked: false,
    willReactivateProbation: false,
    linkedLabel: null,
    linkedChangesCount: 0,
    loading: false,
  })

  function closeDeleteConfirm() {
    setDeleteConfirm({
      open: false,
      checked: false,
      willReactivateProbation: false,
      linkedLabel: null,
      linkedChangesCount: 0,
      loading: false,
    })
  }

  async function openDeleteConfirm() {
    if (!id) return
    setDeleteConfirm({
      open: true,
      checked: false,
      willReactivateProbation: false,
      linkedLabel: null,
      linkedChangesCount: 0,
      loading: true,
    })

    try {
      const res = await fetch(`/api/odchody/${id}?preview=true`, {
        method: "DELETE",
      })
      const json = await res.json().catch(() => null)

      if (!res.ok)
        throw new Error(json?.message ?? "Nepodařilo se ověřit propojení.")

      setDeleteConfirm({
        open: true,
        checked: true,
        willReactivateProbation: Boolean(json?.data?.willReactivateProbation),
        linkedLabel: json?.data?.linkedOnboarding?.label ?? null,
        linkedChangesCount: json?.data?.linkedChangesCount ?? 0,
        loading: false,
      })
    } catch {
      setDeleteConfirm({
        open: true,
        checked: true,
        willReactivateProbation: false,
        linkedLabel: null,
        linkedChangesCount: 0,
        loading: false,
      })
    }
  }

  async function performDelete() {
    if (!id) return
    setDeleteConfirm((prev) => ({ ...prev, loading: true }))
    try {
      let res = await fetch(
        `/api/odchody/${id}${deleteConfirm.willReactivateProbation ? "?confirmReactivate=true" : ""}`,
        { method: "DELETE" }
      )
      let json = await res.json().catch(() => null)

      if (res.ok && json?.status === "confirm_required") {
        res = await fetch(`/api/odchody/${id}?confirmReactivate=true`, {
          method: "DELETE",
        })
        json = await res.json().catch(() => null)
      }

      if (!res.ok) throw new Error(json?.message ?? "Smazání se nezdařilo.")

      closeDeleteConfirm()
      setSuccessName(form.getValues("name") + " " + form.getValues("surname"))
      await onSuccess?.()
      setOpenSuccess(true)
    } catch (err) {
      closeDeleteConfirm()
      setErrorMsg(err instanceof Error ? err.message : "Smazání se nezdařilo.")
      setOpenError(true)
    }
  }

  const submitDisabled =
    isSubmitting || isReadonly || (!selectedFromEos && !manualData && !isEdit)
  const focusRing =
    "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 focus:ring-offset-2 focus:ring-offset-background " +
    "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
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
              {!manualData ? (
                <>
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
                        form.setValue("positionNum", "0", {
                          shouldDirty: true,
                        })
                      if (!form.getValues("positionName")?.trim())
                        form.setValue("positionName", "-", {
                          shouldDirty: true,
                        })
                      if (!form.getValues("department")?.trim())
                        form.setValue("department", "-", {
                          shouldDirty: true,
                        })
                      if (!form.getValues("unitName")?.trim())
                        form.setValue("unitName", "-", { shouldDirty: true })

                      setSelectedFromEos(true)
                      form.clearErrors("personalNumber")
                      await form.trigger()
                    }}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Doporučeno: vyberte zaměstnance z EOS. Údaje se jen načtou
                    pro potřeby této aplikace, v EOS systému se tím nic nemění.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Výběr z EOS je vypnutý, protože je zapnuté „Vyplnit vlastní
                  data“ níže.
                </p>
              )}

              {!selectedFromEos && !manualData && (
                <Alert className="mt-4">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    Pro vytvoření záznamu musíte vybrat existujícího zaměstnance
                    z EOS systému, nebo zaškrtnout „Vyplnit vlastní data&rdquo;
                    a údaje zadat ručně.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="manualData"
                checked={manualData}
                onCheckedChange={(v) => {
                  const b = Boolean(v)
                  setManualData(b)
                  if (b) form.clearErrors("personalNumber")
                  void form.trigger()
                }}
              />
              <label htmlFor="manualData" className="text-sm">
                Vyplnit vlastní data{" "}
                {isEdit ? "(upravit údaje ručně)" : "(bez výběru z EOS)"}
              </label>
            </div>
            {manualData && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ručně zadané údaje se nijak nepropíšou zpět do EOS – slouží
                pouze pro potřeby této aplikace.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5" />
              {manualData
                ? "Osobní a organizační údaje"
                : "Osobní a organizační údaje (z EOS)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!manualData && (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertDescription>
                  Tato pole jsou uzamčená. Pro jejich úpravu zaškrtněte výše
                  „Vyplnit vlastní data“.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(
                [
                  ["personalNumber", "Osobní číslo *"],
                  ["titleBefore", "Titul před"],
                  ["name", "Jméno *"],
                  ["surname", "Příjmení *"],
                  ["titleAfter", "Titul za"],
                  ["positionNum", "Číslo funkce *"],
                  ["positionName", "Pozice *"],
                  ["department", "Odbor *"],
                  ["unitName", "Oddělení *"],
                  ["userEmail", "Firemní e-mail"],
                ] as const
              ).map(([name, label]) => {
                const isEmailField = name === "userEmail"
                const isLocked =
                  name === "personalNumber"
                    ? isEdit || !manualData
                    : !isEmailField && !manualData

                return (
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
                            type={isEmailField ? "email" : "text"}
                            value={
                              typeof field.value === "string" ? field.value : ""
                            }
                            className={`${isLocked ? "bg-muted" : ""} ${
                              name === "positionNum" ||
                              name === "personalNumber"
                                ? "font-mono"
                                : ""
                            } ${focusRing}`}
                            readOnly={isLocked}
                          />
                        </FormControl>
                        {isEmailField && (
                          <FormDescription>
                            Načteno z EOS (lze upravit).
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              })}
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
                  Načítá se automaticky podle čísla funkce, ale lze ho změnit.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={restoreSupervisorFromPosition}
                disabled={!form.getValues("positionNum") || isSupervisorLoading}
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
            className={`inline-flex w-full items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73] ${focusRing}`}
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
              onClick={() => void openDeleteConfirm()}
              disabled={isReadonly}
            >
              <Trash2 className="size-4" />
              Smazat záznam
            </Button>
          )}
        </div>

        <Dialog
          open={deleteConfirm.open}
          onOpenChange={(open) => {
            if (!open && !deleteConfirm.loading) closeDeleteConfirm()
          }}
        >
          <DialogContent className="max-w-md">
            <DialogTitle>Smazat záznam</DialogTitle>

            {!deleteConfirm.checked ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Ověřuji propojené záznamy…
              </div>
            ) : (
              <div className="space-y-3 py-2 text-sm">
                <p className="text-muted-foreground">
                  Opravdu chcete smazat tento záznam?
                </p>

                {deleteConfirm.willReactivateProbation && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <p className="font-medium">
                      Tento odchod aktuálně pozastavuje zkušební dobu
                      propojeného nástupu. Smazáním záznamu se zkušební doba
                      znovu aktivuje.
                    </p>
                    {deleteConfirm.linkedLabel && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {deleteConfirm.linkedLabel}
                      </p>
                    )}
                  </div>
                )}

                {deleteConfirm.linkedChangesCount > 0 && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Propojeno i s {deleteConfirm.linkedChangesCount}{" "}
                    {deleteConfirm.linkedChangesCount === 1
                      ? "zaměstnaneckou změnou"
                      : "zaměstnaneckými změnami"}{" "}
                    podle osobního čísla (jen informační vazba).
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Záznam zůstane uložený a půjde ho kdykoliv obnovit v sekci
                  „Smazané záznamy“.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={closeDeleteConfirm}
                disabled={deleteConfirm.loading}
              >
                Zrušit
              </Button>
              <Button
                variant="destructive"
                onClick={() => void performDelete()}
                disabled={!deleteConfirm.checked || deleteConfirm.loading}
                className="flex items-center gap-2"
              >
                {deleteConfirm.loading && deleteConfirm.checked && (
                  <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                Smazat
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

        <AlertDialog
          open={Boolean(probationConfirm)}
          onOpenChange={(open) => {
            if (!open && !probationConfirmBusy) setProbationConfirm(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Zastavit hodnocení zkušební doby?
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Osobní číslo je propojené s aktivním nástupem
                {probationConfirm?.linkedOnboarding.positionName
                  ? ` (${probationConfirm.linkedOnboarding.positionName})`
                  : ""}
                , kde právě běží zkušební doba
                {probationConfirm?.linkedOnboarding.probationEnd
                  ? ` do ${format(new Date(probationConfirm.linkedOnboarding.probationEnd), "d.M.yyyy")}`
                  : ""}
                .
              </p>
              <p>
                Chcete zastavit hodnocení zkušební doby a nerozesílat vedoucímu
                žádné další e-maily k vyplnění? Pokud zvolíte „Nechat běžet“,
                formulář i připomínky poběží dál beze změny.
              </p>
            </div>
            <AlertDialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={probationConfirmBusy || isReadonly}
                onClick={() => void handleProbationDecision("KEEP")}
              >
                Nechat běžet
              </Button>
              <Button
                type="button"
                className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
                disabled={probationConfirmBusy || isReadonly}
                onClick={() => void handleProbationDecision("STOP")}
              >
                {probationConfirmBusy ? "Ukládám…" : "Zastavit hodnocení"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
