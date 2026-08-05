"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import type { ProbationFormType } from "@prisma/client"
import { format } from "date-fns"
import { Check, Undo2 } from "lucide-react"
import { useSession } from "next-auth/react"
import { useForm, type DefaultValues } from "react-hook-form"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

type EmployeeMeta = {
  fullName?: string
  personalNumber?: string | null
  position?: string | null
  department?: string | null
  unitName?: string | null
  actualStart?: string | null
  plannedStart?: string | null
  probationEnd?: string | null

  supervisorName?: string | null
  supervisorEmail?: string | null
  supervisorPosition?: string | null
  supervisorDepartment?: string | null
  supervisorUnitName?: string | null
}

type Mode = "internal" | "public"
type RecommendationValue = "yes" | "no"
export type ProbationEvaluationSubmitMode = "draft" | "final" | "revision"

export type ProbationEvaluationSignatureValue = {
  signedByName: string | null
  signedByEmail: string | null
  signedAt: string | null
  signedOnBehalf?: boolean | null
}

type ProbationStoredData = {
  submitMode?: ProbationEvaluationSubmitMode | null

  workResults?: string | null
  workBehavior?: string | null
  socialSkills?: string | null
  skillsKnowledgeTraits?: string | null

  workPerformance?: string | null
  socialBehavior?: string | null

  recommendation?: RecommendationValue | boolean | "" | null
  reason?: string | null
  reasonIfNo?: string | null

  evaluatorName?: string | null
  evaluatorEmail?: string | null
  evaluatorPosition?: string | null
  evaluatorDepartment?: string | null
  evaluatorUnitName?: string | null
  evaluatedAt?: string | null
  signature?: ProbationEvaluationSignatureValue | null
}

function buildSchema() {
  return z
    .object({
      workResults: z
        .string()
        .trim()
        .min(10, "Vyplňte pracovní výsledky alespoň stručně."),
      workBehavior: z
        .string()
        .trim()
        .min(10, "Vyplňte pracovní chování alespoň stručně."),
      socialSkills: z
        .string()
        .trim()
        .min(10, "Vyplňte sociální chování a spolupráci alespoň stručně."),
      skillsKnowledgeTraits: z
        .string()
        .trim()
        .min(10, "Vyplňte dovednosti, znalosti a vlastnosti alespoň stručně."),
      recommendation: z.union([z.enum(["yes", "no"]), z.literal("")]),
      reason: z.string().trim().optional(),
      evaluatorName: z.string().trim().optional(),
      evaluatorEmail: z.string().trim().optional(),
    })
    .superRefine((values, ctx) => {
      if (!values.recommendation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recommendation"],
          message: "Vyberte doporučení.",
        })
      }

      if (values.recommendation === "no" && !values.reason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: "U záporného stanoviska je důvod povinný.",
        })
      }
    })
}

type FormFields = z.infer<ReturnType<typeof buildSchema>>

export type ProbationEvaluationFormValues = {
  submitMode: ProbationEvaluationSubmitMode

  workResults: string
  workBehavior: string
  socialSkills: string
  skillsKnowledgeTraits: string

  workPerformance: string
  socialBehavior: string

  recommendation: RecommendationValue | ""
  reason: string
  reasonIfNo: string

  evaluatorName?: string
  evaluatorEmail?: string
  evaluatorPosition?: string | null
  evaluatorDepartment?: string | null
  evaluatorUnitName?: string | null

  signature: ProbationEvaluationSignatureValue
}

type Props = {
  mode: Mode
  initialData?: unknown
  readOnly?: boolean
  revisionMode?: boolean
  onSubmitInternal?: (
    data: ProbationEvaluationFormValues
  ) => void | Promise<void>
  onSubmitPublic?: (data: ProbationEvaluationFormValues) => void | Promise<void>
  onDirtyChange?: (dirty: boolean) => void
  employeeMeta?: EmployeeMeta
  formType?: ProbationFormType | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  currentUserName?: string | null
  currentUserEmail?: string | null
}

