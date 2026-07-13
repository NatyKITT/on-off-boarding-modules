"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  Link2,
  PencilLine,
  User,
  Users,
  XCircle,
} from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { type Position } from "@/types/position"

import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
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
  DialogFooter,
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
import {
  EmployeeCombobox,
  type EmployeeItem,
} from "@/components/common/employee-combobox"

type ChangeType = "POSITION" | "NAME" | "NAME_AND_POSITION"

type LinkedMatch = {
  id: number
  name: string
  surname: string
  positionName?: string | null
  department?: string | null
  date?: string | null
  kind: "onboarding" | "offboarding"
}

type Props = {
  positions: Position[]
  id?: number
  mode?: "create" | "edit"
  initial?: Record<string, unknown> | null
  onSuccess?: (changeId?: number) => void | Promise<void>
}

const EMPTY_EXCLUDED_PERSONAL_NUMBERS: string[] = []

const focusRing =
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/55 focus:ring-offset-2 focus:ring-offset-background " +
  "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

const todayString = () => new Date().toISOString().slice(0, 10)

const emptyToNull = (value?: string | null) => {
  if (value == null) return null

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function positionLabel(position: Position) {
  return [position.num, position.name, position.dept_name, position.unit_name]
    .filter(Boolean)
    .join(" — ")
}

function isChangeType(value: unknown): value is ChangeType {
  return (
    value === "POSITION" || value === "NAME" || value === "NAME_AND_POSITION"
  )
}

function toInitialString(
  initial: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = initial?.[key]

  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : ""
}

function getChangeType(values: FormValues): ChangeType {
  if (values.changeName && values.changePosition) return "NAME_AND_POSITION"
  if (values.changeName) return "NAME"

  return "POSITION"
}

function formatDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? "–"
    : format(date, "d.M.yyyy", { locale: cs })
}

function getDefaultValues(
  initial: Record<string, unknown> | null | undefined,
  isEdit: boolean
): FormValues {
  const initialType = isChangeType(initial?.type) ? initial.type : "NAME"
  const effectiveDate = toInitialString(initial, "effectiveDate")

  return {
    changeName: initialType === "NAME" || initialType === "NAME_AND_POSITION",
    changePosition:
      initialType === "POSITION" || initialType === "NAME_AND_POSITION",
    effectiveDate: effectiveDate ? effectiveDate.slice(0, 10) : todayString(),
    manualEmployee: isEdit || Boolean(initial?.manualEmployee),

    titleBefore: toInitialString(initial, "titleBefore"),
    name: toInitialString(initial, "name"),
    surname: toInitialString(initial, "surname"),
    titleAfter: toInitialString(initial, "titleAfter"),

    personalNumber: toInitialString(initial, "personalNumber"),
    userEmail: toInitialString(initial, "userEmail"),

    oldTitleBefore: toInitialString(initial, "oldTitleBefore"),
    newTitleBefore: toInitialString(initial, "newTitleBefore"),
    oldName: toInitialString(initial, "oldName"),
    newName: toInitialString(initial, "newName"),
    oldSurname: toInitialString(initial, "oldSurname"),
    newSurname: toInitialString(initial, "newSurname"),
    oldTitleAfter: toInitialString(initial, "oldTitleAfter"),
    newTitleAfter: toInitialString(initial, "newTitleAfter"),

    oldDepartment: toInitialString(initial, "oldDepartment"),
    newDepartment: toInitialString(initial, "newDepartment"),
    oldUnitName: toInitialString(initial, "oldUnitName"),
    newUnitName: toInitialString(initial, "newUnitName"),
    oldPositionName: toInitialString(initial, "oldPositionName"),
    newPositionName: toInitialString(initial, "newPositionName"),
    oldPositionNum: toInitialString(initial, "oldPositionNum"),
    newPositionNum: toInitialString(initial, "newPositionNum"),

    notes: toInitialString(initial, "notes"),
  }
}

