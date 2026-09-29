"use client"

import * as React from "react"
import { useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { useToast } from "@/hooks/use-toast"
import { EmployeeMeta } from "@/lib/employee-meta"
import { ServerValidationError } from "@/lib/server-validation-error"
import {
  affidavitSchema,
  experienceTypeEnum,
  type AffidavitSchema,
} from "@/lib/validations/employment-documents"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DocumentEmployeeHeader } from "@/components/common/document-employee-header"

type ExperienceEntry = AffidavitSchema["experience"][number]
type MilitaryEntry = AffidavitSchema["militaryService"][number]
type CloseRelativeCareEntry = AffidavitSchema["closeRelativeCare"][number]
type DoctoralStudyEntry = AffidavitSchema["doctoralStudy"][number]

const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
  EMPLOYMENT: "Zaměstnanecký poměr",
  OSVC: "OSVČ",
  DPP: "Dohoda o provedení práce (DPP)",
  DPC: "Dohoda o pracovní činnosti (DPČ)",
  OTHER: "Jiné",
}

type AffidavitFormBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
  employeeMeta?: EmployeeMeta
}

type AffidavitFormPublicProps = AffidavitFormBaseProps & {
  mode: "public"
  hash: string
  onSubmitted?: () => void
  onSubmitInternal?: never
}

type AffidavitFormInternalProps = AffidavitFormBaseProps & {
  mode: "internal"
  hash?: never
  onSubmitted?: never
  onSubmitInternal?: (data: unknown) => Promise<void> | void
}

export type AffidavitFormProps =
  | AffidavitFormPublicProps
  | AffidavitFormInternalProps

const baseDefaultValues: Partial<AffidavitSchema> = {
  noExperience: false,
  experience: [
    {
      employer: "",
      jobPositionName: "",
      jobType: "",
      employmentType: undefined,
      employmentTypeOther: "",
      from: "",
      to: "",
      workloadType: undefined,
      workloadOther: "",
    },
  ],
  militaryService: [{ service: undefined, from: "", to: "" }],
  maternityParental: [{ childName: "", childBirthDate: "", from: "", to: "" }],
  continuousCare: [{ childName: "", childBirthDate: "", from: "", to: "" }],
  disabledChildCare: [{ childName: "", childBirthDate: "", from: "", to: "" }],
  closeRelativeCare: [
    { personName: "", dependencyLevel: undefined, from: "", to: "" },
  ],
  doctoralStudy: [{ schoolName: "", studyProgram: "", from: "", to: "" }],
  unpaidLeave: [{ reason: "", from: "", to: "" }],
}

function inferHasFlag(
  initial: Partial<AffidavitSchema> | undefined,
  flagKey: keyof AffidavitSchema,
  arrKey: keyof AffidavitSchema,
  hasAny: (rows: unknown[]) => boolean
): boolean | undefined {
  if (!initial) return undefined
  const flagVal = initial[flagKey]
  if (typeof flagVal === "boolean") return flagVal
  const arr = initial[arrKey]
  if (Array.isArray(arr) && hasAny(arr)) return true
  return undefined
}

function buildDefaultValues(
  initial: Partial<AffidavitSchema> | undefined
): Partial<AffidavitSchema> {
  return {
    ...baseDefaultValues,
    ...initial,
    hasMilitaryService: inferHasFlag(
      initial,
      "hasMilitaryService",
      "militaryService",
      (rows) =>
        rows.some((m) => {
          const row = m as MilitaryEntry
          return !!row.service || !!row.from || !!row.to
        })
    ),
    hasUnpaidLeave: inferHasFlag(
      initial,
      "hasUnpaidLeave",
      "unpaidLeave",
      (rows) =>
        rows.some((u) => {
          const row = u as AffidavitSchema["unpaidLeave"][number]
          return !!row.reason || !!row.from || !!row.to
        })
    ),
    hasMaternityParental: inferHasFlag(
      initial,
      "hasMaternityParental",
      "maternityParental",
      (rows) =>
        rows.some((c) => {
          const row = c as AffidavitSchema["maternityParental"][number]
          return (
            !!row.childName || !!row.childBirthDate || !!row.from || !!row.to
          )
        })
    ),
    hasContinuousCare: inferHasFlag(
      initial,
      "hasContinuousCare",
      "continuousCare",
      (rows) =>
        rows.some((c) => {
          const row = c as AffidavitSchema["continuousCare"][number]
          return (
            !!row.childName || !!row.childBirthDate || !!row.from || !!row.to
          )
        })
    ),
    hasDisabledChildCare: inferHasFlag(
      initial,
      "hasDisabledChildCare",
      "disabledChildCare",
      (rows) =>
        rows.some((c) => {
          const row = c as AffidavitSchema["disabledChildCare"][number]
          return (
            !!row.childName || !!row.childBirthDate || !!row.from || !!row.to
          )
        })
    ),
    hasCloseRelativeCare: inferHasFlag(
      initial,
      "hasCloseRelativeCare",
      "closeRelativeCare",
      (rows) =>
        rows.some((c) => {
          const row = c as CloseRelativeCareEntry
          return (
            !!row.personName || !!row.dependencyLevel || !!row.from || !!row.to
          )
        })
    ),
    hasDoctoralStudy: inferHasFlag(
      initial,
      "hasDoctoralStudy",
      "doctoralStudy",
      (rows) =>
        rows.some((d) => {
          const row = d as DoctoralStudyEntry
          return (
            !!row.schoolName || !!row.studyProgram || !!row.from || !!row.to
          )
        })
    ),
  }
}