const managerialKeywords = [
  "vedení",
  "ředitel",
  "ředitelka",
  "vedoucí",
  "tajemník",
  "tajemnice",
]

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function isManagerialPosition(positionName?: string | null) {
  const normalizedPositionName = normalizeText(positionName)

  if (!normalizedPositionName) return false

  return managerialKeywords.some((keyword) =>
    normalizedPositionName.includes(normalizeText(keyword))
  )
}

function resolveFormType(args: {
  formType?: ProbationFormType | null
  positionName?: string | null
}): ProbationFormType {
  if (args.formType === "MANAGERIAL") return "MANAGERIAL"

  if (isManagerialPosition(args.positionName)) {
    return "MANAGERIAL"
  }

  return "REGULAR_EMPLOYEE"
}

function fmtDate(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return format(date, "d.M.yyyy")
}

function fmtDateTime(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return format(date, "d.M.yyyy HH:mm")
}

function cleanInline(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null
}

function joinInline(values: Array<string | null | undefined>) {
  const cleaned = values
    .map(cleanInline)
    .filter((value): value is string => Boolean(value))

  return cleaned.length > 0 ? cleaned.join(" • ") : null
}

function emptySignature(): ProbationEvaluationSignatureValue {
  return {
    signedByName: null,
    signedByEmail: null,
    signedAt: null,
    signedOnBehalf: false,
  }
}

function isSignatureValue(
  value: unknown
): value is ProbationEvaluationSignatureValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  return (
    "signedByName" in value || "signedByEmail" in value || "signedAt" in value
  )
}

function asStoredData(value: unknown): ProbationStoredData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as ProbationStoredData
}

function normalizeRecommendation(
  value: ProbationStoredData["recommendation"]
): RecommendationValue | "" {
  if (value === true) return "yes"
  if (value === false) return "no"
  if (value === "yes" || value === "no") return value

  return ""
}

function getInitialSignature(args: {
  initial: ProbationStoredData
  evaluatorName?: string | null
  evaluatorEmail?: string | null
}): ProbationEvaluationSignatureValue {
  if (isSignatureValue(args.initial.signature)) {
    return {
      signedByName: args.initial.signature.signedByName ?? null,
      signedByEmail: args.initial.signature.signedByEmail ?? null,
      signedAt: args.initial.signature.signedAt ?? null,
      signedOnBehalf: args.initial.signature.signedOnBehalf ?? false,
    }
  }

  const fallbackName = args.evaluatorName ?? args.initial.evaluatorName ?? null
  const fallbackEmail =
    args.evaluatorEmail ?? args.initial.evaluatorEmail ?? null
  const fallbackSignedAt = args.initial.evaluatedAt ?? null

  if (fallbackName || fallbackEmail || fallbackSignedAt) {
    return {
      signedByName: fallbackName,
      signedByEmail: fallbackEmail,
      signedAt: fallbackSignedAt,
      signedOnBehalf: false,
    }
  }

  return emptySignature()
}

function joinLegacyBlock(
  titleA: string,
  valueA: string,
  titleB: string,
  valueB: string
) {
  return [`${titleA}:\n${valueA.trim()}`, `${titleB}:\n${valueB.trim()}`].join(
    "\n\n"
  )
}

function getDefaultValues(args: {
  initial: ProbationStoredData
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  supervisorName?: string | null
  supervisorEmail?: string | null
}): DefaultValues<FormFields> {
  return {
    workResults: args.initial.workResults ?? "",
    workBehavior: args.initial.workBehavior ?? "",
    socialSkills: args.initial.socialSkills ?? "",
    skillsKnowledgeTraits: args.initial.skillsKnowledgeTraits ?? "",
    recommendation: normalizeRecommendation(args.initial.recommendation),
    reason: args.initial.reason ?? args.initial.reasonIfNo ?? "",
    evaluatorName:
      args.supervisorName ??
      args.initial.evaluatorName ??
      args.evaluatorName ??
      "",
    evaluatorEmail:
      args.supervisorEmail ??
      args.initial.evaluatorEmail ??
      args.evaluatorEmail ??
      "",
  }
}

