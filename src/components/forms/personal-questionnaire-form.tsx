"use client"

import * as React from "react"
import { useTransition } from "react"
import Image from "next/image"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle, PlusCircle, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import {
  EDUCATION_LEVEL_OPTIONS,
  STUDY_FORM_OPTIONS,
} from "@/types/education-options"

import { useToast } from "@/hooks/use-toast"
import { EmployeeMeta } from "@/lib/employee-meta"
import {
  languageLevelEnum,
  personalQuestionnaireSchema,
  type PersonalQuestionnaireSchema,
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
import { DocumentEmployeeHeader } from "@/components/common/document-employee-header"

type PersonalQuestionnaireBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
  employeeMeta?: EmployeeMeta
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
  const [isPending, startTransition] = useTransition()

  const form = useForm<PersonalQuestionnaireSchema>({
    mode: "onChange",
    resolver: zodResolver(personalQuestionnaireSchema),
    defaultValues: (props.initialData as
      | PersonalQuestionnaireSchema
      | undefined) ?? {
      lastName: "",
      firstName: "",
      titleBefore: "",
      titleAfter: "",
      academicDegrees: "",
      maidenName: "",
      otherSurnames: "",
      birthDate: "",
      birthNumber: "",
      birthPlace: "",
      birthDistrict: "",
      birthState: "",
      phone: "",
      citizenship: "",
      dataBoxDelivery: undefined,
      dataBoxId: "",
      maritalStatus: "SINGLE",
      foreignPermitFrom: "",
      foreignPermitTo: "",
      foreignPermitAuthority: "",
      permanentStreet: "",
      permanentHouseNumber: "",
      permanentCity: "",
      permanentPostcode: "",
      correspondenceStreet: "",
      correspondenceHouseNumber: "",
      correspondenceCity: "",
      correspondencePostcode: "",
      healthInsuranceCompany: "",
      bankAccountNumber: "",
      bankName: "",
      maintenanceInfo: "",
      isDisabledPerson: undefined,
      receivesPensionBenefits: undefined,
      typePensionBenefits: "",
      disabilityDegree: "NONE",
      hasCertificateManagement: undefined,
      hasCertificateSpecial: undefined,
      hasCertificateTraining: undefined,
      hasCertificateGeneral: undefined,
      languages: [
        { name: "Angličtina" },
        { name: "Němčina" },
        { name: "Španělština" },
        { name: "Francouzština" },
      ] as PersonalQuestionnaireSchema["languages"],
      education: [
        {
          level: "ZAKLADNI",
          schoolType: "",
          semesters: "",
          studyForm: "DENNI",
          graduationYear: "",
          examType: "",
        },
      ],
      familyRelations: "",
      finalRequestPayrollTransfer: undefined,
      finalReadAndUnderstood: undefined,
      finalTruthfulnessConfirm: undefined,
    },
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form

  const maritalStatus = watch("maritalStatus")
  const isDisabledPerson = watch("isDisabledPerson") as boolean | undefined
  const languages = watch("languages") ?? []

  const dataBoxDelivery = watch("dataBoxDelivery") as boolean | undefined
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
  const finalRequestPayrollTransfer = watch("finalRequestPayrollTransfer") as
    | boolean
    | undefined
  const finalReadAndUnderstood = watch("finalReadAndUnderstood") as
    | boolean
    | undefined
  const finalTruthfulnessConfirm = watch("finalTruthfulnessConfirm") as
    | boolean
    | undefined

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
            const message = await res.text().catch(() => "")
            throw new Error(message || "Uložení se nezdařilo.")
          }

          setStatus("completed")
          setResultModal("success")
          props.onSubmitted?.()
        } else {
          await props.onSubmitInternal?.(values)
          setStatus("completed")
          setResultModal("success")
        }
      } catch (error) {
        console.error(error)
        setStatus("filling")
        setResultModal("error")
        toast({
          title: "Chyba při ukládání",
          description:
            "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte HR.",
          variant: "destructive",
        })
      }
    })
  }

  return (
    <>
      <Dialog
        open={resultModal === "success"}
        onOpenChange={(open) => !open && setResultModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="size-5 text-green-500" />
              Osobní dotazník uložen
            </DialogTitle>
            <DialogDescription>
              Osobní dotazník byl úspěšně uložen.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resultModal === "error"}
        onOpenChange={(open) => !open && setResultModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-red-500" />
              Chyba při ukládání
            </DialogTitle>
            <DialogDescription>
              Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo
              kontaktujte své HR oddělení.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <form
        onSubmit={handleSubmit(handleSubmitForm)}
        className="mx-auto w-full max-w-5xl space-y-6"
      >
        <header className="space-y-4 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-3 text-center">
            <Image
              src="/assets/images/logo-kitt6.png"
              alt="Městská část Praha 6"
              width={100}
              height={100}
            />
            <h1 className="text-xl font-semibold text-foreground">
              Osobní dotazník
            </h1>
          </div>

          <DocumentEmployeeHeader
            fullName={props.employeeMeta?.fullName}
            position={props.employeeMeta?.position}
            unitName={props.employeeMeta?.unitName}
            department={props.employeeMeta?.department}
          />

          <p>Vážená paní, vážený pane,</p>
          <p>
            dovolujeme si Vás požádat o vyplnění následujících údajů pro účely
            zpracování personální a mzdové agendy. Vaše údaje budou k dispozici
            pouze tajemníkovi úřadu, zaměstnancům personálního oddělení, mzdové
            účtárně a HR specialistce. Data jsou přenášena šifrovaná a uložena
            na zabezpečeném úložišti.
          </p>
          <p>Dotazník Vám zabere maximálně 30 minut.</p>
          <p>Děkujeme a těšíme se na spolupráci.</p>
          <p>
            Městská část Praha 6, Úřad městské části, Čs. armády 23, 160 52
            Praha 6, IČO 00063703
          </p>
          <p>Personální oddělení, v přímém řízení tajemníka</p>
          <p>Oddělení účetnictví, Odbor ekonomický</p>

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

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Základní údaje</h2>
          <p className="text-xs text-muted-foreground">
            Základní identifikační údaje zaměstnankyně/zaměstnance
          </p>

          <div className="grid gap-3 md:grid-cols-2">
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
              <Label>Titul před jménem</Label>
              <Input {...register("titleBefore")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>Titul za jménem</Label>
              <Input {...register("titleAfter")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>Vědecká hodnost</Label>
              <Input
                {...register("academicDegrees")}
                disabled={isFormDisabled}
              />
            </div>
            <div className="space-y-1">
              <Label>Rodné příjmení</Label>
              <Input {...register("maidenName")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Všechna další příjmení</Label>
              <Input {...register("otherSurnames")} disabled={isFormDisabled} />
            </div>
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
              <p className="text-xs text-muted-foreground">
                Pokud nemáte rodné číslo (např. jste cizinec/cizinka), ponechte
                pole prázdné.
              </p>
              <Input {...register("birthNumber")} disabled={isFormDisabled} />
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
              <Input {...register("birthState")} disabled={isFormDisabled} />
              {errors.birthState && (
                <p className="text-xs text-destructive">
                  {errors.birthState.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Telefon (dobrovolný údaj)</Label>
              <Input {...register("phone")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>
                Státní občanství <span className="text-destructive">*</span>
              </Label>
              <Input {...register("citizenship")} disabled={isFormDisabled} />
              {errors.citizenship && (
                <p className="text-xs text-destructive">
                  {errors.citizenship.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Datová schránka (pokud je zřízena)</Label>
              <Input {...register("dataBoxId")} disabled={isFormDisabled} />
              {errors.dataBoxId && (
                <p className="text-xs text-destructive">
                  {errors.dataBoxId.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Žádám o doručování datovou schránkou{" "}
              <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Prohlašuji, že se jedná o moji datovou schránku fyzické osoby a
              datová schránka není pro doručování znepřístupněna.
            </p>
            <RadioGroup
              value={
                dataBoxDelivery === true
                  ? "yes"
                  : dataBoxDelivery === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("dataBoxDelivery", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex flex-col gap-2"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="databox-yes" value="yes" />
                <Label htmlFor="databox-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="databox-no" value="no" />
                <Label htmlFor="databox-no">Ne</Label>
              </div>
            </RadioGroup>
            {errors.dataBoxDelivery && (
              <p className="text-xs text-destructive">
                {errors.dataBoxDelivery.message as string}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>
              Rodinný stav <span className="text-destructive">*</span>
            </Label>
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

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                Povolení k pobytu cizího státního příslušníka vydáno od
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
                Povolení k pobytu cizího státního příslušníka vydáno do
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
            <div className="space-y-1">
              <Label>
                Povolení k pobytu cizího státního příslušníka vydáno kým (název
                orgánu)
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
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Adresa trvalého pobytu</h2>

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
              <Input {...register("permanentCity")} disabled={isFormDisabled} />
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
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">
            Adresa pro doručování (není třeba vyplňovat, pokud jste požádali o
            doručování datovou schránkou)
          </h2>
          <p className="text-xs text-muted-foreground">
            Tímto oznamujete, že pracovněprávní dokumenty má zaměstnavatel
            doručovat na Vámi uvedenou poštovní adresu.
          </p>
          <p className="text-xs text-muted-foreground">
            Cizí státní příslušník uvede adresu pobytu na území ČR.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Ulice</Label>
              <Input
                {...register("correspondenceStreet")}
                disabled={isFormDisabled}
              />
            </div>
            <div className="space-y-1">
              <Label>Číslo popisné / orientační</Label>
              <Input
                {...register("correspondenceHouseNumber")}
                disabled={isFormDisabled}
              />
            </div>
            <div className="space-y-1">
              <Label>Obec / část obce</Label>
              <Input
                {...register("correspondenceCity")}
                disabled={isFormDisabled}
              />
            </div>
            <div className="space-y-1">
              <Label>PSČ</Label>
              <Input
                {...register("correspondencePostcode")}
                disabled={isFormDisabled}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Doplňující údaje</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label>
                Stvrzuji, že jsem ke dni nástupu do zaměstnání pojištěncem
                zdravotní pojišťovny, název:{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("healthInsuranceCompany")}
                disabled={isFormDisabled}
              />
              {errors.healthInsuranceCompany && (
                <p className="text-xs text-destructive">
                  {errors.healthInsuranceCompany.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>
                Zasílání platu / odměny žádám s účinností od dne nástupu na
                bankovní účet číslo:
                <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("bankAccountNumber")}
                disabled={isFormDisabled}
              />
              {errors.bankAccountNumber && (
                <p className="text-xs text-destructive">
                  {errors.bankAccountNumber.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>
                Vedený u bankovního ústavu:{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input {...register("bankName")} disabled={isFormDisabled} />
              {errors.bankName && (
                <p className="text-xs text-destructive">
                  {errors.bankName.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>
              Jméno, příjmení, telefon osoby, která má být kontaktována z důvodu
              ochrany životně důležitých zájmů Vaší osoby nebo jiné fyzické
              osoby (dobrovolný údaj)
            </Label>
            <Input {...register("maintenanceInfo")} disabled={isFormDisabled} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>
                Pobíráte dávky důchodového pojištění?{" "}
                <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={
                  receivesPensionBenefits === true
                    ? "yes"
                    : receivesPensionBenefits === false
                      ? "no"
                      : ""
                }
                onValueChange={(value) =>
                  setValue("receivesPensionBenefits", value === "yes", {
                    shouldValidate: true,
                  })
                }
                className="flex gap-4"
                disabled={isFormDisabled}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pension-yes" value="yes" />
                  <Label htmlFor="pension-yes">Ano</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="pension-no" value="no" />
                  <Label htmlFor="pension-no">Ne</Label>
                </div>
              </RadioGroup>
              {errors.receivesPensionBenefits && (
                <p className="text-xs text-destructive">
                  {errors.receivesPensionBenefits.message as string}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>
                Druh důchodu (pokud pobíráte dávky důchodového pojištění)
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
          </div>

          <div className="space-y-2">
            <Label>
              Jste osobou se zdravotním postižením?{" "}
              <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Dále vyplňte pouze v případě kladné odpovědi
            </p>
            <RadioGroup
              value={
                isDisabledPerson === true
                  ? "yes"
                  : isDisabledPerson === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("isDisabledPerson", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="disabled-yes" value="yes" />
                <Label htmlFor="disabled-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="disabled-no" value="no" />
                <Label htmlFor="disabled-no">Ne</Label>
              </div>
            </RadioGroup>
            {errors.isDisabledPerson && (
              <p className="text-xs text-destructive">
                {errors.isDisabledPerson.message as string}
              </p>
            )}
          </div>

          {isDisabledPerson && (
            <div className="space-y-2">
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
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">Vzdělání</h2>
          <p className="text-xs text-muted-foreground">
            Uveďte prosím alespoň jedno ukončené vzdělání. V případě potřeby
            přidejte další řádky.
          </p>

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
                  <strong>denní formou</strong> – výuka organizovaná pravidelně
                  každý den v pětidenním vyučovacím týdnu v průběhu školního
                  roku,
                </li>
                <li>
                  <strong>večerní formou</strong> – výuka organizovaná
                  pravidelně několikrát v týdnu v rozsahu 10 až 18 hodin týdně v
                  průběhu školního roku zpravidla v odpoledních a večerních
                  hodinách,
                </li>
                <li>
                  <strong>dálkovou formou</strong> – samostatné studium spojené
                  s konzultacemi ve školním roce,
                </li>
                <li>
                  <strong>distanční formou</strong> – samostatné studium
                  uskutečňované převážně nebo zcela prostřednictvím informačních
                  technologií, popřípadě spojené s individuálními konzultacemi,
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
                  <strong>prezenční (denní)</strong> – výuka probíhá kterýkoliv
                  den, dopoledne i odpoledne; převážná část je organizována
                  formou přednášek, laboratorních prací a dalších cvičení,
                  seminářů, kurzů, praxí a dalších forem. Během výuky je student
                  v přímém kontaktu s učitelem a své poznatky získává přímo.
                </li>
                <li>
                  <strong>distanční studium</strong> – multimediální forma
                  řízeného studia, v němž jsou vyučující a konzultanti v průběhu
                  vzdělávání trvale nebo převážně odděleni od vzdělávaných.
                </li>
                <li>
                  <strong>kombinované</strong> – výuka probíhá obvykle o
                  víkendech nebo pátcích a sobotách, jednou za 14 dní nebo
                  jednou za měsíc. Vyučující probere pouze stěžejní část látky,
                  zbytek zůstává na samostudium; studenti jsou upozorněni na
                  odbornou literaturu a dostávají samostatné úkoly. Systém může
                  být doplněn o prvky distančního studia, např. e-learning či
                  konzultace s vyučujícími.
                </li>
              </ul>
            </div>
          </div>

          {educationFields.map((field, index) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border bg-muted/30 p-4"
            >
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
                  <Label>Počet tříd (semestrů)</Label>
                  <Input
                    {...register(`education.${index}.semesters` as const)}
                    placeholder="např. 4"
                    disabled={isFormDisabled}
                  />
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
                  <Label>Rok ukončení</Label>
                  <Input
                    {...register(`education.${index}.graduationYear` as const)}
                    placeholder="např. 2018"
                    disabled={isFormDisabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Druh zkoušky</Label>
                  <Input
                    {...register(`education.${index}.examType` as const)}
                    placeholder="maturita, státní zkouška…"
                    disabled={isFormDisabled}
                  />
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
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Znalost cizích jazyků</h2>
          <p className="text-xs text-muted-foreground">
            Dobrovolný údaj. Vyplňte pouze v případě, že chcete uvést znalost
            cizích jazyků.
          </p>

          <div className="rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium">Stupně jazykové znalosti (SERR):</p>
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
              <div key={index} className="space-y-2 rounded-md bg-muted/40 p-3">
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
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Osvědčení</h2>
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
              <RadioGroup
                value={value === true ? "yes" : value === false ? "no" : ""}
                onValueChange={(v) =>
                  setValue(field, v === "yes", { shouldValidate: true })
                }
                className="flex gap-4"
                disabled={isFormDisabled}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-yes`} value="yes" />
                  <Label htmlFor={`${id}-yes`}>Ano</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-no`} value="no" />
                  <Label htmlFor={`${id}-no`}>Ne</Label>
                </div>
              </RadioGroup>
              {errors[field] && (
                <p className="text-xs text-destructive">
                  {errors[field]?.message as string}
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Závěrečná informace</h2>

          <div className="space-y-2">
            <Label>Vaši příbuzní zaměstnaní na ÚMČ Praha 6</Label>
            <p className="text-xs text-muted-foreground">
              Uveďte název práce/pozice a odbor
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Osoba blízká:</strong> je příbuzný v řadě přímé -
              manžel/manželka nebo partner/partnerka.
            </p>
            <Input {...register("familyRelations")} disabled={isFormDisabled} />
          </div>

          {[
            {
              id: "final-payroll",
              field: "finalRequestPayrollTransfer" as const,
              value: finalRequestPayrollTransfer,
              label:
                "Žádám ve smyslu ust. § 143 ZP, aby mé vyúčtování platu bylo převáděno na platební účet, který jsem uvedl/a v tomto dotazníku.",
            },
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
                "Prohlašuji, že změnu jakéhokoli z mnou uvedených údajů oznámím bezodkladně na personálním oddělení a na mzdové účtárně. Pokud by nesplnění této povinnosti způsobilo škodu, nesu za ni plnou odpovědnost.",
            },
          ].map(({ id, field, value, label }) => (
            <div key={id} className="space-y-2">
              <Label>
                {label} <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={value === true ? "yes" : value === false ? "no" : ""}
                onValueChange={(v) =>
                  setValue(field, v === "yes", { shouldValidate: true })
                }
                className="flex gap-4"
                disabled={isFormDisabled}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-yes`} value="yes" />
                  <Label htmlFor={`${id}-yes`}>Ano</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`${id}-no`} value="no" />
                  <Label htmlFor={`${id}-no`}>Ne</Label>
                </div>
              </RadioGroup>
              {errors[field] && (
                <p className="text-xs text-destructive">
                  {errors[field]?.message as string}
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-2 rounded-md border p-4 text-sm text-muted-foreground">
          <h2 className="text-sm font-medium text-foreground">
            Informace o dalším postupu
          </h2>
          <p>
            <b>
              Vyžádejte si prosím co nejdříve výpis ze své zdravotní dokumentace
              u Vašeho praktického lékaře.
            </b>{" "}
            Výpis je nezbytným podkladem pro provedení pracovnělékařské
            prohlídky, náklady za jeho vystavení Vám budou uhrazeny
            zaměstnavatelem po předložení potvrzení o platbě.
          </p>
          <p>
            Na pracovnělékařskou prohlídku obdržíte termín i příslušný formulář
            na personálním oddělení ÚMČ Praha 6.
          </p>
          <p>Děkujeme za vyplnění a přejeme krásný a úspěšný den.</p>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending || isFormDisabled}>
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
