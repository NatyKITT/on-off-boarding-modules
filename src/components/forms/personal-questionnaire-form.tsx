"use client"

import * as React from "react"
import { useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, PlusCircle, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import {
  EDUCATION_LEVEL_OPTIONS,
  STUDY_FORM_OPTIONS,
} from "@/types/education-options"
import {
  CZECH_CITIZENSHIP_VALUE,
  NATIONALITY_OPTIONS,
  OTHER_CITIZENSHIP_VALUE,
} from "@/types/nationality-options"
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRY_CODE_OPTIONS,
} from "@/types/phone-country-codes"

import { useToast } from "@/hooks/use-toast"
import { EmployeeMeta } from "@/lib/employee-meta"
import type { PrefillSuggestion } from "@/lib/employment-document-prefill"
import { getPrefillDisplayLabels } from "@/lib/employment-document-shared-fields"
import { ServerValidationError } from "@/lib/server-validation-error"
import {
  DRIVER_LICENSE_CATEGORIES,
  DRIVER_LICENSE_CATEGORY_LABELS,
  languageLevelEnum,
  personalQuestionnaireSchema,
  type PersonalQuestionnaireSchema,
} from "@/lib/validations/employment-documents"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { DocumentEmployeeHeader } from "@/components/common/document-employee-header"
import { DocumentPrefillBanner } from "@/components/forms/document-prefill-banner"

type PersonalQuestionnaireBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
  employeeMeta?: EmployeeMeta
  prefillSuggestion?: PrefillSuggestion | null
}

type PersonalQuestionnairePublicProps = PersonalQuestionnaireBaseProps & {
  mode: "public"
  hash: string
  onSubmitted?: () => void
  onSubmitInternal?: never
}

type PersonalQuestionnaireInternalProps = PersonalQuestionnaireBaseProps & {
  mode: "internal"
  hash?: never
  onSubmitted?: never
  onSubmitInternal?: (data: PersonalQuestionnaireSchema) => Promise<void> | void
}

export type PersonalQuestionnaireFormProps =
  | PersonalQuestionnairePublicProps
  | PersonalQuestionnaireInternalProps

type EducationEntry = PersonalQuestionnaireSchema["education"][number]

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

function buildBaseDefaultValues(
  employeeMeta?: EmployeeMeta
): Partial<PersonalQuestionnaireSchema> {
  return {
    firstName: employeeMeta?.firstName ?? "",
    lastName: employeeMeta?.lastName ?? "",
    birthSurnameDiffers: undefined,
    birthSurname: "",
    titleBefore: employeeMeta?.titleBefore ?? "",
    titleAfter: employeeMeta?.titleAfter ?? "",
    academicDegrees: "",
    maritalStatus: "SINGLE",
    birthDate: "",
    birthNumber: "",
    birthPlace: "",
    birthDistrict: "",
    birthState: "",
    birthStateOther: "",
    citizenship: "",
    citizenshipOther: "",
    foreignPermitFrom: "",
    foreignPermitAuthority: "",
    foreignPermitTo: "",
    dataBoxDelivery: undefined,
    dataBoxId: "",
    permanentStreet: "",
    permanentHouseNumber: "",
    permanentCity: "",
    permanentPostcode: "",
    useDifferentMailingAddress: undefined,
    correspondenceStreet: "",
    correspondenceHouseNumber: "",
    correspondenceCity: "",
    correspondencePostcode: "",
    email: "",
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    phone: "",
    hasDriverLicense: undefined,
    driverLicenseCategories: [],
    maintenanceContactName: "",
    maintenancePhoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    maintenancePhone: "",
    isDisabledPerson: undefined,
    receivesPensionBenefits: undefined,
    typePensionBenefits: "",
    disabilityDegree: "NONE",
    hasCertificateManagement: undefined,
    hasCertificateSpecial: undefined,
    certificateSpecialNames: [],
    hasCertificateTraining: undefined,
    hasCertificateGeneral: undefined,
    languages: [
      { name: "Angličtina" },
    ] as PersonalQuestionnaireSchema["languages"],
    education: [
      {
        level: "ZAKLADNI",
        schoolType: "",
        semesters: "",
        studyForm: "DENNI",
        graduationYear: "",
        examType: "",
        degreeTitle: "",
        studyStatus: "COMPLETED",
      },
    ],
    hasFamilyRelations: undefined,
    familyRelations: "",
    finalReadAndUnderstood: undefined,
    finalTruthfulnessConfirm: undefined,
  }
}