type SignatureBlockProps = {
  value: ProbationEvaluationSignatureValue
  readOnly: boolean
  canRevokeSignature: boolean
  currentUserName: string
  currentUserEmail: string
  supervisorName?: string | null
  supervisorEmail?: string | null
  supervisorPosition?: string | null
  supervisorDepartment?: string | null
  supervisorUnitName?: string | null
  allowBehalfSignature: boolean
  onSign: () => void
  onSignBehalf: () => void
  onRevoke: () => void
}

function SignatureBlock({
  value,
  readOnly,
  canRevokeSignature,
  currentUserName,
  currentUserEmail,
  supervisorName,
  supervisorEmail,
  supervisorPosition,
  supervisorDepartment,
  supervisorUnitName,
  allowBehalfSignature,
  onSign,
  onSignBehalf,
  onRevoke,
}: SignatureBlockProps) {
  const isSigned = Boolean(value.signedAt)

  const canSign =
    !readOnly && !isSigned && Boolean(currentUserName || currentUserEmail)

  const canRevoke = !readOnly && isSigned && canRevokeSignature

  const supervisorOrg = [supervisorDepartment, supervisorUnitName]
    .filter(Boolean)
    .join(" – ")

  const supervisorDetails = joinInline([
    supervisorPosition,
    supervisorOrg,
    supervisorEmail,
  ])

  return (
    <div className="flex flex-col rounded-md border p-3">
      <Label className="mb-2 text-sm font-medium">Podpis a potvrzení</Label>

      <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <div className="font-semibold text-foreground">
          Hodnotitel: {cleanInline(supervisorName) || "vedoucí není vyplněn"}
        </div>

        <div className="mt-1 break-words text-muted-foreground">
          {supervisorDetails ||
            "Pozice, odbor a e-mail hodnotitele nejsou vyplněny."}
        </div>
      </div>

      <div className="min-h-[52px] flex-1">
        {isSigned ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="font-medium">
              {value.signedByName ?? "Podepsáno"}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtDateTime(value.signedAt)}
              {value.signedOnBehalf ? " · v zastoupení" : ""}
            </div>

            {value.signedByEmail && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {value.signedByEmail}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            Nepodepsáno
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canSign && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={onSign}
              >
                <Check className="size-3 shrink-0" />
                Podepsat
              </Button>

              {allowBehalfSignature && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1 text-muted-foreground"
                  onClick={onSignBehalf}
                >
                  <Check className="size-3 shrink-0" />
                  Podepsat v zastoupení
                </Button>
              )}
            </>
          )}

          {canRevoke && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1 text-muted-foreground"
              onClick={onRevoke}
            >
              <Undo2 className="size-3 shrink-0" />
              Zrušit podpis
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function ProbationEvaluationForm({
  mode,
  initialData,
  readOnly = false,
  revisionMode = false,
  onSubmitInternal,
  onSubmitPublic,
  onDirtyChange,
  employeeMeta,
  formType,
  evaluatorName,
  evaluatorEmail,
  currentUserName,
  currentUserEmail,
}: Props) {
  const { data: session } = useSession()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingMode, setSubmittingMode] =
    useState<ProbationEvaluationSubmitMode | null>(null)
  const [signature, setSignature] =
    useState<ProbationEvaluationSignatureValue>(emptySignature)
  const [signatureDirty, setSignatureDirty] = useState(false)
  const [signatureError, setSignatureError] = useState<string | null>(null)

  const role = session?.user?.role ?? "USER"
  const isAdmin = role === "ADMIN" || role === "HR" || role === "IT"

  const schema = useMemo(() => buildSchema(), [])
  const initial = useMemo(() => asStoredData(initialData), [initialData])

  const defaultValues = useMemo(
    () =>
      getDefaultValues({
        initial,
        evaluatorName,
        evaluatorEmail,
        supervisorName: employeeMeta?.supervisorName,
        supervisorEmail: employeeMeta?.supervisorEmail,
      }),
    [
      initial,
      evaluatorName,
      evaluatorEmail,
      employeeMeta?.supervisorName,
      employeeMeta?.supervisorEmail,
    ]
  )

  const form = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const isFormDirty = form.formState.isDirty
  const isDirty = isFormDirty || signatureDirty

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => {
    if (readOnly || !isDirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [isDirty, readOnly])

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  useEffect(() => {
    setSignature(
      getInitialSignature({
        initial,
        evaluatorName: employeeMeta?.supervisorName ?? evaluatorName,
        evaluatorEmail: employeeMeta?.supervisorEmail ?? evaluatorEmail,
      })
    )
    setSignatureDirty(false)
  }, [
    initial,
    evaluatorName,
    evaluatorEmail,
    employeeMeta?.supervisorName,
    employeeMeta?.supervisorEmail,
  ])

  const watchRecommendation = form.watch("recommendation")

  const resolvedCurrentUserName =
    currentUserName?.trim() ||
    session?.user?.name?.trim() ||
    currentUserEmail?.trim() ||
    session?.user?.email?.trim() ||
    ""

  const resolvedCurrentUserEmail =
    currentUserEmail?.trim() || session?.user?.email?.trim() || ""

  const currentUserIsSigner =
    normalizeEmail(signature.signedByEmail) ===
    normalizeEmail(resolvedCurrentUserEmail)

  const effectiveFormType = useMemo(
    () =>
      resolveFormType({
        formType,
        positionName: employeeMeta?.position,
      }),
    [formType, employeeMeta?.position]
  )

  const isManagerial = effectiveFormType === "MANAGERIAL"

  const title = isManagerial
    ? "Vyhodnocení zkušební doby – vedoucí / manažerská pozice"
    : "Vyhodnocení zkušební doby zaměstnance"

  const statusBadge = readOnly ? (
    <Badge variant="outline">Pouze pro čtení</Badge>
  ) : revisionMode ? (
    <Badge variant="outline">Režim úprav</Badge>
  ) : (
    <Badge variant="secondary">
      {mode === "internal" ? "Interní režim" : "Podpisový režim"}
    </Badge>
  )

  const reasonLabel =
    watchRecommendation === "no"
      ? "Důvod záporného stanoviska"
      : "Důvod kladného stanoviska"

  const reasonDescription =
    watchRecommendation === "no"
      ? "Povinné při záporném stanovisku."
      : "Volitelné – můžete doplnit, proč doporučujete pokračování pracovního poměru."

  const employmentStart =
    employeeMeta?.actualStart ?? employeeMeta?.plannedStart ?? null

  const supervisorOrg = joinInline([
    employeeMeta?.supervisorDepartment,
    employeeMeta?.supervisorUnitName,
  ])

  const supervisorDetails = joinInline([
    employeeMeta?.supervisorPosition,
    supervisorOrg,
    employeeMeta?.supervisorEmail || evaluatorEmail,
  ])

  function buildPayload(
    submitMode: ProbationEvaluationSubmitMode,
    values: FormFields
  ): ProbationEvaluationFormValues {
    const workResults = values.workResults?.trim() ?? ""
    const workBehavior = values.workBehavior?.trim() ?? ""
    const socialSkills = values.socialSkills?.trim() ?? ""
    const skillsKnowledgeTraits = values.skillsKnowledgeTraits?.trim() ?? ""
    const reason = values.reason?.trim() ?? ""

    const recommendation =
      values.recommendation === "yes" || values.recommendation === "no"
        ? values.recommendation
        : ""

    return {
      submitMode,

      workResults,
      workBehavior,
      socialSkills,
      skillsKnowledgeTraits,

      workPerformance:
        workResults || workBehavior
          ? joinLegacyBlock(
              "Pracovní výsledky",
              workResults,
              "Pracovní chování",
              workBehavior
            )
          : "",

      socialBehavior:
        socialSkills || skillsKnowledgeTraits
          ? joinLegacyBlock(
              "Sociální chování a spolupráce",
              socialSkills,
              "Dovednosti, znalosti a vlastnosti",
              skillsKnowledgeTraits
            )
          : "",

      recommendation,
      reason,
      reasonIfNo: recommendation === "no" ? reason : "",

      evaluatorName:
        employeeMeta?.supervisorName?.trim() ||
        values.evaluatorName?.trim() ||
        evaluatorName?.trim() ||
        signature.signedByName?.trim() ||
        "",

      evaluatorEmail:
        employeeMeta?.supervisorEmail?.trim() ||
        values.evaluatorEmail?.trim() ||
        evaluatorEmail?.trim() ||
        signature.signedByEmail?.trim() ||
        "",

      evaluatorPosition: employeeMeta?.supervisorPosition ?? null,
      evaluatorDepartment: employeeMeta?.supervisorDepartment ?? null,
      evaluatorUnitName: employeeMeta?.supervisorUnitName ?? null,

      signature,
    }
  }

  async function submitPayload(payload: ProbationEvaluationFormValues) {
    if (mode === "internal" && onSubmitInternal) {
      await onSubmitInternal(payload)
    }

    if (mode === "public" && onSubmitPublic) {
      await onSubmitPublic(payload)
    }

    form.reset(form.getValues())
    setSignatureDirty(false)
    onDirtyChange?.(false)
  }

  function sign(behalf = false) {
    if (readOnly || (!resolvedCurrentUserName && !resolvedCurrentUserEmail)) {
      return
    }

    setSignature({
      signedByName: behalf
        ? `${resolvedCurrentUserName || resolvedCurrentUserEmail} — v zastoupení`
        : resolvedCurrentUserName || resolvedCurrentUserEmail,
      signedByEmail: resolvedCurrentUserEmail || null,
      signedAt: new Date().toISOString(),
      signedOnBehalf: behalf,
    })

    setSignatureError(null)
    setSignatureDirty(true)
    onDirtyChange?.(true)
  }

  function revokeSignature() {
    if (readOnly) return
    if (!isAdmin && !currentUserIsSigner) return

    setSignature(emptySignature())
    setSignatureDirty(true)
    setSignatureError("Formulář je potřeba znovu podepsat.")
    onDirtyChange?.(true)
  }

  async function handleSaveDraft() {
    if (readOnly || revisionMode) return

    setIsSubmitting(true)
    setSubmittingMode("draft")
    setSignatureError(null)

    try {
      const payload = buildPayload("draft", form.getValues())
      await submitPayload(payload)
    } finally {
      setIsSubmitting(false)
      setSubmittingMode(null)
    }
  }

  async function handleSubmitFinal(values: FormFields) {
    if (readOnly) return

    if (values.recommendation !== "yes" && values.recommendation !== "no") {
      return
    }

    if (!signature.signedAt) {
      setSignatureError("Před uložením je potřeba formulář podepsat.")
      return
    }

    const nextSubmitMode: ProbationEvaluationSubmitMode = revisionMode
      ? "revision"
      : "final"

    setIsSubmitting(true)
    setSubmittingMode(nextSubmitMode)
    setSignatureError(null)

    try {
      const payload = buildPayload(nextSubmitMode, values)
      await submitPayload(payload)
    } finally {
      setIsSubmitting(false)
      setSubmittingMode(null)
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmitFinal)}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{title}</span>
                {statusBadge}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6 text-sm">
              <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
                <div>
                  <span className="font-medium text-muted-foreground">
                    Zaměstnanec:
                  </span>{" "}
                  {employeeMeta?.fullName || "—"}
                </div>

                <div>
                  <span className="font-medium text-muted-foreground">
                    Osobní číslo:
                  </span>{" "}
                  {employeeMeta?.personalNumber || "—"}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
                <div>
                  <span className="font-medium text-muted-foreground">
                    Odbor / oddělení:
                  </span>{" "}
                  {[employeeMeta?.department, employeeMeta?.unitName]
                    .filter(Boolean)
                    .join(" – ") || "—"}
                </div>

                <div>
                  <span className="font-medium text-muted-foreground">
                    Pracovní poměr od:
                  </span>{" "}
                  {fmtDate(employmentStart)}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
                <div>
                  <span className="font-medium text-muted-foreground">
                    Pozice:
                  </span>{" "}
                  {employeeMeta?.position || "—"}
                </div>

                <div>
                  <span className="font-medium text-muted-foreground">
                    Konec zkušební doby:
                  </span>{" "}
                  {fmtDate(employeeMeta?.probationEnd)}
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-4">
                <div className="mb-2 text-sm font-semibold">
                  Hodnotitel / vedoucí odboru
                </div>

                <div className="space-y-1 text-sm">
                  <div className="font-medium text-foreground">
                    {cleanInline(employeeMeta?.supervisorName) ||
                      cleanInline(evaluatorName) ||
                      "Vedoucí není vyplněn"}
                  </div>

                  <div className="break-words text-muted-foreground">
                    {supervisorDetails ||
                      "Pozice, odbor a e-mail hodnotitele nejsou vyplněny."}
                  </div>
                </div>
              </div>

              {revisionMode && !readOnly && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">
                    Upravujete již vyplněné vyhodnocení zkušební doby.
                  </p>
                  <p className="mt-0.5 text-xs">
                    Po uložení se změna zapíše do historie. V tomto režimu není
                    možné ukládat rozpracovanou verzi – změny se ukládají rovnou
                    jako oprava hotového formuláře.
                  </p>
                </div>
              )}

              <section className="border-t pt-4">
                <h3 className="text-base font-semibold">
                  1. Pracovní výsledky
                </h3>

                <div className="mt-3">
                  <FormField
                    control={form.control}
                    name="workResults"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Zhodnoťte zejména kvalitu práce, plnění pracovních
                          úkolů, případné stížnosti a celkové pracovní výsledky.
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={5}
                            disabled={readOnly || isSubmitting}
                            placeholder="Např. kvalita práce, stížnosti, plnění úkolů, celkové výsledky..."
                            className="resize-y"
                          />
                        </FormControl>
                        {!readOnly && (
                          <FormDescription>
                            Minimálně 10 znaků pro uložení.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="border-t pt-4">
                <h3 className="text-base font-semibold">2. Pracovní chování</h3>

                <div className="mt-3">
                  <FormField
                    control={form.control}
                    name="workBehavior"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Zhodnoťte zejména ochotu přijímat úkoly, úsilí při
                          jejich plnění, docházku, dodržování předpisů a
                          pracovní kázeň.
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={5}
                            disabled={readOnly || isSubmitting}
                            placeholder="Např. ochota přijímat úkoly, docházka, dodržování předpisů, pracovní kázeň..."
                            className="resize-y"
                          />
                        </FormControl>
                        {!readOnly && (
                          <FormDescription>
                            Minimálně 10 znaků pro uložení.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="border-t pt-4">
                <h3 className="text-base font-semibold">
                  3. Sociální chování a spolupráce
                </h3>

                <div className="mt-3">
                  <FormField
                    control={form.control}
                    name="socialSkills"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Zhodnoťte zejména ochotu ke spolupráci, jednání s
                          lidmi a vztahy ke spolupracovníkům.
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={5}
                            disabled={readOnly || isSubmitting}
                            placeholder="Např. spolupráce, komunikace, jednání s lidmi, vztahy v týmu..."
                            className="resize-y"
                          />
                        </FormControl>
                        {!readOnly && (
                          <FormDescription>
                            Minimálně 10 znaků pro uložení.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="border-t pt-4">
                <h3 className="text-base font-semibold">
                  4. Dovednosti, znalosti a vlastnosti
                </h3>

                <div className="mt-3">
                  <FormField
                    control={form.control}
                    name="skillsKnowledgeTraits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Zhodnoťte zejména znalost práce, samostatnost,
                          spolehlivost, loajalitu a odolnost vůči zatížení a
                          stresu.
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={5}
                            disabled={readOnly || isSubmitting}
                            placeholder="Např. znalost práce, samostatnost, spolehlivost, loajalita, odolnost vůči stresu..."
                            className="resize-y"
                          />
                        </FormControl>
                        {!readOnly && (
                          <FormDescription>
                            Minimálně 10 znaků pro uložení.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section className="border-t pt-4">
                <h3 className="text-base font-semibold">
                  Doporučení k pokračování pracovního poměru
                </h3>

                <div className="mt-3 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Na základě vyhodnocení zkušební doby doporučuji nebo
                    nedoporučuji setrvání zaměstnance v pracovním poměru po
                    uplynutí zkušební doby:
                  </p>

                  <FormField
                    control={form.control}
                    name="recommendation"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            value={field.value ?? ""}
                            onValueChange={field.onChange}
                            disabled={readOnly || isSubmitting}
                            className="grid gap-2 md:grid-cols-2"
                          >
                            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm transition-colors hover:bg-muted/40 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
                              <RadioGroupItem
                                value="yes"
                                id="recommendation-yes"
                              />
                              <span className="font-medium">
                                ANO — doporučuji pokračování
                              </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm transition-colors hover:bg-muted/40 has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
                              <RadioGroupItem
                                value="no"
                                id="recommendation-no"
                              />
                              <span className="font-medium">
                                NE — nedoporučuji pokračování
                              </span>
                            </label>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchRecommendation && (
                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {reasonLabel}
                            {watchRecommendation === "no"
                              ? " *"
                              : " (volitelné)"}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={4}
                              disabled={readOnly || isSubmitting}
                              placeholder={
                                watchRecommendation === "no"
                                  ? "Uveďte důvod záporného stanoviska a případné kroky směřující ke skončení pracovního poměru..."
                                  : "Volitelně uveďte důvod kladného stanoviska..."
                              }
                              className="resize-y"
                            />
                          </FormControl>
                          {!readOnly && (
                            <FormDescription>
                              {reasonDescription}
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </section>

              <section className="border-t pt-4">
                <h3 className="text-base font-semibold">Podpis a potvrzení</h3>

                <div className="mt-3">
                  <SignatureBlock
                    value={signature}
                    readOnly={readOnly || isSubmitting}
                    canRevokeSignature={isAdmin || currentUserIsSigner}
                    currentUserName={resolvedCurrentUserName}
                    currentUserEmail={resolvedCurrentUserEmail}
                    supervisorName={
                      employeeMeta?.supervisorName ??
                      evaluatorName ??
                      currentUserName ??
                      null
                    }
                    supervisorEmail={
                      employeeMeta?.supervisorEmail ??
                      evaluatorEmail ??
                      currentUserEmail ??
                      null
                    }
                    supervisorPosition={
                      employeeMeta?.supervisorPosition ?? null
                    }
                    supervisorDepartment={
                      employeeMeta?.supervisorDepartment ?? null
                    }
                    supervisorUnitName={
                      employeeMeta?.supervisorUnitName ?? null
                    }
                    allowBehalfSignature={mode === "internal"}
                    onSign={() => sign(false)}
                    onSignBehalf={() => sign(true)}
                    onRevoke={revokeSignature}
                  />

                  {signatureError && (
                    <p className="mt-2 text-sm text-destructive">
                      {signatureError}
                    </p>
                  )}
                </div>
              </section>

              {!readOnly && revisionMode && (
                <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Ukládáte opravu již vyplněného formuláře. Po uložení se
                    formulář znovu uzavře a změna se zapíše do historie.
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-auto min-h-10 whitespace-normal bg-[#00847C] px-4 py-2.5 text-sm leading-snug text-white hover:bg-[#0B6D73] sm:min-w-[180px] sm:whitespace-nowrap"
                  >
                    {isSubmitting && submittingMode === "revision"
                      ? "Ukládám změny…"
                      : "Uložit změny"}
                  </Button>
                </div>
              )}

              {!readOnly && !revisionMode && (
                <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Rozpracované vyhodnocení můžete uložit a vrátit se k němu
                    později. Finální odeslání formulář uzavře a odešle PDF
                    vyplněného formuláře na Personální oddělení.
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => void handleSaveDraft()}
                      className="h-auto min-h-10 whitespace-normal px-4 py-2.5 text-sm leading-snug sm:min-w-[190px] sm:whitespace-nowrap"
                    >
                      {isSubmitting && submittingMode === "draft"
                        ? "Ukládám změny…"
                        : "Uložit rozpracované"}
                    </Button>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-auto min-h-10 whitespace-normal bg-[#00847C] px-4 py-2.5 text-sm leading-snug text-white hover:bg-[#0B6D73] sm:min-w-[260px] sm:whitespace-nowrap"
                    >
                      {isSubmitting && submittingMode === "final"
                        ? "Ukládám a odesílám…"
                        : mode === "public"
                          ? "Uložit a odeslat"
                          : "Uložit jako finální vyhodnocení"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}
