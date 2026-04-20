"use client"

import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ProbationFormType } from "@prisma/client"
import { useForm } from "react-hook-form"
import { z } from "zod"

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
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

type EmployeeMeta = {
  fullName?: string
  position?: string
  department?: string
  unitName?: string
  actualStart?: string | null
}

type Mode = "internal" | "public"

function buildSchema(mode: Mode) {
  return z
    .object({
      workPerformance: z
        .string()
        .min(
          10,
          "Prosím vyplňte hodnocení pracovních výsledků a pracovního chování."
        ),
      socialBehavior: z
        .string()
        .min(10, "Prosím vyplňte hodnocení sociálního chování a dovedností."),
      recommendation: z.enum(["yes", "no"], {
        required_error: "Prosím vyberte doporučení.",
      }),
      reasonIfNo: z.string().optional(),
      evaluatorName: z.string().optional(),
      evaluatorEmail: z
        .string()
        .email("Neplatný e-mail")
        .or(z.literal(""))
        .optional(),
    })
    .superRefine((values, ctx) => {
      if (values.recommendation === "no" && !values.reasonIfNo?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reasonIfNo"],
          message: "U záporného stanoviska je důvod povinný.",
        })
      }

      if (mode === "public") {
        if (!values.evaluatorName?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evaluatorName"],
            message: "Vyplňte jméno hodnotitele.",
          })
        }

        if (!values.evaluatorEmail?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evaluatorEmail"],
            message: "Vyplňte e-mail hodnotitele.",
          })
        }
      }
    })
}

export type ProbationEvaluationFormValues = z.infer<
  ReturnType<typeof buildSchema>
>

type Props = {
  documentId?: number
  mode: Mode
  initialData?: unknown
  readOnly?: boolean
  onSubmitInternal?: (
    data: ProbationEvaluationFormValues
  ) => void | Promise<void>
  onSubmitPublic?: (data: ProbationEvaluationFormValues) => void | Promise<void>
  employeeMeta?: EmployeeMeta
  formType: ProbationFormType
  evaluatorName?: string
  evaluatorEmail?: string
}

function formatDateCs(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("cs-CZ")
}

export function ProbationEvaluationForm({
  mode,
  initialData,
  readOnly = false,
  onSubmitInternal,
  onSubmitPublic,
  employeeMeta,
  formType,
  evaluatorName,
  evaluatorEmail,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const schema = useMemo(() => buildSchema(mode), [mode])
  const initial = (initialData ?? {}) as Partial<ProbationEvaluationFormValues>

  const form = useForm<ProbationEvaluationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workPerformance: initial.workPerformance ?? "",
      socialBehavior: initial.socialBehavior ?? "",
      recommendation: initial.recommendation,
      reasonIfNo: initial.reasonIfNo ?? "",
      evaluatorName: initial.evaluatorName ?? evaluatorName ?? "",
      evaluatorEmail: initial.evaluatorEmail ?? evaluatorEmail ?? "",
    },
  })

  const watchRecommendation = form.watch("recommendation")

  const formTitle =
    formType === "MANAGERIAL"
      ? "Vyhodnocení zkušební doby – vedoucí odboru"
      : "Vyhodnocení zkušební doby zaměstnance"

  const signatureLabel =
    formType === "MANAGERIAL"
      ? "podpis tajemníka ÚMČ Praha 6"
      : "podpis vedoucího odboru"

  async function onSubmit(values: ProbationEvaluationFormValues) {
    if (readOnly) return

    setIsSubmitting(true)
    try {
      if (mode === "internal" && onSubmitInternal) {
        await onSubmitInternal(values)
      }

      if (mode === "public" && onSubmitPublic) {
        await onSubmitPublic(values)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const showEvaluatorInputs = !readOnly && mode === "public"
  const showEvaluatorReadonly =
    !showEvaluatorInputs &&
    Boolean(form.getValues("evaluatorName") || form.getValues("evaluatorEmail"))

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold">{formTitle}</h2>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Základní údaje</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <span className="font-medium">paní/pán:</span>{" "}
                {employeeMeta?.fullName || "—"}
              </div>
              <div>
                <span className="font-medium">pracovní poměr sjednán od:</span>{" "}
                {formatDateCs(employeeMeta?.actualStart)}
              </div>
              <div>
                <span className="font-medium">odbor:</span>{" "}
                {employeeMeta?.department || "—"}
              </div>
              <div>
                <span className="font-medium">oddělení:</span>{" "}
                {employeeMeta?.unitName || "—"}
              </div>
              <div className="md:col-span-2">
                <span className="font-medium">pozice:</span>{" "}
                {employeeMeta?.position || "—"}
              </div>
            </CardContent>
          </Card>

          {showEvaluatorInputs && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hodnotitel</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="evaluatorName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jméno a příjmení</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Např. Jana Nováková"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="evaluatorEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="např. jana.novakova@praha6.cz"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          {showEvaluatorReadonly && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hodnotitel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Jméno:</span>{" "}
                  {form.getValues("evaluatorName") || "—"}
                </div>
                <div>
                  <span className="font-medium">E-mail:</span>{" "}
                  {form.getValues("evaluatorEmail") || "—"}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pracovní výsledky a pracovní chování
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="workPerformance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Kvalita práce, stížnosti, ochota přijímat úkoly, úsilí při
                      plnění úkolů, docházka, dodržování předpisů, požívání
                      alkoholu atd.
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        disabled={readOnly || isSubmitting}
                        placeholder="Vyplňte hodnocení pracovních výsledků a pracovního chování..."
                      />
                    </FormControl>
                    <FormDescription>Minimálně 10 znaků.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sociální chování a dovednosti, znalosti, vlastnosti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="socialBehavior"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Ochota ke spolupráci, jednání s lidmi, vztahy ke
                      spolupracovníkům, znalost práce, samostatnost,
                      spolehlivost, loajalita, odolnost vůči zatížení a stresu
                      atd.
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        disabled={readOnly || isSubmitting}
                        placeholder="Vyplňte hodnocení sociálního chování a dovedností..."
                      />
                    </FormControl>
                    <FormDescription>Minimálně 10 znaků.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Na základě vyhodnocení zkušební doby doporučuji setrvání
                zaměstnance v pracovním poměru po uplynutí zkušební doby
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="recommendation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Doporučení:</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={readOnly || isSubmitting}
                        className="flex flex-col space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="recommendation-yes" />
                          <label
                            htmlFor="recommendation-yes"
                            className="cursor-pointer text-sm font-medium"
                          >
                            ANO
                          </label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="recommendation-no" />
                          <label
                            htmlFor="recommendation-no"
                            className="cursor-pointer text-sm font-medium"
                          >
                            NE
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchRecommendation === "no" && (
                <FormField
                  control={form.control}
                  name="reasonIfNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Důvod záporného stanoviska a informace o případných již
                        učiněných úkonech směřujících ke skončení pracovního
                        poměru ve zkušební době
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={5}
                          disabled={readOnly || isSubmitting}
                          placeholder="Uveďte důvod záporného stanoviska..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Závěr</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              <div>Praha, dne {new Date().toLocaleDateString("cs-CZ")}</div>

              <div className="pt-10 text-center">
                <div className="mx-auto w-64 border-t border-black" />
                <div className="mt-2 italic">{signatureLabel}</div>
              </div>
            </CardContent>
          </Card>

          {!readOnly && (
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Ukládám..." : "Uložit hodnocení"}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  )
}