function YesNoToggle({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: boolean | undefined
  onChange: (next: boolean) => void
  disabled?: boolean
  idPrefix: string
}) {
  return (
    <RadioGroup
      value={value === true ? "yes" : value === false ? "no" : ""}
      onValueChange={(v) => onChange(v === "yes")}
      className="flex gap-4"
      disabled={disabled}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${idPrefix}-yes`} value="yes" />
        <Label
          htmlFor={`${idPrefix}-yes`}
          className="cursor-pointer font-normal"
        >
          Ano
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${idPrefix}-no`} value="no" />
        <Label
          htmlFor={`${idPrefix}-no`}
          className="cursor-pointer font-normal"
        >
          Ne
        </Label>
      </div>
    </RadioGroup>
  )
}

export function AffidavitForm(props: AffidavitFormProps) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    "filling" | "loading" | "completed" | "error"
  >("filling")
  const [resultModal, setResultModal] = React.useState<
    "success" | "error" | null
  >(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<AffidavitSchema>({
    mode: "onChange",
    resolver: zodResolver(affidavitSchema),
    defaultValues: buildDefaultValues(
      props.initialData as Partial<AffidavitSchema> | undefined
    ),
  })

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors },
  } = form

  React.useEffect(() => {
    const subscription = form.watch(() => {
      setResultModal((previous) => (previous === "error" ? null : previous))
    })

    return () => subscription.unsubscribe()
  }, [form])

  const isTruthful = form.watch("isTruthful") as boolean | undefined
  const noExperience = form.watch("noExperience") as boolean
  const hasMilitaryService = form.watch("hasMilitaryService")
  const hasUnpaidLeave = form.watch("hasUnpaidLeave")
  const hasMaternityParental = form.watch("hasMaternityParental")
  const hasContinuousCare = form.watch("hasContinuousCare")
  const hasDisabledChildCare = form.watch("hasDisabledChildCare")
  const hasCloseRelativeCare = form.watch("hasCloseRelativeCare")
  const hasDoctoralStudy = form.watch("hasDoctoralStudy")

  const experienceArray = useFieldArray<AffidavitSchema, "experience">({
    control,
    name: "experience",
  })
  const militaryArray = useFieldArray<AffidavitSchema, "militaryService">({
    control,
    name: "militaryService",
  })
  const maternityArray = useFieldArray<AffidavitSchema, "maternityParental">({
    control,
    name: "maternityParental",
  })
  const continuousArray = useFieldArray<AffidavitSchema, "continuousCare">({
    control,
    name: "continuousCare",
  })
  const disabledArray = useFieldArray<AffidavitSchema, "disabledChildCare">({
    control,
    name: "disabledChildCare",
  })
  const closeRelativeArray = useFieldArray<
    AffidavitSchema,
    "closeRelativeCare"
  >({
    control,
    name: "closeRelativeCare",
  })
  const doctoralArray = useFieldArray<AffidavitSchema, "doctoralStudy">({
    control,
    name: "doctoralStudy",
  })
  const unpaidArray = useFieldArray<AffidavitSchema, "unpaidLeave">({
    control,
    name: "unpaidLeave",
  })

  const isCompleted = status === "completed"
  const isDisabled =
    status === "loading" ||
    (props.mode === "public" && isCompleted) ||
    props.readOnly === true

  const handleInvalid = () => {
    toast({
      title: "Formulář nelze odeslat",
      description:
        "Některá povinná pole nejsou vyplněná nebo obsahují chybu. Zkontrolujte prosím červeně označená pole.",
      variant: "destructive",
    })
  }

  const handleSubmitForm = (values: AffidavitSchema) => {
    startTransition(async () => {
      setStatus("loading")
      try {
        if (props.mode === "public") {
          const res = await fetch(`/api/dokumenty/public/${props.hash}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: props.documentId,
              type: "AFFIDAVIT",
              data: values,
            }),
          })

          if (!res.ok) {
            const response = await res.json().catch(() => null)
            throw new ServerValidationError(
              response?.message || "Uložení se nezdařilo.",
              response?.issues ?? []
            )
          }

          setStatus("completed")
          props.onSubmitted?.()
        } else {
          await props.onSubmitInternal?.(values)
          setStatus("completed")
        }
      } catch (error) {
        console.error(error)
        const message =
          error instanceof Error
            ? error.message
            : "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte Personální oddělení."
        setStatus("filling")
        setErrorMessage(message)
        setResultModal("error")

        if (error instanceof ServerValidationError) {
          for (const issue of error.issues) {
            setError(issue.path.join(".") as never, { message: issue.message })
          }
        }

        toast({
          title: "Chyba při ukládání",
          description: message,
          variant: "destructive",
        })
      }
    })
  }

  return (
    <>
      <Dialog
        open={props.mode === "public" && resultModal === "error"}
        onOpenChange={(open) => !open && setResultModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-red-500" />
              Chyba při ukládání
            </DialogTitle>
            <DialogDescription>
              {errorMessage ??
                "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte své Personální oddělení."}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <form
        onSubmit={handleSubmit(handleSubmitForm, handleInvalid)}
        className="mx-auto w-full max-w-5xl space-y-6"
      >
        <header className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 text-sm text-muted-foreground dark:border-emerald-900 dark:bg-emerald-950/10">
          <div className="flex flex-col items-center gap-6 text-center">
            <h1 className="text-3xl font-semibold text-foreground">
              Čestné prohlášení
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/logo-praha6.svg"
              alt="Městská část Praha 6"
              width={76}
              height={86}
            />
          </div>
          <p>Já, níže podepsaný/á</p>
          <DocumentEmployeeHeader
            fullName={props.employeeMeta?.fullName}
            position={props.employeeMeta?.position}
            unitName={props.employeeMeta?.unitName}
            department={props.employeeMeta?.department}
          />
          <p>čestně prohlašuji,</p>
          <p>
            že beru na vědomí, že Úřad městské části Praha 6 jako zaměstnavatel
            je povinen zařadit zaměstnance do platových stupňů při zařazení do
            platových tříd na základě délky praxe, kvalifikačních předpokladů a
            druhu výkonu práce v souladu s platnými právními předpisy, tj.
            zejména zákonem č.&nbsp;262/2006&nbsp;Sb., zákoník práce, ve znění
            pozdějších předpisů, nařízením vlády č.&nbsp;341/2017&nbsp;Sb., o
            platových poměrech zaměstnanců ve veřejných službách a správě a
            nařízením vlády č.&nbsp;222/2010&nbsp;Sb., o katalogu prací ve
            veřejných službách a správě.
          </p>
          <p>
            V souladu s uvedenými právními předpisy a na základě příkazu
            tajemníka č.&nbsp;3/2025 dále prohlašuji, že všechny níže
            specifikované pracovní činnosti (druh práce), které jsem vykonával/a
            od prvního dne výkonu práce, uvádím pravdivě a úplně za účelem
            správného zařazení do příslušné platové třídy a platového stupně.
          </p>
        </header>

        {Object.keys(errors).length > 0 && (
          <p className="mt-2 text-sm text-destructive">
            Formulář obsahuje nevyplněné nebo chybné údaje. Zkontrolujte prosím
            označené sekce.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Položky označené <span className="text-destructive">*</span> jsou
          povinné.
        </p>

        <section
          className={`space-y-3 rounded-md border p-4 ${!noExperience && errors.experience?.message ? "border-destructive" : ""}`}
        >
          <h2 className="text-lg font-semibold">
            Praxe <span className="text-destructive">*</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            U soustavné činnosti provozované samostatně jako živnost (OSVČ) nebo
            výkonu práce na základě dohody o provedení práce (DPP) nebo dohody o
            pracovní činnosti (DPČ) uveďte prosím i zkratku a rozsah práce –
            např. 10 dnů/měs., denně apod.
          </p>

          <div className="space-y-2">
            <Label>
              Máte již nějakou pracovní zkušenost / praxi?{" "}
              <span className="text-destructive">*</span>
            </Label>
            <YesNoToggle
              idPrefix="has-experience"
              value={noExperience === undefined ? undefined : !noExperience}
              disabled={isDisabled}
              onChange={(next) =>
                setValue("noExperience", !next, { shouldValidate: true })
              }
            />
            <p className="text-xs text-muted-foreground">
              Pokud ještě nemáte žádnou pracovní zkušenost (jste např. čerstvě
              po škole nebo z jiného důvodu), zvolte „Ne“.
            </p>
          </div>

          {!noExperience && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              <svg
                className="size-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Vyplňte prosím všechny dosavadní pracovní zkušenosti.
            </div>
          )}

          {noExperience === true && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
              <svg
                className="size-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Sekce praxe bude přeskočena — formulář lze odeslat bez vyplnění
              pracovních zkušeností.
            </div>
          )}

          {!noExperience && errors.experience?.message && (
            <p className="text-sm text-destructive">
              {errors.experience.message as string}
            </p>
          )}

          {!noExperience &&
            experienceArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="mt-3 space-y-3 rounded-md border p-4"
              >
                <p className="text-sm font-medium">{index + 1}. Zaměstnání</p>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>
                      Zaměstnavatel <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      {...register(`experience.${index}.employer` as const)}
                      placeholder="např. ÚMČ Praha 6"
                      disabled={isDisabled}
                      rows={2}
                    />
                    {errors.experience?.[index]?.employer && (
                      <p className="text-xs text-destructive">
                        {errors.experience[index]?.employer?.message as string}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>
                      Název pracovní pozice{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      {...register(
                        `experience.${index}.jobPositionName` as const
                      )}
                      placeholder="např. referent"
                      disabled={isDisabled}
                      rows={2}
                    />
                    {errors.experience?.[index]?.jobPositionName && (
                      <p className="text-xs text-destructive">
                        {
                          errors.experience[index]?.jobPositionName
                            ?.message as string
                        }
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>
                      Od <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      {...register(`experience.${index}.from` as const)}
                      disabled={isDisabled}
                    />
                    {errors.experience?.[index]?.from && (
                      <p className="text-xs text-destructive">
                        {errors.experience[index]?.from?.message as string}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>
                      Do <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      {...register(`experience.${index}.to` as const)}
                      disabled={isDisabled}
                    />
                    {errors.experience?.[index]?.to && (
                      <p className="text-xs text-destructive">
                        {errors.experience[index]?.to?.message as string}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>
                    Typ výkonu práce <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={
                      form.watch(
                        `experience.${index}.employmentType` as const
                      ) ?? ""
                    }
                    onValueChange={(value) =>
                      setValue(
                        `experience.${index}.employmentType` as const,
                        value as ExperienceEntry["employmentType"],
                        { shouldValidate: true }
                      )
                    }
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Vyberte typ" />
                    </SelectTrigger>
                    <SelectContent>
                      {experienceTypeEnum.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {EXPERIENCE_TYPE_LABELS[opt]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.experience?.[index]?.employmentType && (
                    <p className="text-xs text-destructive">
                      {
                        errors.experience[index]?.employmentType
                          ?.message as string
                      }
                    </p>
                  )}
                  {form.watch(`experience.${index}.employmentType`) ===
                    "OTHER" && (
                    <div className="space-y-1 pt-1">
                      <Input
                        {...register(
                          `experience.${index}.employmentTypeOther` as const
                        )}
                        placeholder="Uveďte typ výkonu práce"
                        disabled={isDisabled}
                      />
                      {errors.experience?.[index]?.employmentTypeOther && (
                        <p className="text-xs text-destructive">
                          {
                            errors.experience[index]?.employmentTypeOther
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 border-t pt-3">
                  <Label>
                    Rozsah pracovního úvazku{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={form.watch(`experience.${index}.workloadType`) ?? ""}
                    onValueChange={(value) =>
                      setValue(
                        `experience.${index}.workloadType` as const,
                        value as ExperienceEntry["workloadType"],
                        { shouldValidate: true }
                      )
                    }
                    className="flex flex-wrap gap-4"
                    disabled={isDisabled}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        id={`workload-full-${index}`}
                        value="FULL"
                      />
                      <Label
                        htmlFor={`workload-full-${index}`}
                        className="font-normal"
                      >
                        Plný úvazek
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        id={`workload-half-${index}`}
                        value="HALF"
                      />
                      <Label
                        htmlFor={`workload-half-${index}`}
                        className="font-normal"
                      >
                        Poloviční úvazek
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        id={`workload-other-${index}`}
                        value="OTHER"
                      />
                      <Label
                        htmlFor={`workload-other-${index}`}
                        className="font-normal"
                      >
                        Jiné
                      </Label>
                    </div>
                  </RadioGroup>
                  {errors.experience?.[index]?.workloadType && (
                    <p className="text-xs text-destructive">
                      {
                        errors.experience[index]?.workloadType
                          ?.message as string
                      }
                    </p>
                  )}
                  {form.watch(`experience.${index}.workloadType`) ===
                    "OTHER" && (
                    <div className="space-y-1 pt-1">
                      <Input
                        {...register(
                          `experience.${index}.workloadOther` as const
                        )}
                        placeholder="Uveďte rozsah úvazku"
                        disabled={isDisabled}
                      />
                      {errors.experience?.[index]?.workloadOther && (
                        <p className="text-xs text-destructive">
                          {
                            errors.experience[index]?.workloadOther
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1 border-t pt-3">
                  <Label>
                    Druh práce <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Popište druh vaší pracovní činnosti.
                  </p>
                  <Textarea
                    {...register(`experience.${index}.jobType` as const)}
                    placeholder="např. administrativní činnost"
                    disabled={isDisabled}
                    rows={3}
                  />
                  {errors.experience?.[index]?.jobType && (
                    <p className="text-xs text-destructive">
                      {errors.experience[index]?.jobType?.message as string}
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  {experienceArray.fields.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => experienceArray.remove(index)}
                      disabled={isDisabled}
                    >
                      Odebrat řádek
                    </Button>
                  )}
                </div>
              </div>
            ))}

          {!noExperience && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                experienceArray.append({
                  employer: "",
                  jobPositionName: "",
                  jobType: "",
                  employmentType: undefined,
                  employmentTypeOther: "",
                  from: "",
                  to: "",
                  workloadType: undefined,
                  workloadOther: "",
                } as ExperienceEntry)
              }
              disabled={isDisabled}
            >
              Přidat další řádek
            </Button>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Doba skutečného čerpání mateřské dovolené, další mateřské dovolené
            nebo rodičovské dovolené
          </h2>
          <p className="text-xs text-muted-foreground">
            včetně doby péče o dítě do 4 let jeho věku za podmínky nároku na
            rodičovský příspěvek, avšak za podmínky, že současně neprobíhala s
            přípravou na povolání v denním/prezenčním studiu.
          </p>

          <YesNoToggle
            idPrefix="has-maternity"
            value={hasMaternityParental}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasMaternityParental", next, { shouldValidate: true })
              if (!next) {
                maternityArray.replace([
                  { childName: "", childBirthDate: "", from: "", to: "" },
                ])
              }
            }}
          />

          {hasMaternityParental && (
            <>
              {errors.maternityParental?.message && (
                <p className="text-sm text-destructive">
                  {errors.maternityParental.message as string}
                </p>
              )}

              {maternityArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Záznam</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Jméno a příjmení dítěte{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(
                          `maternityParental.${idx}.childName` as const
                        )}
                        placeholder="Jméno a příjmení"
                        disabled={isDisabled}
                      />
                      {errors.maternityParental?.[idx]?.childName && (
                        <p className="text-xs text-destructive">
                          {
                            errors.maternityParental[idx]?.childName
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Datum narození dítěte{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(
                          `maternityParental.${idx}.childBirthDate` as const
                        )}
                        disabled={isDisabled}
                      />
                      {errors.maternityParental?.[idx]?.childBirthDate && (
                        <p className="text-xs text-destructive">
                          {
                            errors.maternityParental[idx]?.childBirthDate
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`maternityParental.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.maternityParental?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {
                            errors.maternityParental[idx]?.from
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`maternityParental.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.maternityParental?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.maternityParental[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {maternityArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => maternityArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  maternityArray.append({
                    childName: "",
                    childBirthDate: "",
                    from: "",
                    to: "",
                  })
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Doba trvalé péče o dítě nebo děti
          </h2>
          <p className="text-xs text-muted-foreground">
            pokud tato péče neprobíhala současně s přípravou na povolání v
            denním/prezenčním studiu.
          </p>

          <YesNoToggle
            idPrefix="has-continuous-care"
            value={hasContinuousCare}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasContinuousCare", next, { shouldValidate: true })
              if (!next) {
                continuousArray.replace([
                  { childName: "", childBirthDate: "", from: "", to: "" },
                ])
              }
            }}
          />

          {hasContinuousCare && (
            <>
              {errors.continuousCare?.message && (
                <p className="text-sm text-destructive">
                  {errors.continuousCare.message as string}
                </p>
              )}

              {continuousArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Záznam</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Jméno a příjmení dítěte{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(
                          `continuousCare.${idx}.childName` as const
                        )}
                        placeholder="Jméno a příjmení"
                        disabled={isDisabled}
                      />
                      {errors.continuousCare?.[idx]?.childName && (
                        <p className="text-xs text-destructive">
                          {
                            errors.continuousCare[idx]?.childName
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Datum narození dítěte{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(
                          `continuousCare.${idx}.childBirthDate` as const
                        )}
                        disabled={isDisabled}
                      />
                      {errors.continuousCare?.[idx]?.childBirthDate && (
                        <p className="text-xs text-destructive">
                          {
                            errors.continuousCare[idx]?.childBirthDate
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`continuousCare.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.continuousCare?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {errors.continuousCare[idx]?.from?.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`continuousCare.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.continuousCare?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.continuousCare[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {continuousArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => continuousArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  continuousArray.append({
                    childName: "",
                    childBirthDate: "",
                    from: "",
                    to: "",
                  })
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Doba osobní péče o dlouhodobě těžce zdravotně postižené nezletilé
            dítě
          </h2>
          <p className="text-xs text-muted-foreground">
            které vyžadovalo mimořádnou péči, pokud nebylo umístěno v ústavu pro
            takové děti, pokud tato péče neprobíhala současně s přípravou na
            povolání v denním/prezenčním studiu.
          </p>

          <YesNoToggle
            idPrefix="has-disabled-child-care"
            value={hasDisabledChildCare}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasDisabledChildCare", next, { shouldValidate: true })
              if (!next) {
                disabledArray.replace([
                  { childName: "", childBirthDate: "", from: "", to: "" },
                ])
              }
            }}
          />

          {hasDisabledChildCare && (
            <>
              {errors.disabledChildCare?.message && (
                <p className="text-sm text-destructive">
                  {errors.disabledChildCare.message as string}
                </p>
              )}

              {disabledArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Záznam</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Jméno a příjmení dítěte{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(
                          `disabledChildCare.${idx}.childName` as const
                        )}
                        placeholder="Jméno a příjmení"
                        disabled={isDisabled}
                      />
                      {errors.disabledChildCare?.[idx]?.childName && (
                        <p className="text-xs text-destructive">
                          {
                            errors.disabledChildCare[idx]?.childName
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Datum narození dítěte{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(
                          `disabledChildCare.${idx}.childBirthDate` as const
                        )}
                        disabled={isDisabled}
                      />
                      {errors.disabledChildCare?.[idx]?.childBirthDate && (
                        <p className="text-xs text-destructive">
                          {
                            errors.disabledChildCare[idx]?.childBirthDate
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`disabledChildCare.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.disabledChildCare?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {
                            errors.disabledChildCare[idx]?.from
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`disabledChildCare.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.disabledChildCare?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.disabledChildCare[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {disabledArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => disabledArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  disabledArray.append({
                    childName: "",
                    childBirthDate: "",
                    from: "",
                    to: "",
                  })
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Doba péče o osobu blízkou podle §&nbsp;22 odst.&nbsp;1 občanského
            zákoníku
          </h2>
          <p className="text-xs text-muted-foreground">
            Jde o osobu závislou na pomoci jiné osoby ve stupni III (těžká
            závislost) nebo ve stupni IV (úplná závislost) podle §&nbsp;8 zákona
            č.&nbsp;108/2006&nbsp;Sb., o sociálních službách, ve znění
            pozdějších předpisů (zákon č.&nbsp;89/2012&nbsp;Sb., občanský
            zákoník, ve znění pozdějších předpisů).
          </p>

          <YesNoToggle
            idPrefix="has-close-relative-care"
            value={hasCloseRelativeCare}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasCloseRelativeCare", next, { shouldValidate: true })
              if (!next) {
                closeRelativeArray.replace([
                  {
                    personName: "",
                    dependencyLevel: undefined,
                    from: "",
                    to: "",
                  },
                ])
              }
            }}
          />

          {hasCloseRelativeCare && (
            <>
              {errors.closeRelativeCare?.message && (
                <p className="text-sm text-destructive">
                  {errors.closeRelativeCare.message as string}
                </p>
              )}

              {closeRelativeArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Záznam</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Jméno a příjmení osoby{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(
                          `closeRelativeCare.${idx}.personName` as const
                        )}
                        placeholder="Jméno a příjmení"
                        disabled={isDisabled}
                      />
                      {errors.closeRelativeCare?.[idx]?.personName && (
                        <p className="text-xs text-destructive">
                          {
                            errors.closeRelativeCare[idx]?.personName
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Stupeň závislosti{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={
                          form.watch(
                            `closeRelativeCare.${idx}.dependencyLevel` as const
                          ) ?? ""
                        }
                        onValueChange={(value) =>
                          setValue(
                            `closeRelativeCare.${idx}.dependencyLevel` as const,
                            value as CloseRelativeCareEntry["dependencyLevel"],
                            { shouldValidate: true }
                          )
                        }
                        disabled={isDisabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Vyberte stupeň" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="III">
                            III – těžká závislost
                          </SelectItem>
                          <SelectItem value="IV">
                            IV – úplná závislost
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.closeRelativeCare?.[idx]?.dependencyLevel && (
                        <p className="text-xs text-destructive">
                          {
                            errors.closeRelativeCare[idx]?.dependencyLevel
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`closeRelativeCare.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.closeRelativeCare?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {
                            errors.closeRelativeCare[idx]?.from
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`closeRelativeCare.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.closeRelativeCare?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.closeRelativeCare[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {closeRelativeArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => closeRelativeArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  closeRelativeArray.append({
                    personName: "",
                    dependencyLevel: undefined,
                    from: "",
                    to: "",
                  } as CloseRelativeCareEntry)
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Pracovní volno bez náhrady platu/mzdy
          </h2>
          <p className="text-xs text-muted-foreground">
            např. následování manžela do ciziny, péče o dítě bez nároku na
            příspěvek.
          </p>

          <YesNoToggle
            idPrefix="has-unpaid-leave"
            value={hasUnpaidLeave}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasUnpaidLeave", next, { shouldValidate: true })
              if (!next) {
                unpaidArray.replace([{ reason: "", from: "", to: "" }])
              }
            }}
          />

          {hasUnpaidLeave && (
            <>
              {errors.unpaidLeave?.message && (
                <p className="text-sm text-destructive">
                  {errors.unpaidLeave.message as string}
                </p>
              )}

              {unpaidArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Případ</p>

                  <div className="space-y-1">
                    <Label>
                      Důvod <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...register(`unpaidLeave.${idx}.reason` as const)}
                      placeholder="Důvod"
                      disabled={isDisabled}
                    />
                    {errors.unpaidLeave?.[idx]?.reason && (
                      <p className="text-xs text-destructive">
                        {errors.unpaidLeave[idx]?.reason?.message as string}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`unpaidLeave.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.unpaidLeave?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {errors.unpaidLeave[idx]?.from?.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`unpaidLeave.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.unpaidLeave?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.unpaidLeave[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {unpaidArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => unpaidArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  unpaidArray.append({ reason: "", from: "", to: "" })
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Výkon vojenské základní (náhradní) služby nebo civilní služby
          </h2>
          <p className="text-xs text-muted-foreground">
            Jde o dobu podle §&nbsp;4 odst.&nbsp;4 nařízení vlády
            č.&nbsp;341/2017&nbsp;Sb.
          </p>

          <YesNoToggle
            idPrefix="has-military"
            value={hasMilitaryService}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasMilitaryService", next, { shouldValidate: true })
              if (!next) {
                militaryArray.replace([
                  { service: undefined, from: "", to: "" },
                ])
              }
            }}
          />

          {hasMilitaryService && (
            <>
              {errors.militaryService?.message && (
                <p className="text-sm text-destructive">
                  {errors.militaryService.message as string}
                </p>
              )}

              {militaryArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Služba</p>

                  <div className="space-y-1">
                    <Label>
                      Druh služby <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={
                        form.watch(`militaryService.${idx}.service` as const) ??
                        ""
                      }
                      onValueChange={(value) =>
                        setValue(
                          `militaryService.${idx}.service` as const,
                          value as MilitaryEntry["service"],
                          { shouldValidate: true }
                        )
                      }
                      disabled={isDisabled}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Vyberte druh služby" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BASIC">základní</SelectItem>
                        <SelectItem value="ALTERNATIVE">náhradní</SelectItem>
                        <SelectItem value="CIVIL">civilní</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.militaryService?.[idx]?.service && (
                      <p className="text-xs text-destructive">
                        {
                          errors.militaryService[idx]?.service
                            ?.message as string
                        }
                      </p>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`militaryService.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.militaryService?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {errors.militaryService[idx]?.from?.message as string}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`militaryService.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.militaryService?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.militaryService[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {militaryArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => militaryArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  militaryArray.append({
                    service: undefined,
                    from: "",
                    to: "",
                  } as MilitaryEntry)
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            Doba řádně ukončeného studia v doktorském studijním programu podle
            §&nbsp;47 zákona o vysokých školách
          </h2>
          <p className="text-xs text-muted-foreground">
            Jde o studium podle zákona č.&nbsp;111/1998&nbsp;Sb., o vysokých
            školách a o změně a doplnění dalších zákonů, ve znění pozdějších
            předpisů.
          </p>

          <YesNoToggle
            idPrefix="has-doctoral-study"
            value={hasDoctoralStudy}
            disabled={isDisabled}
            onChange={(next) => {
              setValue("hasDoctoralStudy", next, { shouldValidate: true })
              if (!next) {
                doctoralArray.replace([
                  { schoolName: "", studyProgram: "", from: "", to: "" },
                ])
              }
            }}
          />

          {hasDoctoralStudy && (
            <>
              {errors.doctoralStudy?.message && (
                <p className="text-sm text-destructive">
                  {errors.doctoralStudy.message as string}
                </p>
              )}

              {doctoralArray.fields.map((field, idx) => (
                <div
                  key={field.id}
                  className="mt-3 space-y-3 rounded-md border p-4"
                >
                  <p className="text-sm font-medium">{idx + 1}. Studium</p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Název vysoké školy{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(
                          `doctoralStudy.${idx}.schoolName` as const
                        )}
                        placeholder="např. Vysoká škola ekonomická v Praha"
                        disabled={isDisabled}
                      />
                      {errors.doctoralStudy?.[idx]?.schoolName && (
                        <p className="text-xs text-destructive">
                          {
                            errors.doctoralStudy[idx]?.schoolName
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Studijní program{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(
                          `doctoralStudy.${idx}.studyProgram` as const
                        )}
                        placeholder="např. Ekonomická teorie"
                        disabled={isDisabled}
                      />
                      {errors.doctoralStudy?.[idx]?.studyProgram && (
                        <p className="text-xs text-destructive">
                          {
                            errors.doctoralStudy[idx]?.studyProgram
                              ?.message as string
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Od <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`doctoralStudy.${idx}.from` as const)}
                        disabled={isDisabled}
                      />
                      {errors.doctoralStudy?.[idx]?.from && (
                        <p className="text-xs text-destructive">
                          {errors.doctoralStudy[idx]?.from?.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Do <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="date"
                        {...register(`doctoralStudy.${idx}.to` as const)}
                        disabled={isDisabled}
                      />
                      {errors.doctoralStudy?.[idx]?.to && (
                        <p className="text-xs text-destructive">
                          {errors.doctoralStudy[idx]?.to?.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {doctoralArray.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => doctoralArray.remove(idx)}
                        disabled={isDisabled}
                      >
                        Odebrat záznam
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  doctoralArray.append({
                    schoolName: "",
                    studyProgram: "",
                    from: "",
                    to: "",
                  } as DoctoralStudyEntry)
                }
                disabled={isDisabled}
              >
                Přidat záznam
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3 rounded-md border-l-4 border-l-[#00847C] p-4">
          <h2 className="text-lg font-semibold">Čestné prohlášení</h2>
          <p className="text-sm font-semibold text-foreground">
            Čestně prohlašuji, že mnou uvedené údaje jsou pravdivé. Jsem si plně
            vědom(a), že budou použity pro zápočet doby rozhodné pro zařazení do
            plat. stupně při zařazení do platové třídy, tzn. pro stanovení
            platového tarifu. Rovněž jsem si plně vědom(a), že nepravdivé údaje
            budou mít za následek mé bezdůvodné obohacení a zaměstnavatel bude
            žádat vrácení neprávem takto vyplacených finančních prostředků.
          </p>

          <div className="mt-3 space-y-2">
            <Label>
              Čestně prohlašuji, že mnou uvedené údaje jsou pravdivé.{" "}
              <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                isTruthful === true ? "yes" : isTruthful === false ? "no" : ""
              }
              onValueChange={(value) =>
                setValue("isTruthful", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex flex-col gap-2"
              disabled={isDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="truth-yes" value="yes" />
                <Label htmlFor="truth-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="truth-no" value="no" />
                <Label htmlFor="truth-no">Ne</Label>
              </div>
            </RadioGroup>
            {errors.isTruthful && (
              <p className="text-xs text-destructive">
                {errors.isTruthful.message as string}
              </p>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            disabled={isPending || isDisabled}
            className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
          >
            {status === "loading" && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {status === "loading"
              ? props.mode === "public"
                ? "Odesílám…"
                : "Ukládám…"
              : props.mode === "public"
                ? "Odeslat čestné prohlášení"
                : "Uložit úpravy"}
          </Button>
        </div>
      </form>
    </>
  )
}