const schema = z
  .object({
    changeName: z.boolean().default(true),
    changePosition: z.boolean().default(false),
    effectiveDate: z.string().min(1, "Datum účinnosti je povinné."),
    manualEmployee: z.boolean().default(false),

    titleBefore: z.string().optional(),
    name: z.string().trim().min(1, "Jméno je povinné."),
    surname: z.string().trim().min(1, "Příjmení je povinné."),
    titleAfter: z.string().optional(),

    personalNumber: z.string().trim().min(1, "Osobní číslo je povinné."),
    userEmail: z.string().optional(),

    oldTitleBefore: z.string().optional(),
    newTitleBefore: z.string().optional(),
    oldName: z.string().optional(),
    newName: z.string().optional(),
    oldSurname: z.string().optional(),
    newSurname: z.string().optional(),
    oldTitleAfter: z.string().optional(),
    newTitleAfter: z.string().optional(),

    oldDepartment: z.string().optional(),
    newDepartment: z.string().optional(),
    oldUnitName: z.string().optional(),
    newUnitName: z.string().optional(),
    oldPositionName: z.string().optional(),
    newPositionName: z.string().optional(),
    oldPositionNum: z.string().optional(),
    newPositionNum: z.string().optional(),

    notes: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.changeName && !values.changePosition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changeName"],
        message: "Vyberte alespoň jednu oblast změny.",
      })
    }

    if (values.changeName) {
      const hasSome =
        values.newTitleBefore?.trim() ||
        values.newName?.trim() ||
        values.newSurname?.trim() ||
        values.newTitleAfter?.trim()

      if (!hasSome) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["newSurname"],
          message: "Vyplňte alespoň jednu novou hodnotu jména nebo titulu.",
        })
      }
    }

    if (values.changePosition && !values.newPositionNum?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPositionNum"],
        message: "Vyberte novou pozici.",
      })
    }
  })

type FormValues = z.infer<typeof schema>

