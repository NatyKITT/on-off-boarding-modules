"use client"

import * as React from "react"
import { useTransition } from "react"
import Image from "next/image"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle, PlusCircle, Trash2, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { useToast } from "@/hooks/use-toast"
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

type PersonalQuestionnaireBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
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
      typePensionBenefits: "",
      disabilityDegree: "NONE",
      children: [{ fullName: "", birthDate: "" }],
      languages: [
        { name: "Angličtina" },
        { name: "Němčina" },
        { name: "Španělština" },
        { name: "Francouzština" },
      ] as PersonalQuestionnaireSchema["languages"],
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
    fields: childrenFields,
    append: appendChild,
    remove: removeChild,
  } = useFieldArray<PersonalQuestionnaireSchema, "children">({
    control,
    name: "children",
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
        </header>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Základní údaje</h2>
          <p className="text-xs text-muted-foreground">
            základní identifikační údaje zaměstnankyně/zaměstnance
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                Příjmení <span className="text-destructive">*</span>
              </Label>
              <Input {...register("lastName")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>
                Křestní jméno <span className="text-destructive">*</span>
              </Label>
              <Input {...register("firstName")} disabled={isFormDisabled} />
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
            </div>
            <div className="space-y-1">
              <Label>
                Rodné číslo <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthNumber")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>
                Místo narození <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthPlace")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>
                Okres narození <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthDistrict")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>
                Stát narození <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthState")} disabled={isFormDisabled} />
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
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Datová schránka (pokud je zřízena)</Label>
              <Input {...register("dataBoxId")} disabled={isFormDisabled} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Žádám o doručování datovou schránkou a prohlašuji, že se jedná o
              moji datovou schránku fyzické osoby a datová schránka není pro
              doručování znepřístupněna.{" "}
              <span className="text-destructive">*</span>
            </Label>
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
                  { shouldValidate: true }
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
            </div>
            <div className="space-y-1">
              <Label>
                Obec / část obce <span className="text-destructive">*</span>
              </Label>
              <Input {...register("permanentCity")} disabled={isFormDisabled} />
            </div>
            <div className="space-y-1">
              <Label>
                PSČ <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("permanentPostcode")}
                disabled={isFormDisabled}
              />
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
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>
                Vedený u bankovního ústavu:{" "}
                <span className="text-destructive">*</span>
                <p className="text-xs text-muted-foreground">
                  Jméno bankovního ústavu
                </p>
              </Label>
              <Input {...register("bankName")} disabled={isFormDisabled} />
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
            </div>

            <div className="space-y-1">
              <Label>
                Druh důchodu (pokud pobíráte dávky důchodového pojištění)
              </Label>
              <Input
                {...register("typePensionBenefits")}
                disabled={isFormDisabled}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Jste osobou se zdravotním postižením?{" "}
              <span className="text-destructive">*</span>
            </Label>
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
          </div>

          {isDisabledPerson && (
            <div className="space-y-2">
              <Label>Stupeň zdravotního postižení</Label>
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
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Děti</h2>
          <p className="text-xs text-muted-foreground">
            Informace o dětech pro mzdové účely. Pokud nemáte děti, tuto část
            nemusíte vyplňovat.
          </p>

          <div className="space-y-3">
            {childrenFields.map((field, index) => (
              <div
                key={field.id}
                className="grid items-end gap-3 md:grid-cols-[2.5fr,1.5fr,auto]"
              >
                <div className="space-y-1">
                  <Label>Jméno a příjmení dítěte {index + 1}</Label>
                  <Input
                    {...register(`children.${index}.fullName` as const)}
                    disabled={isFormDisabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Datum narození dítěte {index + 1}</Label>
                  <Input
                    type="date"
                    {...register(`children.${index}.birthDate` as const)}
                    disabled={isFormDisabled}
                  />
                </div>
                <div className="flex justify-end">
                  {childrenFields.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeChild(index)}
                      disabled={isFormDisabled}
                      aria-label="Odebrat řádek"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendChild({ fullName: "", birthDate: "" })}
              disabled={isFormDisabled}
            >
              <PlusCircle className="mr-2 size-4" />
              Přidat další záznam
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Znalost cizího jazyka</h2>
          <p className="text-xs text-muted-foreground">
            Dobrovolný údaj. Vyplňte pouze v případě, že chcete uvést znalost
            cizích jazyků. Stupně znalosti dle evropského systému hodnocení –{" "}
            <b>A0 znamená prakticky žádnou znalost / úplný začátečník.</b>
          </p>

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

          <div className="space-y-2">
            <Label>
              Získal/a jste osvědčení o vzdělávání vedoucích úředníků dle zák.
              č. 312/2002 Sb.? <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                hasCertificateManagement === true
                  ? "yes"
                  : hasCertificateManagement === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("hasCertificateManagement", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-man-yes" value="yes" />
                <Label htmlFor="cert-man-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-man-no" value="no" />
                <Label htmlFor="cert-man-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>
              Získal/a jste osvědčení o zvláštní odborné způsobilosti dle zák.
              č. 312/2002 Sb.? <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                hasCertificateSpecial === true
                  ? "yes"
                  : hasCertificateSpecial === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("hasCertificateSpecial", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-spec-yes" value="yes" />
                <Label htmlFor="cert-spec-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-spec-no" value="no" />
                <Label htmlFor="cert-spec-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>
              Získal/a jste osvědčení o vstupním školení dle zák. č. 312/2002
              Sb.?<span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                hasCertificateTraining === true
                  ? "yes"
                  : hasCertificateTraining === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("hasCertificateTraining", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-train-yes" value="yes" />
                <Label htmlFor="cert-train-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-train-no" value="no" />
                <Label htmlFor="cert-train-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>
              Získal/a jste osvědčení o vykonání úřednické zkoušky dle zák. č.
              234/2014 Sb.?<span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                hasCertificateGeneral === true
                  ? "yes"
                  : hasCertificateGeneral === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("hasCertificateGeneral", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-gen-yes" value="yes" />
                <Label htmlFor="cert-gen-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="cert-gen-no" value="no" />
                <Label htmlFor="cert-gen-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-sm font-medium">Závěrečná informace</h2>

          <div className="space-y-2">
            <Label>
              Vaši příbuzní zaměstnaní na ÚMČ Praha 6 (uveďte název práce/pozice
              a odbor)
              <p className="text-xs text-muted-foreground">
                Osoba blízká je příbuzný v řadě přímé, manžel/manželka nebo
                partner/partnerka (registr. partnerství), sourozenec
              </p>
            </Label>
            <Input {...register("familyRelations")} disabled={isFormDisabled} />
          </div>

          <div className="space-y-2">
            <Label>
              Žádám ve smyslu ust. § 143 ZP, aby mé vyúčtování platu bylo
              převáděno na platební účet, který jsem uvedl/a v tomto dotazníku.
              <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                finalRequestPayrollTransfer === true
                  ? "yes"
                  : finalRequestPayrollTransfer === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("finalRequestPayrollTransfer", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="final-payroll-yes" value="yes" />
                <Label htmlFor="final-payroll-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="final-payroll-no" value="no" />
                <Label htmlFor="final-payroll-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>
              Prohlašuji, že jsem nic nezamlčel(a) a všechny mnou uvedené údaje
              jsou pravdivé.<span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                finalReadAndUnderstood === true
                  ? "yes"
                  : finalReadAndUnderstood === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("finalReadAndUnderstood", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="final-true-yes" value="yes" />
                <Label htmlFor="final-true-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="final-true-no" value="no" />
                <Label htmlFor="final-true-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>
              Prohlašuji, že změnu jakéhokoli z mnou uvedených údajů oznámím
              bezodkladně na personálním oddělení a na mzdové účtárně. Pokud by
              nesplnění této povinnosti způsobilo škodu, nesu za ni plnou
              odpovědnost.<span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                finalTruthfulnessConfirm === true
                  ? "yes"
                  : finalTruthfulnessConfirm === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("finalTruthfulnessConfirm", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex gap-4"
              disabled={isFormDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="final-behaviour-yes" value="yes" />
                <Label htmlFor="final-behaviour-yes">Ano</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="final-behaviour-no" value="no" />
                <Label htmlFor="final-behaviour-no">Ne</Label>
              </div>
            </RadioGroup>
          </div>
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
                ? "Odeslat čestné prohlášení"
                : "Uložit úpravy"}
          </Button>
        </div>
      </form>
    </>
  )
}