export function PersonalQuestionnaireForm(
  props: PersonalQuestionnaireFormProps
) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    "filling" | "loading" | "completed" | "error"
  >("filling")
  const [resultModal, setResultModal] = React.useState<
    "success" | "error" | null
  >(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<PersonalQuestionnaireSchema>({
    mode: "onChange",
    resolver: zodResolver(personalQuestionnaireSchema),
    defaultValues: {
      ...buildBaseDefaultValues(props.employeeMeta),
      ...(props.initialData as
        | Partial<PersonalQuestionnaireSchema>
        | undefined),
    },
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = form

  const [prefillResolved, setPrefillResolved] = React.useState(false)

  function handleAcceptPrefill() {
    if (!props.prefillSuggestion) return

    for (const [key, value] of Object.entries(props.prefillSuggestion.data)) {
      setValue(key as keyof PersonalQuestionnaireSchema, value as never, {
        shouldValidate: true,
        shouldDirty: true,
      })
    }

    setPrefillResolved(true)
  }

  React.useEffect(() => {
    const subscription = watch(() => {
      setResultModal((previous) => (previous === "error" ? null : previous))
    })

    return () => subscription.unsubscribe()
  }, [watch])

  const maritalStatus = watch("maritalStatus")
  const isDisabledPerson = watch("isDisabledPerson") as boolean | undefined
  const languages = watch("languages") ?? []

  const birthSurnameDiffers = watch("birthSurnameDiffers") as
    | boolean
    | undefined
  const citizenship = watch("citizenship")
  const isForeignCitizenship = Boolean(
    citizenship && citizenship !== CZECH_CITIZENSHIP_VALUE
  )
  const birthState = watch("birthState")

  const dataBoxDelivery = watch("dataBoxDelivery") as boolean | undefined
  const useDifferentMailingAddress = watch("useDifferentMailingAddress") as
    | boolean
    | undefined

  const hasDriverLicense = watch("hasDriverLicense") as boolean | undefined
  const driverLicenseCategories = watch("driverLicenseCategories") ?? []

  const receivesPensionBenefits = watch("receivesPensionBenefits") as
    | boolean
    | undefined
  const hasCertificateManagement = watch("hasCertificateManagement") as
    | boolean
    | undefined
  const hasCertificateSpecial = watch("hasCertificateSpecial") as
    | boolean
    | undefined
  const hasCertificateTraining = watch("hasCertificateTraining") as
    | boolean
    | undefined
  const hasCertificateGeneral = watch("hasCertificateGeneral") as
    | boolean
    | undefined
  const finalReadAndUnderstood = watch("finalReadAndUnderstood") as
    | boolean
    | undefined
  const finalTruthfulnessConfirm = watch("finalTruthfulnessConfirm") as
    | boolean
    | undefined
  const hasFamilyRelations = watch("hasFamilyRelations") as boolean | undefined

  const isCompleted = status === "completed"
  const isFormDisabled =
    status === "loading" ||
    (props.mode === "public" && isCompleted) ||
    props.readOnly === true

  const {
    fields: educationFields,
    append: appendEducation,
    remove: removeEducation,
  } = useFieldArray<PersonalQuestionnaireSchema, "education">({
    control,
    name: "education",
  })

  const {
    fields: certificateSpecialFields,
    append: appendCertificateSpecial,
    remove: removeCertificateSpecial,
  } = useFieldArray<PersonalQuestionnaireSchema, "certificateSpecialNames">({
    control,
    name: "certificateSpecialNames",
  })

  const toggleDriverLicenseCategory = (category: string) => {
    const next = driverLicenseCategories.includes(category)
      ? driverLicenseCategories.filter((c) => c !== category)
      : [...driverLicenseCategories, category]
    setValue("driverLicenseCategories", next, { shouldValidate: true })
  }

  const handleInvalid = () => {
    toast({
      title: "Formulář nelze odeslat",
      description:
        "Některá povinná pole nejsou vyplněná nebo obsahují chybu. Zkontrolujte prosím červeně označená pole.",
      variant: "destructive",
    })
  }

  const handleSubmitForm = (values: PersonalQuestionnaireSchema) => {
    startTransition(async () => {
      setStatus("loading")
      try {
        if (props.mode === "public") {
          const res = await fetch(`/api/dokumenty/public/${props.hash}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: props.documentId,
              type: "PERSONAL_QUESTIONNAIRE",
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
              Osobní dotazník
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/logo-praha6.svg"
              alt="Městská část Praha 6"
              width={76}
              height={86}
            />
          </div>

          <DocumentEmployeeHeader
            fullName={props.employeeMeta?.fullName}
            position={props.employeeMeta?.position}
            unitName={props.employeeMeta?.unitName}
            department={props.employeeMeta?.department}
          />

          {Object.keys(errors).length > 0 && (
            <p className="mt-2 text-sm text-destructive">
              Formulář obsahuje nevyplněné nebo chybné údaje. Zkontrolujte
              prosím označené sekce.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Položky označené <span className="text-destructive">*</span> jsou
            povinné.
          </p>
        </header>

        {props.prefillSuggestion && !prefillResolved && !isFormDisabled && (
          <DocumentPrefillBanner
            sourceLabel={props.prefillSuggestion.sourceLabel}
            fieldLabels={getPrefillDisplayLabels(props.prefillSuggestion.data)}
            onAccept={handleAcceptPrefill}
            onDismiss={() => setPrefillResolved(true)}
          />
        )}

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">A. Základní údaje</h2>
          <p className="text-xs text-muted-foreground">
            Základní identifikační údaje zaměstnankyně/zaměstnance
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                Křestní jméno <span className="text-destructive">*</span>
              </Label>
              <Input {...register("firstName")} disabled={isFormDisabled} />
              {errors.firstName && (
                <p className="text-xs text-destructive">
                  {errors.firstName.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Příjmení <span className="text-destructive">*</span>
              </Label>
              <Input {...register("lastName")} disabled={isFormDisabled} />
              {errors.lastName && (
                <p className="text-xs text-destructive">
                  {errors.lastName.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Liší se Vaše rodné příjmení od současného?{" "}
              <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Pokud ano, uveďte prosím níže i své rodné příjmení.
            </p>
            <YesNoToggle
              idPrefix="birth-surname-differs"
              value={birthSurnameDiffers}
              disabled={isFormDisabled}
              onChange={(next) =>
                setValue("birthSurnameDiffers", next, {
                  shouldValidate: true,
                })
              }
            />
            {errors.birthSurnameDiffers && (
              <p className="text-xs text-destructive">
                {errors.birthSurnameDiffers.message as string}
              </p>
            )}

            {birthSurnameDiffers === true && (
              <div className="space-y-1 pt-1">
                <Label>
                  Rodné příjmení <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...register("birthSurname")}
                  disabled={isFormDisabled}
                />
                {errors.birthSurname && (
                  <p className="text-xs text-destructive">
                    {errors.birthSurname.message as string}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 pt-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Titul před jménem</Label>
              <Input {...register("titleBefore")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>Titul za jménem</Label>
              <Input {...register("titleAfter")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Vědecká hodnost</Label>
              <Input
                {...register("academicDegrees")}
                disabled={isFormDisabled}
              />
            </div>
          </div>

          <div className="my-3 space-y-3 border-y py-4">
            <Label>
              Rodinný stav <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Vyplňte dle skutečnosti. Pokud nechcete uvádět, ponechte možnost
              „Neuvádím“.
            </p>
            <RadioGroup
              value={maritalStatus}
              onValueChange={(value) =>
                setValue(
                  "maritalStatus",
                  value as PersonalQuestionnaireSchema["maritalStatus"],
                  {
                    shouldValidate: true,
                  }
                )
              }
              className="flex flex-wrap gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ms-single" value="SINGLE" />
                <Label htmlFor="ms-single">Svobodný/á</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ms-married" value="MARRIED" />
                <Label htmlFor="ms-married">Vdaná / ženatý</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ms-div" value="DIVORCED" />
                <Label htmlFor="ms-div">Rozvedený/á</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ms-wid" value="WIDOWED" />
                <Label htmlFor="ms-wid">Vdova / vdovec</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ms-reg" value="REGISTERED" />
                <Label htmlFor="ms-reg">Registrované partnerství</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ms-na" value="UNSTATED" />
                <Label htmlFor="ms-na">Neuvádím</Label>
              </div>
            </RadioGroup>
            {errors.maritalStatus && (
              <p className="text-xs text-destructive">
                {errors.maritalStatus.message as string}
              </p>
            )}
          </div>

          <div className="grid gap-3 pt-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                Den, měsíc a rok narození{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                {...register("birthDate")}
                disabled={isFormDisabled}
              />
              {errors.birthDate && (
                <p className="text-xs text-destructive">
                  {errors.birthDate.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Rodné číslo</Label>
              <Input {...register("birthNumber")} disabled={isFormDisabled} />
              <p className="text-xs text-muted-foreground">
                Pokud nemáte rodné číslo (např. jste cizinec/cizinka), ponechte
                pole prázdné.
              </p>
            </div>
            <div className="space-y-1">
              <Label>
                Místo narození <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthPlace")} disabled={isFormDisabled} />
              {errors.birthPlace && (
                <p className="text-xs text-destructive">
                  {errors.birthPlace.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Okres narození <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthDistrict")} disabled={isFormDisabled} />
              {errors.birthDistrict && (
                <p className="text-xs text-destructive">
                  {errors.birthDistrict.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Stát narození <span className="text-destructive">*</span>
              </Label>
              <Select
                value={birthState || ""}
                onValueChange={(value) =>
                  setValue("birthState", value, { shouldValidate: true })
                }
                disabled={isFormDisabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte stát narození" />
                </SelectTrigger>
                <SelectContent>
                  {NATIONALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.birthState && (
                <p className="text-xs text-destructive">
                  {errors.birthState.message as string}
                </p>
              )}
              {birthState === OTHER_CITIZENSHIP_VALUE && (
                <div className="space-y-1 pt-1">
                  <Input
                    {...register("birthStateOther")}
                    placeholder="Vypište stát narození"
                    disabled={isFormDisabled}
                  />
                  {errors.birthStateOther && (
                    <p className="text-xs text-destructive">
                      {errors.birthStateOther.message as string}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Státní občanství <span className="text-destructive">*</span>
              </Label>
              <Select
                value={citizenship || ""}
                onValueChange={(value) =>
                  setValue("citizenship", value, { shouldValidate: true })
                }
                disabled={isFormDisabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte státní občanství" />
                </SelectTrigger>
                <SelectContent>
                  {NATIONALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.citizenship && (
                <p className="text-xs text-destructive">
                  {errors.citizenship.message as string}
                </p>
              )}
              {citizenship === OTHER_CITIZENSHIP_VALUE && (
                <div className="space-y-1 pt-1">
                  <Input
                    {...register("citizenshipOther")}
                    placeholder="Vypište státní občanství"
                    disabled={isFormDisabled}
                  />
                  {errors.citizenshipOther && (
                    <p className="text-xs text-destructive">
                      {errors.citizenshipOther.message as string}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {isForeignCitizenship && (
            <Card className="border-l-4 border-l-amber-400">
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Povolení k pobytu (cizí státní příslušníci)
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Vzhledem k uvedenému státnímu občanství je tento údaj povinný.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>
                    Povolení k pobytu vydáno dne{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    {...register("foreignPermitFrom")}
                    disabled={isFormDisabled}
                  />
                  {errors.foreignPermitFrom && (
                    <p className="text-xs text-destructive">
                      {errors.foreignPermitFrom.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>
                    Povolení k pobytu vydáno kým (název orgánu){" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("foreignPermitAuthority")}
                    disabled={isFormDisabled}
                  />
                  {errors.foreignPermitAuthority && (
                    <p className="text-xs text-destructive">
                      {errors.foreignPermitAuthority.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>
                    Povolení k pobytu vydáno do{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    {...register("foreignPermitTo")}
                    disabled={isFormDisabled}
                  />
                  {errors.foreignPermitTo && (
                    <p className="text-xs text-destructive">
                      {errors.foreignPermitTo.message as string}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">B. Kontaktní údaje</h2>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Datová schránka
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>
                Jsem vlastníkem datové schránky{" "}
                <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Prohlašuji, že se jedná o moji datovou schránku fyzické osoby a
                datová schránka není pro doručování znepřístupněna.
              </p>
              <YesNoToggle
                idPrefix="databox"
                value={dataBoxDelivery}
                disabled={isFormDisabled}
                onChange={(next) =>
                  setValue("dataBoxDelivery", next, { shouldValidate: true })
                }
              />
              {errors.dataBoxDelivery && (
                <p className="text-xs text-destructive">
                  {errors.dataBoxDelivery.message as string}
                </p>
              )}

              {dataBoxDelivery === true && (
                <div className="space-y-1 pt-1">
                  <Label>
                    ID datové schránky{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("dataBoxId")}
                    disabled={isFormDisabled}
                    placeholder="Uveďte ID vaší datové schránky"
                  />
                  {errors.dataBoxId && (
                    <p className="text-xs text-destructive">
                      {errors.dataBoxId.message as string}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Adresa trvalého pobytu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>
                    Ulice <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("permanentStreet")}
                    disabled={isFormDisabled}
                  />
                  {errors.permanentStreet && (
                    <p className="text-xs text-destructive">
                      {errors.permanentStreet.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>
                    Číslo popisné / orientační{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("permanentHouseNumber")}
                    disabled={isFormDisabled}
                  />
                  {errors.permanentHouseNumber && (
                    <p className="text-xs text-destructive">
                      {errors.permanentHouseNumber.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>
                    Obec / část obce <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("permanentCity")}
                    disabled={isFormDisabled}
                  />
                  {errors.permanentCity && (
                    <p className="text-xs text-destructive">
                      {errors.permanentCity.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>
                    PSČ <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("permanentPostcode")}
                    disabled={isFormDisabled}
                  />
                  {errors.permanentPostcode && (
                    <p className="text-xs text-destructive">
                      {errors.permanentPostcode.message as string}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-medium">Doručovací adresa</Label>
                <RadioGroup
                  value={
                    useDifferentMailingAddress === true
                      ? "different"
                      : useDifferentMailingAddress === false
                        ? "same"
                        : ""
                  }
                  onValueChange={(value) =>
                    setValue(
                      "useDifferentMailingAddress",
                      value === "different",
                      { shouldValidate: true }
                    )
                  }
                  className="flex flex-col gap-2"
                  disabled={isFormDisabled}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="mailing-same" value="same" />
                    <Label htmlFor="mailing-same" className="font-normal">
                      Shodná jako adresa trvalého pobytu
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="mailing-different" value="different" />
                    <Label htmlFor="mailing-different" className="font-normal">
                      Jiná než adresa trvalého pobytu
                    </Label>
                  </div>
                </RadioGroup>
                {errors.useDifferentMailingAddress && (
                  <p className="text-xs text-destructive">
                    {errors.useDifferentMailingAddress.message as string}
                  </p>
                )}
              </div>

              {useDifferentMailingAddress === true && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Cizí státní příslušník uvede adresu pobytu na území ČR.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>
                        Ulice <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register("correspondenceStreet")}
                        disabled={isFormDisabled}
                      />
                      {errors.correspondenceStreet && (
                        <p className="text-xs text-destructive">
                          {errors.correspondenceStreet.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Číslo popisné / orientační{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register("correspondenceHouseNumber")}
                        disabled={isFormDisabled}
                      />
                      {errors.correspondenceHouseNumber && (
                        <p className="text-xs text-destructive">
                          {errors.correspondenceHouseNumber.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Obec / část obce{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register("correspondenceCity")}
                        disabled={isFormDisabled}
                      />
                      {errors.correspondenceCity && (
                        <p className="text-xs text-destructive">
                          {errors.correspondenceCity.message as string}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>
                        PSČ <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register("correspondencePostcode")}
                        disabled={isFormDisabled}
                      />
                      {errors.correspondencePostcode && (
                        <p className="text-xs text-destructive">
                          {errors.correspondencePostcode.message as string}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                E-mail a telefon
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>
                  E-mail <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  {...register("email")}
                  disabled={isFormDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Zadejte osobní e-mail, který chcete využívat pro komunikaci.
                </p>
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message as string}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Telefon (dobrovolný údaj)</Label>
                <div className="grid grid-cols-[minmax(0,110px)_1fr] gap-2">
                  <Select
                    value={
                      watch("phoneCountryCode") || DEFAULT_PHONE_COUNTRY_CODE
                    }
                    onValueChange={(value) =>
                      setValue("phoneCountryCode", value, {
                        shouldValidate: true,
                      })
                    }
                    disabled={isFormDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Předvolba" />
                    </SelectTrigger>
                    <SelectContent>
                      {PHONE_COUNTRY_CODE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input {...register("phone")} disabled={isFormDisabled} />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">C. Vzdělání a znalosti</h2>

          <div className="space-y-3">
            <div className="space-y-1 pb-2">
              <h3 className="text-base font-semibold">Vzdělání</h3>
              <p className="text-xs text-muted-foreground">
                Uveďte prosím všechna dosažená vysokoškolská vzdělání (jsou
                potřeba pro uznání praxe) a rovněž případné aktuálně probíhající
                studium. V případě potřeby přidejte další řádky. U posledního
                (nejvyššího) vzdělání je nutné vyplnit všechny údaje.
              </p>
            </div>
            <div className="space-y-3 rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="font-medium">Vysvětlivky k formám studia:</p>

              <div className="space-y-1">
                <p className="font-medium">Základní vzdělání</p>
                <p>Základní vzdělání se uskutečňuje v denní formě studia.</p>
              </div>

              <div className="space-y-1">
                <p className="font-medium">Střední a vyšší odborné vzdělání</p>
                <p>
                  Střední a vyšší odborné vzdělání se uskutečňuje v denní,
                  večerní, dálkové, distanční a kombinované formě:
                </p>
                <ul className="ml-4 list-[lower-alpha] space-y-1">
                  <li>
                    <strong>denní formou</strong> – výuka organizovaná
                    pravidelně každý den v pětidenním vyučovacím týdnu v průběhu
                    školního roku,
                  </li>
                  <li>
                    <strong>večerní formou</strong> – výuka organizovaná
                    pravidelně několikrát v týdnu v rozsahu 10 až 18 hodin týdně
                    v průběhu školního roku zpravidla v odpoledních a večerních
                    hodinách,
                  </li>
                  <li>
                    <strong>dálkovou formou</strong> – samostatné studium
                    spojené s konzultacemi ve školním roce,
                  </li>
                  <li>
                    <strong>distanční formou</strong> – samostatné studium
                    uskutečňované převážně nebo zcela prostřednictvím
                    informačních technologií, popřípadě spojené s individuálními
                    konzultacemi,
                  </li>
                  <li>
                    <strong>kombinovanou formou</strong> – střídání denní a jiné
                    formy vzdělávání stanovené zákonem.
                  </li>
                </ul>
              </div>

              <div className="space-y-1">
                <p className="font-medium">Vysokoškolské vzdělání</p>
                <p>
                  Vysokoškolské vzdělání se uskutečňuje formou výuky – studium
                  prezenční, distanční nebo jejich kombinací:
                </p>
                <ul className="ml-4 list-[lower-alpha] space-y-1">
                  <li>
                    <strong>prezenční (denní)</strong> – výuka probíhá
                    kterýkoliv den, dopoledne i odpoledne; převážná část je
                    organizována formou přednášek, laboratorních prací a dalších
                    cvičení, seminářů, kurzů, praxí a dalších forem. Během výuky
                    je student v přímém kontaktu s učitelem a své poznatky
                    získává přímo.
                  </li>
                  <li>
                    <strong>distanční studium</strong> – multimediální forma
                    řízeného studia, v němž jsou vyučující a konzultanti v
                    průběhu vzdělávání trvale nebo převážně odděleni od
                    vzdělávaných.
                  </li>
                  <li>
                    <strong>kombinované</strong> – výuka probíhá obvykle o
                    víkendech nebo pátcích a sobotách, jednou za 14 dní nebo
                    jednou za měsíc. Vyučující probere pouze stěžejní část
                    látky, zbytek zůstává na samostudium; studenti jsou
                    upozorněni na odbornou literaturu a dostávají samostatné
                    úkoly. Systém může být doplněn o prvky distančního studia,
                    např. e-learning či konzultace s vyučujícími.
                  </li>
                </ul>
              </div>
            </div>

            {educationFields.map((field, index) => (
              <div
                key={field.id}
                className="mt-3 space-y-3 rounded-md border p-4"
              >
                <p className="text-sm font-medium">{index + 1}. Vzdělání</p>

                <div className="space-y-1">
                  <Label>
                    Stupeň <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={watch(`education.${index}.level`)}
                    onValueChange={(val) =>
                      setValue(
                        `education.${index}.level`,
                        val as EducationEntry["level"],
                        {
                          shouldValidate: true,
                        }
                      )
                    }
                    disabled={isFormDisabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vyberte stupeň" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDUCATION_LEVEL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.education?.[index]?.level && (
                    <p className="text-xs text-destructive">
                      {errors.education[index]?.level?.message as string}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>
                    Druh školy, výchovy, obor{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register(`education.${index}.schoolType` as const)}
                    placeholder="např. gymnázium, sociální práce…"
                    disabled={isFormDisabled}
                  />
                  {errors.education?.[index]?.schoolType && (
                    <p className="text-xs text-destructive">
                      {errors.education[index]?.schoolType?.message as string}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>
                      Počet tříd (semestrů){" "}
                      {index === educationFields.length - 1 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <Input
                      {...register(`education.${index}.semesters` as const)}
                      placeholder="např. 4"
                      disabled={isFormDisabled}
                    />
                    {errors.education?.[index]?.semesters && (
                      <p className="text-xs text-destructive">
                        {errors.education[index]?.semesters?.message as string}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>
                      Forma studia <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={watch(`education.${index}.studyForm`)}
                      onValueChange={(val) =>
                        setValue(
                          `education.${index}.studyForm`,
                          val as EducationEntry["studyForm"],
                          {
                            shouldValidate: true,
                          }
                        )
                      }
                      disabled={isFormDisabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Vyberte formu" />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDY_FORM_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.education?.[index]?.studyForm && (
                      <p className="text-xs text-destructive">
                        {errors.education[index]?.studyForm?.message as string}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>
                      Rok ukončení{" "}
                      {index === educationFields.length - 1 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <Input
                      {...register(
                        `education.${index}.graduationYear` as const
                      )}
                      placeholder="např. 2018"
                      disabled={isFormDisabled}
                    />
                    {errors.education?.[index]?.graduationYear && (
                      <p className="text-xs text-destructive">
                        {
                          errors.education[index]?.graduationYear
                            ?.message as string
                        }
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Druh zkoušky{" "}
                      {index === educationFields.length - 1 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <Input
                      {...register(`education.${index}.examType` as const)}
                      placeholder="maturita, státní zkouška…"
                      disabled={isFormDisabled}
                    />
                    {errors.education?.[index]?.examType && (
                      <p className="text-xs text-destructive">
                        {errors.education[index]?.examType?.message as string}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>
                      Dosažený titul <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...register(`education.${index}.degreeTitle` as const)}
                      placeholder="např. Bc., Mgr., nebo „žádný“"
                      disabled={isFormDisabled}
                    />
                    {errors.education?.[index]?.degreeTitle && (
                      <p className="text-xs text-destructive">
                        {
                          errors.education[index]?.degreeTitle
                            ?.message as string
                        }
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Stav <span className="text-destructive">*</span>
                    </Label>
                    <RadioGroup
                      value={watch(`education.${index}.studyStatus`)}
                      onValueChange={(val) =>
                        setValue(
                          `education.${index}.studyStatus`,
                          val as EducationEntry["studyStatus"],
                          { shouldValidate: true }
                        )
                      }
                      className="flex gap-4"
                      disabled={isFormDisabled}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          id={`edu-status-completed-${index}`}
                          value="COMPLETED"
                        />
                        <Label
                          htmlFor={`edu-status-completed-${index}`}
                          className="font-normal"
                        >
                          Ukončeno
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          id={`edu-status-ongoing-${index}`}
                          value="ONGOING"
                        />
                        <Label
                          htmlFor={`edu-status-ongoing-${index}`}
                          className="font-normal"
                        >
                          Probíhající
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                <div className="flex justify-end">
                  {educationFields.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeEducation(index)}
                      disabled={isFormDisabled}
                    >
                      Odebrat řádek
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                appendEducation({
                  level: "ZAKLADNI",
                  schoolType: "",
                  semesters: "",
                  studyForm: "DENNI",
                  graduationYear: "",
                  examType: "",
                  degreeTitle: "",
                  studyStatus: "COMPLETED",
                } as EducationEntry)
              }
              disabled={isFormDisabled}
            >
              Přidat další řádek
            </Button>

            {errors.education?.message && (
              <p className="pt-2 text-xs text-destructive">
                {errors.education.message as string}
              </p>
            )}
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1 pb-2">
              <h3 className="text-base font-semibold">Znalost cizích jazyků</h3>
              <p className="text-xs text-muted-foreground">
                Dobrovolný údaj. Angličtina je přednastavena – pokud ji
                neovládáte, vyberte úroveň A0 (žádná znalost). Ostatní jazyky si
                přidejte sami tlačítkem níže.
              </p>
            </div>
            <div className="rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium">
                Stupně jazykové znalosti (SERR):
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                <span>
                  <strong>A0</strong> – žádná znalost
                </span>
                <span>
                  <strong>A1</strong> – začátečník
                </span>
                <span>
                  <strong>A2</strong> – základní
                </span>
                <span>
                  <strong>B1</strong> – středně pokročilý
                </span>
                <span>
                  <strong>B2</strong> – vyšší středně pokročilý
                </span>
                <span>
                  <strong>C1</strong> – pokročilý
                </span>
                <span>
                  <strong>C2</strong> – rodilý mluvčí / plynná znalost
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {languages.map((lang, index) => (
                <div key={index} className="space-y-2 rounded-md border p-3">
                  <div className="space-y-1">
                    <Label>Název jazyka</Label>
                    <Input
                      {...register(`languages.${index}.name` as const)}
                      disabled={isFormDisabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Úroveň</Label>
                    <Select
                      value={lang.level ?? undefined}
                      onValueChange={(value) =>
                        setValue(
                          `languages.${index}.level`,
                          value as PersonalQuestionnaireSchema["languages"][number]["level"],
                          { shouldValidate: true }
                        )
                      }
                      disabled={isFormDisabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Zvolte úroveň" />
                      </SelectTrigger>
                      <SelectContent>
                        {languageLevelEnum.options.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setValue("languages", [
                    ...languages,
                    {
                      name: "",
                    } as PersonalQuestionnaireSchema["languages"][number],
                  ])
                }
                disabled={isFormDisabled}
              >
                <PlusCircle className="mr-2 size-4" />
                Přidat další jazyk
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">D. Osvědčení</h2>
          <p className="text-xs text-muted-foreground">
            Originál osvědčení vezměte prosím s sebou.
          </p>

          {[
            {
              id: "cert-man",
              field: "hasCertificateManagement" as const,
              value: hasCertificateManagement,
              label:
                "Získal/a jste osvědčení o vzdělávání vedoucích úředníků dle zák. č. 312/2002 Sb.?",
            },
            {
              id: "cert-spec",
              field: "hasCertificateSpecial" as const,
              value: hasCertificateSpecial,
              label:
                "Získal/a jste osvědčení o zvláštní odborné způsobilosti dle zák. č. 312/2002 Sb.?",
            },
            {
              id: "cert-train",
              field: "hasCertificateTraining" as const,
              value: hasCertificateTraining,
              label:
                "Získal/a jste osvědčení o vstupním školení dle zák. č. 312/2002 Sb.?",
            },
            {
              id: "cert-gen",
              field: "hasCertificateGeneral" as const,
              value: hasCertificateGeneral,
              label:
                "Získal/a jste osvědčení o vykonání úřednické zkoušky dle zák. č. 234/2014 Sb.?",
            },
          ].map(({ id, field, value, label }) => (
            <div key={id} className="space-y-2">
              <Label>
                {label} <span className="text-destructive">*</span>
              </Label>
              <YesNoToggle
                idPrefix={id}
                value={value}
                disabled={isFormDisabled}
                onChange={(next) =>
                  setValue(field, next, { shouldValidate: true })
                }
              />
              {errors[field] && (
                <p className="text-xs text-destructive">
                  {errors[field]?.message as string}
                </p>
              )}
              {field === "hasCertificateSpecial" && value === true && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Uveďte každý typ osvědčení zvlášť do vlastní kolonky.
                  </p>
                  {certificateSpecialFields.map((f, idx) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <Input
                        {...register(
                          `certificateSpecialNames.${idx}.name` as const
                        )}
                        disabled={isFormDisabled}
                        placeholder="Uveďte název osvědčení"
                      />
                      {certificateSpecialFields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeCertificateSpecial(idx)}
                          disabled={isFormDisabled}
                        >
                          Odebrat
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendCertificateSpecial({ name: "" })}
                    disabled={isFormDisabled}
                  >
                    <PlusCircle className="mr-2 size-4" />
                    Přidat osvědčení
                  </Button>
                  {errors.certificateSpecialNames && (
                    <p className="text-xs text-destructive">
                      {errors.certificateSpecialNames.message as string}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">E. Doplňující informace</h2>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Řidičské oprávnění
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label>
                Jsem vlastníkem řidičského oprávnění{" "}
                <span className="text-destructive">*</span>
              </Label>
              <YesNoToggle
                idPrefix="driver-license"
                value={hasDriverLicense}
                disabled={isFormDisabled}
                onChange={(next) =>
                  setValue("hasDriverLicense", next, { shouldValidate: true })
                }
              />
              {errors.hasDriverLicense && (
                <p className="text-xs text-destructive">
                  {errors.hasDriverLicense.message as string}
                </p>
              )}

              {hasDriverLicense === true && (
                <div className="space-y-1.5 pt-1">
                  <Label>
                    Skupiny řidičského oprávnění{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Zaškrtněte všechny skupiny, které vlastníte.
                  </p>
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {DRIVER_LICENSE_CATEGORIES.map((category) => (
                      <div key={category} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`driver-cat-${category}`}
                          checked={driverLicenseCategories.includes(category)}
                          onCheckedChange={() =>
                            toggleDriverLicenseCategory(category)
                          }
                          disabled={isFormDisabled}
                        />
                        <Label
                          htmlFor={`driver-cat-${category}`}
                          className="cursor-pointer font-normal"
                        >
                          {category} –{" "}
                          {DRIVER_LICENSE_CATEGORY_LABELS[category]}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {errors.driverLicenseCategories && (
                    <p className="text-xs text-destructive">
                      {errors.driverLicenseCategories.message as string}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Kontaktní osoba (dobrovolný údaj)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Osoba, která má být kontaktována z důvodu ochrany životně
                důležitých zájmů Vaší osoby nebo jiné fyzické osoby.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Jméno a příjmení</Label>
                  <Input
                    {...register("maintenanceContactName")}
                    disabled={isFormDisabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Telefon</Label>
                  <div className="grid grid-cols-[minmax(0,110px)_1fr] gap-2">
                    <Select
                      value={
                        watch("maintenancePhoneCountryCode") ||
                        DEFAULT_PHONE_COUNTRY_CODE
                      }
                      onValueChange={(value) =>
                        setValue("maintenancePhoneCountryCode", value, {
                          shouldValidate: true,
                        })
                      }
                      disabled={isFormDisabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Předvolba" />
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_COUNTRY_CODE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      {...register("maintenancePhone")}
                      disabled={isFormDisabled}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Důchod a zdravotní znevýhodnění
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Pobíráte dávky důchodového pojištění?{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <YesNoToggle
                  idPrefix="pension"
                  value={receivesPensionBenefits}
                  disabled={isFormDisabled}
                  onChange={(next) =>
                    setValue("receivesPensionBenefits", next, {
                      shouldValidate: true,
                    })
                  }
                />
                {errors.receivesPensionBenefits && (
                  <p className="text-xs text-destructive">
                    {errors.receivesPensionBenefits.message as string}
                  </p>
                )}

                {receivesPensionBenefits === true && (
                  <div className="space-y-1 pt-1">
                    <Label>
                      Druh důchodu <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...register("typePensionBenefits")}
                      disabled={isFormDisabled}
                    />
                    {errors.typePensionBenefits && (
                      <p className="text-xs text-destructive">
                        {errors.typePensionBenefits.message as string}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label>
                  Jste osobou se zdravotním postižením?{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Dále vyplňte pouze v případě kladné odpovědi
                </p>
                <YesNoToggle
                  idPrefix="disabled"
                  value={isDisabledPerson}
                  disabled={isFormDisabled}
                  onChange={(next) =>
                    setValue("isDisabledPerson", next, {
                      shouldValidate: true,
                    })
                  }
                />
                {errors.isDisabledPerson && (
                  <p className="text-xs text-destructive">
                    {errors.isDisabledPerson.message as string}
                  </p>
                )}

                {isDisabledPerson && (
                  <div className="space-y-2 pt-1">
                    <Label>
                      Stupeň zdravotního postižení{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <RadioGroup
                      value={watch("disabilityDegree")}
                      onValueChange={(value) =>
                        setValue(
                          "disabilityDegree",
                          value as PersonalQuestionnaireSchema["disabilityDegree"],
                          { shouldValidate: true }
                        )
                      }
                      className="flex flex-wrap gap-4"
                      disabled={isFormDisabled}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="inv1" value="I" />
                        <Label htmlFor="inv1">I. stupeň</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="inv2" value="II" />
                        <Label htmlFor="inv2">II. stupeň</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="inv3" value="III" />
                        <Label htmlFor="inv3">III. stupeň</Label>
                      </div>
                    </RadioGroup>
                    {errors.disabilityDegree && (
                      <p className="text-xs text-destructive">
                        {errors.disabilityDegree.message as string}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Příbuzní zaměstnaní na ÚMČ Praha 6
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                <strong>Osoba blízká:</strong> je příbuzný v řadě přímé -
                manžel/manželka nebo partner/partnerka.
              </p>
              <div className="space-y-2">
                <Label>
                  Máte na ÚMČ Praha 6 zaměstnané osoby blízké?{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <YesNoToggle
                  idPrefix="family-relations"
                  value={hasFamilyRelations}
                  disabled={isFormDisabled}
                  onChange={(next) =>
                    setValue("hasFamilyRelations", next, {
                      shouldValidate: true,
                    })
                  }
                />
                {errors.hasFamilyRelations && (
                  <p className="text-xs text-destructive">
                    {errors.hasFamilyRelations.message as string}
                  </p>
                )}
              </div>

              {hasFamilyRelations === true && (
                <div className="space-y-1 pt-1">
                  <Label>
                    Jméno a příjmení, pozice a odbor{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register("familyRelations")}
                    disabled={isFormDisabled}
                  />
                  {errors.familyRelations && (
                    <p className="text-xs text-destructive">
                      {errors.familyRelations.message as string}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4 rounded-md border-l-4 border-l-[#00847C] p-4">
          <h2 className="text-lg font-semibold">F. Prohlášení</h2>

          {[
            {
              id: "final-true",
              field: "finalReadAndUnderstood" as const,
              value: finalReadAndUnderstood,
              label:
                "Prohlašuji, že jsem nic nezamlčel(a) a všechny mnou uvedené údaje jsou pravdivé.",
            },
            {
              id: "final-behaviour",
              field: "finalTruthfulnessConfirm" as const,
              value: finalTruthfulnessConfirm,
              label:
                "Prohlašuji, že změnu jakéhokoli z mnou uvedených údajů oznámím bezodkladně personálnímu oddělení. Pokud by nesplnění této povinnosti způsobilo škodu, nesu za ni plnou odpovědnost.",
            },
          ].map(({ id, field, value, label }) => (
            <div key={id} className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">
                {label} <span className="text-destructive">*</span>
              </Label>
              <YesNoToggle
                idPrefix={id}
                value={value}
                disabled={isFormDisabled}
                onChange={(next) =>
                  setValue(field, next, { shouldValidate: true })
                }
              />
              {errors[field] && (
                <p className="text-xs text-destructive">
                  {errors[field]?.message as string}
                </p>
              )}
            </div>
          ))}
        </section>

        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            disabled={isPending || isFormDisabled}
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
                ? "Odeslat osobní dotazník"
                : "Uložit úpravy"}
          </Button>
        </div>
      </form>
    </>
  )
}