function PositionCombobox({
  positions,
  value,
  onSelect,
  placeholder = "Vyberte pozici…",
}: {
  positions: Position[]
  value?: string
  onSelect: (position: Position) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = positions.find((position) => position.num === value) ?? null

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim())

    if (!normalizedQuery) return positions

    return positions.filter((position) =>
      normalizeText(positionLabel(position)).includes(normalizedQuery)
    )
  }, [positions, query])

  return (
    <Popover
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-auto min-h-10 w-full justify-between whitespace-normal text-left",
            focusRing
          )}
        >
          <span className="line-clamp-2">
            {selected ? positionLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Hledat číslo, pozici nebo odbor…"
            className={focusRing}
          />

          <CommandEmpty>Žádná pozice nenalezena.</CommandEmpty>

          <CommandList className="max-h-80 overflow-y-auto overscroll-contain">
            <CommandGroup>
              {filtered.map((position) => (
                <CommandItem
                  key={position.num}
                  value={position.num}
                  onSelect={() => {
                    onSelect(position)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex cursor-pointer items-start gap-3 py-3"
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      value === position.num ? "opacity-100" : "opacity-0"
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                        {position.num}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {position.name}
                      </span>
                    </div>

                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {[position.dept_name, position.unit_name]
                        .filter(Boolean)
                        .join(" • ")}
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

export function EmployeeChangeForm({
  positions,
  id,
  mode = "create",
  initial,
  onSuccess,
}: Props) {
  const isEdit = mode === "edit" && Boolean(id)

  const defaultValues = useMemo(
    () => getDefaultValues(initial, isEdit),
    [initial, isEdit]
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  })

  const [manualEmployee, setManualEmployee] = useState(
    defaultValues.manualEmployee
  )

  const [linkModal, setLinkModal] = useState<{
    open: boolean
    changeId: number | null
    matches: LinkedMatch[]
    loading: boolean
    linking: boolean
  }>({
    open: false,
    changeId: null,
    matches: [],
    loading: false,
    linking: false,
  })

  const [errorModal, setErrorModal] = useState({
    open: false,
    message: "",
  })

  useEffect(() => {
    form.reset(defaultValues)
    setManualEmployee(defaultValues.manualEmployee)
    setLinkModal({
      open: false,
      changeId: null,
      matches: [],
      loading: false,
      linking: false,
    })
    setErrorModal({
      open: false,
      message: "",
    })
  }, [defaultValues, form])

  const sortedPositions = useMemo(
    () =>
      [...positions].sort((a, b) =>
        positionLabel(a).localeCompare(positionLabel(b), "cs")
      ),
    [positions]
  )

  const changeName = useWatch({
    control: form.control,
    name: "changeName",
  })

  const changePosition = useWatch({
    control: form.control,
    name: "changePosition",
  })

  const personalNumber = useWatch({
    control: form.control,
    name: "personalNumber",
  })

  const newPositionNum = useWatch({
    control: form.control,
    name: "newPositionNum",
  })

  const currentPositionNum = useWatch({
    control: form.control,
    name: "oldPositionNum",
  })

  const employeeTitleBefore = useWatch({
    control: form.control,
    name: "titleBefore",
  })
  const employeeName = useWatch({
    control: form.control,
    name: "name",
  })
  const employeeSurname = useWatch({
    control: form.control,
    name: "surname",
  })
  const employeeTitleAfter = useWatch({
    control: form.control,
    name: "titleAfter",
  })

  const isSubmitting = form.formState.isSubmitting

  function setManualEmployeeMode(nextValue: boolean) {
    setManualEmployee(nextValue)
    form.setValue("manualEmployee", nextValue, {
      shouldDirty: true,
      shouldTouch: true,
    })
  }

  useEffect(() => {
    if (isEdit) return

    setNameOriginalValues({
      titleBefore: employeeTitleBefore,
      name: employeeName,
      surname: employeeSurname,
      titleAfter: employeeTitleAfter,
      prefillNewValues: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employeeTitleBefore,
    employeeName,
    employeeSurname,
    employeeTitleAfter,
    isEdit,
  ])

  function setNameOriginalValues(params: {
    titleBefore?: string | null
    name?: string | null
    surname?: string | null
    titleAfter?: string | null
    prefillNewValues?: boolean
  }) {
    const titleBefore = params.titleBefore ?? ""
    const name = params.name ?? ""
    const surname = params.surname ?? ""
    const titleAfter = params.titleAfter ?? ""

    form.setValue("oldTitleBefore", titleBefore, { shouldDirty: true })
    form.setValue("oldName", name, { shouldDirty: true })
    form.setValue("oldSurname", surname, { shouldDirty: true })
    form.setValue("oldTitleAfter", titleAfter, { shouldDirty: true })

    if (params.prefillNewValues) {
      if (!form.getValues("newTitleBefore")) {
        form.setValue("newTitleBefore", titleBefore, { shouldDirty: true })
      }
      if (!form.getValues("newName")) {
        form.setValue("newName", name, { shouldDirty: true })
      }
      if (!form.getValues("newSurname")) {
        form.setValue("newSurname", surname, { shouldDirty: true })
      }
      if (!form.getValues("newTitleAfter")) {
        form.setValue("newTitleAfter", titleAfter, { shouldDirty: true })
      }
    }
  }

  function setCurrentPositionValues(params: {
    positionNum?: string | null
    positionName?: string | null
    department?: string | null
    unitName?: string | null
  }) {
    form.setValue("oldPositionNum", params.positionNum ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue("oldPositionName", params.positionName ?? "", {
      shouldDirty: true,
    })
    form.setValue("oldDepartment", params.department ?? "", {
      shouldDirty: true,
    })
    form.setValue("oldUnitName", params.unitName ?? "", {
      shouldDirty: true,
    })
  }

  function getEmployeeString(employee: EmployeeItem, ...keys: string[]) {
    const source = employee as unknown as Record<string, unknown>

    for (const key of keys) {
      const value = source[key]
      if (typeof value === "string" || typeof value === "number") {
        const text = String(value)
        if (text.trim()) return text
      }
    }

    return ""
  }

  function copySelectedEmployeeToOldAndNewValues(employee: EmployeeItem) {
    const titleBefore = employee.titleBefore ?? ""
    const name = employee.name ?? ""
    const surname = employee.surname ?? ""
    const titleAfter = employee.titleAfter ?? ""

    setNameOriginalValues({
      titleBefore,
      name,
      surname,
      titleAfter,
      prefillNewValues: true,
    })

    setCurrentPositionValues({
      positionNum: getEmployeeString(
        employee,
        "positionNum",
        "position_num",
        "num"
      ),
      positionName: getEmployeeString(
        employee,
        "positionName",
        "position_name",
        "position"
      ),
      department: getEmployeeString(employee, "department", "dept_name"),
      unitName: getEmployeeString(employee, "unitName", "unit_name"),
    })

    form.clearErrors([
      "personalNumber",
      "oldTitleBefore",
      "oldName",
      "oldSurname",
      "oldTitleAfter",
      "oldPositionNum",
      "oldPositionName",
      "oldDepartment",
      "oldUnitName",
    ])
  }

  function selectCurrentPosition(position: Position) {
    setCurrentPositionValues({
      positionNum: position.num,
      positionName: position.name ?? "",
      department: position.dept_name ?? "",
      unitName: position.unit_name ?? "",
    })
  }

  function selectNewPosition(position: Position) {
    form.setValue("newPositionNum", position.num, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue("newPositionName", position.name ?? "", {
      shouldDirty: true,
    })
    form.setValue("newDepartment", position.dept_name ?? "", {
      shouldDirty: true,
    })
    form.setValue("newUnitName", position.unit_name ?? "", {
      shouldDirty: true,
    })
  }

  async function finishSuccessfully(changeId?: number) {
    await onSuccess?.(changeId)
  }

  async function handleAcknowledgeLinkedRecords() {
    const changeId = linkModal.changeId ?? undefined

    setLinkModal({
      open: false,
      changeId: null,
      matches: [],
      loading: false,
      linking: false,
    })

    await finishSuccessfully(changeId)
  }

  async function handleSkipLink() {
    const changeId = linkModal.changeId ?? undefined

    setLinkModal({
      open: false,
      changeId: null,
      matches: [],
      loading: false,
      linking: false,
    })

    await finishSuccessfully(changeId)
  }

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        type: getChangeType(values),
        effectiveDate: values.effectiveDate,

        titleBefore: emptyToNull(values.titleBefore),
        name: values.name.trim(),
        surname: values.surname.trim(),
        titleAfter: emptyToNull(values.titleAfter),
        personalNumber: emptyToNull(values.personalNumber),

        oldTitleBefore: emptyToNull(
          values.oldTitleBefore || values.titleBefore
        ),
        newTitleBefore: values.changeName
          ? emptyToNull(values.newTitleBefore)
          : null,
        oldName: emptyToNull(values.oldName || values.name),
        newName: values.changeName ? emptyToNull(values.newName) : null,
        oldSurname: emptyToNull(values.oldSurname || values.surname),
        newSurname: values.changeName ? emptyToNull(values.newSurname) : null,
        oldTitleAfter: emptyToNull(values.oldTitleAfter || values.titleAfter),
        newTitleAfter: values.changeName
          ? emptyToNull(values.newTitleAfter)
          : null,

        oldDepartment: emptyToNull(values.oldDepartment),
        newDepartment: values.changePosition
          ? emptyToNull(values.newDepartment)
          : null,
        oldUnitName: emptyToNull(values.oldUnitName),
        newUnitName: values.changePosition
          ? emptyToNull(values.newUnitName)
          : null,
        oldPositionName: emptyToNull(values.oldPositionName),
        newPositionName: values.changePosition
          ? emptyToNull(values.newPositionName)
          : null,
        oldPositionNum: emptyToNull(values.oldPositionNum),
        newPositionNum: values.changePosition
          ? emptyToNull(values.newPositionNum)
          : null,

        notes: emptyToNull(values.notes),
      }

      const url = isEdit ? `/api/zmeny/${id}` : "/api/zmeny"
      const method = isEdit ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const json = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(json?.message ?? "Operace se nezdařila.")
      }

      const savedId = Number(json?.data?.id ?? id)

      if (!Number.isFinite(savedId)) {
        await finishSuccessfully(undefined)
        return
      }

      await finishSuccessfully(savedId)
    } catch (error) {
      setErrorModal({
        open: true,
        message:
          error instanceof Error
            ? error.message
            : "Operaci se nepodařilo provést.",
      })
    }
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
                <PencilLine className="size-5" />
                Co se mění
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="changeName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(value) =>
                              field.onChange(Boolean(value))
                            }
                          />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel>Změna jména / příjmení / titulů</FormLabel>
                          <FormDescription>
                            Pro změnu příjmení, jména nebo titulů.
                          </FormDescription>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="changePosition"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(value) =>
                              field.onChange(Boolean(value))
                            }
                          />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel>Změna pozice / odboru</FormLabel>
                          <FormDescription>
                            Pro změnu čísla funkce, pozice nebo odboru.
                          </FormDescription>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="effectiveDate"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datum účinnosti *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className={focusRing} />
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
                <User className="size-5" />
                Zaměstnanec a původní hodnoty
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {!isEdit && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="manualEmployee"
                    checked={manualEmployee}
                    onCheckedChange={(checked) =>
                      setManualEmployeeMode(Boolean(checked))
                    }
                  />
                  <label htmlFor="manualEmployee" className="text-sm">
                    Zaměstnanec zatím není v EOS / původní hodnoty vyplnit ručně
                  </label>
                </div>
              )}

              {!manualEmployee && !isEdit && (
                <div className="rounded-lg border p-4">
                  <FormLabel>Vybrat zaměstnance z EOS</FormLabel>

                  <div className="mt-2">
                    <EmployeeCombobox
                      formFields={{
                        personalNumber: "personalNumber",
                        name: "name",
                        surname: "surname",
                        titleBefore: "titleBefore",
                        titleAfter: "titleAfter",
                        userEmail: "userEmail",
                        positionNum: "oldPositionNum",
                        positionName: "oldPositionName",
                        department: "oldDepartment",
                        unitName: "oldUnitName",
                      }}
                      placeholder="Vyberte zaměstnance podle jména nebo osobního čísla…"
                      fetchLimit={20}
                      excludePersonalNumbers={EMPTY_EXCLUDED_PERSONAL_NUMBERS}
                      onSelect={(employee) => {
                        copySelectedEmployeeToOldAndNewValues(employee)
                      }}
                    />
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Po výběru se původní hodnoty automaticky předvyplní.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  name="personalNumber"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Osobní číslo *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          readOnly={!manualEmployee && !isEdit}
                          className={cn(
                            "font-mono",
                            !manualEmployee && !isEdit ? "bg-muted" : "",
                            focusRing
                          )}
                        />
                      </FormControl>
                      <FormDescription>
                        Podle osobního čísla se změna zobrazí jako informační
                        vazba v nástupech a odchodech. Data se tím nepřepisují.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="userEmail"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Firemní e-mail</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          readOnly={!manualEmployee && !isEdit}
                          className={cn(
                            !manualEmployee && !isEdit ? "bg-muted" : "",
                            focusRing
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {(
                  ["titleBefore", "name", "surname", "titleAfter"] as const
                ).map((fieldName) => (
                  <FormField
                    key={fieldName}
                    name={fieldName}
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {fieldName === "titleBefore"
                            ? "Titul před"
                            : fieldName === "name"
                              ? "Jméno *"
                              : fieldName === "surname"
                                ? "Příjmení *"
                                : "Titul za"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            readOnly={!manualEmployee && !isEdit}
                            className={cn(
                              !manualEmployee && !isEdit ? "bg-muted" : "",
                              focusRing
                            )}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              <div className="rounded-lg border bg-muted/10 p-4">
                <div className="flex flex-col gap-1">
                  <FormLabel>Aktuální pozice a zařazení zaměstnance</FormLabel>
                  <FormDescription>
                    Tyto údaje se použijí jako evidovaný stav zaměstnance v
                    přehledu změn. Vyplní se z EOS, nebo je můžete doplnit
                    ručně.
                  </FormDescription>
                </div>

                {(manualEmployee || isEdit) && (
                  <div className="mt-3">
                    <PositionCombobox
                      positions={sortedPositions}
                      value={currentPositionNum}
                      onSelect={selectCurrentPosition}
                      placeholder="Vyberte aktuální pozici podle čísla, názvu nebo odboru…"
                    />
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(
                    [
                      ["oldPositionNum", "Číslo funkce", true],
                      ["oldPositionName", "Pozice", false],
                      ["oldDepartment", "Odbor", false],
                      ["oldUnitName", "Oddělení", false],
                    ] as [keyof FormValues, string, boolean][]
                  ).map(([fieldName, label, isMono]) => (
                    <FormField
                      key={fieldName}
                      name={fieldName}
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{label}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={String(field.value ?? "")}
                              readOnly={!manualEmployee && !isEdit}
                              className={cn(
                                isMono ? "font-mono" : "",
                                !manualEmployee && !isEdit ? "bg-muted" : "",
                                focusRing
                              )}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {changeName && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PencilLine className="size-5" />
                  Nové hodnoty jména / titulů
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(
                    [
                      ["oldTitleBefore", "newTitleBefore", "Titul před"],
                      ["oldName", "newName", "Jméno"],
                      ["oldSurname", "newSurname", "Příjmení"],
                      ["oldTitleAfter", "newTitleAfter", "Titul za"],
                    ] as [keyof FormValues, keyof FormValues, string][]
                  ).map(([oldKey, newKey, label]) => (
                    <React.Fragment key={oldKey}>
                      <FormField
                        name={oldKey}
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Původní {label.toLowerCase()}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={String(field.value ?? "")}
                                className={cn("bg-muted", focusRing)}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        name={newKey}
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Nová hodnota - {label.toLowerCase()}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={String(field.value ?? "")}
                                className={focusRing}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {changePosition && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-5" />
                  Nová pozice / odbor
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="rounded-lg border bg-teal-50/40 p-4 dark:bg-teal-950/10">
                  <FormLabel>Vybrat novou pozici</FormLabel>

                  <div className="mt-2">
                    <PositionCombobox
                      positions={sortedPositions}
                      value={newPositionNum}
                      onSelect={selectNewPosition}
                      placeholder="Vyberte novou pozici podle čísla, názvu nebo odboru…"
                    />
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Po výběru se doplní nové číslo funkce, pozice, odbor a
                    oddělení. Pokud pozice není v seznamu, můžete nové hodnoty
                    doplnit ručně níže.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(
                    [
                      ["newPositionNum", "Nové číslo funkce *", true],
                      ["newPositionName", "Nová pozice", false],
                      ["newDepartment", "Nový odbor", false],
                      ["newUnitName", "Nové oddělení", false],
                    ] as [keyof FormValues, string, boolean][]
                  ).map(([fieldName, label, isMono]) => (
                    <FormField
                      key={fieldName}
                      name={fieldName}
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{label}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={String(field.value ?? "")}
                              className={cn(
                                isMono ? "font-mono" : "",
                                focusRing
                              )}
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
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-5" />
                Poznámka
              </CardTitle>
            </CardHeader>

            <CardContent>
              <FormField
                name="notes"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Poznámka ke změně</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        placeholder="Doplňující informace pro HR nebo pro e-mail…"
                        className={focusRing}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]",
              focusRing
            )}
          >
            {isSubmitting && (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {isEdit ? "Uložit změny" : "Uložit změnu"}
          </Button>
        </form>
      </Form>

      <Dialog
        open={linkModal.open}
        onOpenChange={(open) => {
          if (open) {
            setLinkModal((previous) => ({ ...previous, open: true }))
          }
        }}
      >
        <DialogContent
          className="max-w-lg"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
                <Link2 className="size-5 text-amber-700 dark:text-amber-400" />
              </div>

              <div>
                <DialogTitle>
                  Nalezeny záznamy v nástupech / odchodech
                </DialogTitle>
                <DialogDescription>
                  Osobní číslo{" "}
                  <span className="font-mono font-semibold">
                    {personalNumber}
                  </span>{" "}
                  bylo nalezeno v těchto záznamech.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {linkModal.loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="ml-2 text-sm text-muted-foreground">
                Hledám záznamy…
              </span>
            </div>
          ) : linkModal.matches.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Změna se do nástupů ani odchodů nepropíše. Tyto záznamy pouze
                dostanou informační ikonku podle stejného osobního čísla.
              </p>

              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">
                {linkModal.matches.map((match) => (
                  <div
                    key={`${match.kind}-${match.id}`}
                    className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-sm"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {match.kind === "onboarding" ? "Nástup" : "Odchod"}
                    </Badge>

                    <div className="min-w-0">
                      <div className="font-medium">
                        {match.name} {match.surname}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {match.positionName && (
                          <span>{match.positionName}</span>
                        )}
                        {match.department && <span> · {match.department}</span>}
                        {match.date && <span> · {formatDate(match.date)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Žádné záznamy nebyly nalezeny.
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => void handleSkipLink()}
              disabled={linkModal.linking}
            >
              Zavřít bez kontroly
            </Button>

            <Button
              onClick={() => void handleAcknowledgeLinkedRecords()}
              disabled={linkModal.loading || linkModal.matches.length === 0}
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
            >
              <Link2 className="mr-2 size-4" />
              Rozumím, zobrazit jen informaci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={errorModal.open}
        onOpenChange={(open) =>
          setErrorModal((previous) => ({ ...previous, open }))
        }
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-4">
            <XCircle className="size-12 text-red-500" />
            <div className="space-y-2">
              <DialogTitle className="text-lg font-semibold">
                Nepodařilo se uložit změnu
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {errorModal.message}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() =>
                setErrorModal({
                  open: false,
                  message: "",
                })
              }
            >
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
