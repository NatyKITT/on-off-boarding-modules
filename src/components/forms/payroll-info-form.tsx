"use client"

import * as React from "react"
import { useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { BANK_OPTIONS, OTHER_BANK_VALUE } from "@/types/bank-options"
import {
  HEALTH_INSURANCE_OPTIONS,
  OTHER_HEALTH_INSURANCE_VALUE,
} from "@/types/health-insurance-options"
import {
  NATIONALITY_OPTIONS,
  OTHER_CITIZENSHIP_VALUE,
} from "@/types/nationality-options"

import { useToast } from "@/hooks/use-toast"
import { EmployeeMeta } from "@/lib/employee-meta"
import type { PrefillSuggestion } from "@/lib/employment-document-prefill"
import { getPrefillDisplayLabels } from "@/lib/employment-document-shared-fields"
import { ServerValidationError } from "@/lib/server-validation-error"
import {
  payrollInfoSchema,
  type PayrollInfoSchema,
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
import { DocumentPrefillBanner } from "@/components/forms/document-prefill-banner"

type PayrollInfoFormBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
  employeeMeta?: EmployeeMeta
  prefillSuggestion?: PrefillSuggestion | null
  onDirtyChange?: (dirty: boolean) => void
}

type PayrollInfoFormPublicProps = PayrollInfoFormBaseProps & {
  mode: "public"
  hash: string
  onSubmitted?: () => void
  onSubmitInternal?: never
}

type PayrollInfoFormInternalProps = PayrollInfoFormBaseProps & {
  mode: "internal"
  hash?: never
  onSubmitted?: never
  onSubmitInternal?: (data: PayrollInfoSchema) => Promise<void> | void
}

export type PayrollInfoFormProps =
  | PayrollInfoFormPublicProps
  | PayrollInfoFormInternalProps

function todayIso() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDateCz(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
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

export function PayrollInfoForm(props: PayrollInfoFormProps) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    "filling" | "loading" | "completed" | "error"
  >("filling")
  const [resultModal, setResultModal] = React.useState<
    "success" | "error" | null
  >(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const today = React.useMemo(() => todayIso(), [])

  const baseDefaultValues: Partial<PayrollInfoSchema> = {
    firstName: props.employeeMeta?.firstName ?? "",
    lastName: props.employeeMeta?.lastName ?? "",
    birthSurnameDiffers: undefined,
    birthSurname: "",
    titleBefore: props.employeeMeta?.titleBefore ?? "",
    titleAfter: props.employeeMeta?.titleAfter ?? "",
    academicDegrees: "",
    maritalStatus: "UNSTATED",
    birthDate: "",
    birthNumber: "",
    birthPlace: "",
    birthDistrict: "",
    birthState: "",
    citizenship: "",
    citizenshipOther: "",

    permanentStreet: "",
    permanentHouseNumber: "",
    permanentCity: "",
    permanentPostcode: "",

    hasChildren: undefined,
    children: [{ childName: "", childBirthDate: "" }],

    healthInsuranceCompany: "",
    healthInsuranceCompanyOther: "",

    bankName: "",
    bankNameOther: "",
    bankAccountNumber: "",

    confirmTruthfulness: undefined,
    signatureDate: today,
  }

  const form = useForm<PayrollInfoSchema, unknown, PayrollInfoSchema>({
    mode: "onChange",
    resolver: zodResolver(
      payrollInfoSchema
    ) as import("react-hook-form").Resolver<
      PayrollInfoSchema,
      unknown,
      PayrollInfoSchema
    >,
    defaultValues: {
      ...baseDefaultValues,
      ...(props.initialData as Partial<PayrollInfoSchema> | undefined),
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    control,
    formState: { errors, isDirty },
  } = form

  const onDirtyChange = props.onDirtyChange

  React.useEffect(() => {
    onDirtyChange?.(status === "filling" && isDirty)
  }, [isDirty, status, onDirtyChange])

  const [prefillResolved, setPrefillResolved] = React.useState(false)

  function handleAcceptPrefill() {
    if (!props.prefillSuggestion) return

    for (const [key, value] of Object.entries(props.prefillSuggestion.data)) {
      setValue(key as keyof PayrollInfoSchema, value as never, {
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

  const isCompleted = status === "completed"
  const isDisabled =
    status === "loading" ||
    (props.mode === "public" && isCompleted) ||
    props.readOnly === true

  const birthSurnameDiffers = watch("birthSurnameDiffers") as
    | boolean
    | undefined
  const citizenship = watch("citizenship")
  const hasChildren = watch("hasChildren") as boolean | undefined
  const healthInsuranceCompany = watch("healthInsuranceCompany")
  const bankName = watch("bankName")
  const confirmTruthfulness = watch("confirmTruthfulness") as
    | boolean
    | undefined

  const childrenArray = useFieldArray<PayrollInfoSchema, "children">({
    control,
    name: "children",
  })

  const handleInvalid = () => {
    toast({
      title: "Formulář nelze odeslat",
      description:
        "Některá povinná pole nejsou vyplněná nebo obsahují chybu. Zkontrolujte prosím červeně označená pole.",
      variant: "destructive",
    })
  }

  const handleSubmitForm: import("react-hook-form").SubmitHandler<
    PayrollInfoSchema
  > = (values) => {
    setValue("signatureDate", todayIso())
    const finalValues = { ...values, signatureDate: todayIso() }

    startTransition(async () => {
      setStatus("loading")
      try {
        if (props.mode === "public") {
          const res = await fetch(`/api/dokumenty/public/${props.hash}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: props.documentId,
              type: "PAYROLL_INFO",
              data: finalValues,
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
          await props.onSubmitInternal?.(finalValues)
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
            <div>
              <h1 className="text-3xl font-semibold text-foreground">
                Nástup zaměstnance do pracovního poměru
              </h1>
              <p className="text-xs">
                (nezbytné zákonné údaje pro vedení mzdové agendy)
              </p>
            </div>
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

        {props.prefillSuggestion && !prefillResolved && !isDisabled && (
          <DocumentPrefillBanner
            sourceLabel={props.prefillSuggestion.sourceLabel}
            fieldLabels={getPrefillDisplayLabels(props.prefillSuggestion.data)}
            onAccept={handleAcceptPrefill}
            onDismiss={() => setPrefillResolved(true)}
          />
        )}

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            A. Základní údaje zaměstnance
          </h2>

          <div className="space-y-1 rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Jméno a příjmení</p>
            <p className="text-sm font-medium">
              {props.employeeMeta?.fullName || "—"}
            </p>
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
              idPrefix="payroll-birth-surname-differs"
              value={birthSurnameDiffers}
              disabled={isDisabled}
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
                <Input {...register("birthSurname")} disabled={isDisabled} />
                {errors.birthSurname && (
                  <p className="text-xs text-destructive">
                    {errors.birthSurname.message as string}
                  </p>
                )}
              </div>
            )}
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
              value={watch("maritalStatus")}
              onValueChange={(val) =>
                setValue(
                  "maritalStatus",
                  val as PayrollInfoSchema["maritalStatus"],
                  { shouldValidate: true }
                )
              }
              className="flex flex-wrap gap-4"
              disabled={isDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="pms-single" value="SINGLE" />
                <Label htmlFor="pms-single">Svobodný/á</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="pms-married" value="MARRIED" />
                <Label htmlFor="pms-married">Vdaná / ženatý</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="pms-div" value="DIVORCED" />
                <Label htmlFor="pms-div">Rozvedený/á</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="pms-wid" value="WIDOWED" />
                <Label htmlFor="pms-wid">Vdova / vdovec</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="pms-reg" value="REGISTERED" />
                <Label htmlFor="pms-reg">Registrované partnerství</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="pms-na" value="UNSTATED" />
                <Label htmlFor="pms-na">Neuvádím</Label>
              </div>
            </RadioGroup>
            {errors.maritalStatus && (
              <p className="text-xs text-destructive">
                {errors.maritalStatus.message as string}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                Datum narození <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                {...register("birthDate")}
                disabled={isDisabled}
              />
              {errors.birthDate && (
                <p className="text-xs text-destructive">
                  {errors.birthDate.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Rodné číslo</Label>
              <Input
                {...register("birthNumber")}
                placeholder="např. 900101/1234"
                disabled={isDisabled}
              />
              <p className="text-xs text-muted-foreground">
                Cizinci, kteří nemají přiděleno rodné číslo, ponechají toto pole
                prázdné.
              </p>
              {errors.birthNumber && (
                <p className="text-xs text-destructive">
                  {errors.birthNumber.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Místo narození <span className="text-destructive">*</span>
              </Label>
              <Input {...register("birthPlace")} disabled={isDisabled} />
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
              <Input {...register("birthDistrict")} disabled={isDisabled} />
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
              <Input {...register("birthState")} disabled={isDisabled} />
              {errors.birthState && (
                <p className="text-xs text-destructive">
                  {errors.birthState.message as string}
                </p>
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
                disabled={isDisabled}
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
                <div className="pt-1">
                  <Input
                    {...register("citizenshipOther")}
                    placeholder="Vypište státní občanství"
                    disabled={isDisabled}
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
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">B. Adresa trvalého pobytu</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                Ulice <span className="text-destructive">*</span>
              </Label>
              <Input {...register("permanentStreet")} disabled={isDisabled} />
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
                disabled={isDisabled}
              />
              {errors.permanentHouseNumber && (
                <p className="text-xs text-destructive">
                  {errors.permanentHouseNumber.message as string}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Obec <span className="text-destructive">*</span>
              </Label>
              <Input {...register("permanentCity")} disabled={isDisabled} />
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
              <Input {...register("permanentPostcode")} disabled={isDisabled} />
              {errors.permanentPostcode && (
                <p className="text-xs text-destructive">
                  {errors.permanentPostcode.message as string}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            C. Děti (pro účely daňového zvýhodnění)
          </h2>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>
                Máte jedno nebo více dětí, na které uplatňujete daňové
                zvýhodnění? <span className="text-destructive">*</span>
              </Label>
              <YesNoToggle
                idPrefix="has-children"
                value={hasChildren}
                disabled={isDisabled}
                onChange={(next) =>
                  setValue("hasChildren", next, { shouldValidate: true })
                }
              />
              {errors.hasChildren && (
                <p className="text-xs text-destructive">
                  {errors.hasChildren.message as string}
                </p>
              )}
            </div>

            {hasChildren === true && (
              <>
                {errors.children?.message && (
                  <p className="text-xs text-destructive">
                    {errors.children.message as string}
                  </p>
                )}

                {childrenArray.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-3 rounded-md border p-3"
                  >
                    <p className="text-sm font-medium">{index + 1}. dítě</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>
                          Jméno dítěte{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          {...register(`children.${index}.childName` as const)}
                          placeholder="Jméno a příjmení"
                          disabled={isDisabled}
                        />
                        {errors.children?.[index]?.childName && (
                          <p className="text-xs text-destructive">
                            {
                              errors.children[index]?.childName
                                ?.message as string
                            }
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label>
                          Datum narození{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="date"
                          {...register(
                            `children.${index}.childBirthDate` as const
                          )}
                          disabled={isDisabled}
                        />
                        {errors.children?.[index]?.childBirthDate && (
                          <p className="text-xs text-destructive">
                            {
                              errors.children[index]?.childBirthDate
                                ?.message as string
                            }
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      {childrenArray.fields.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => childrenArray.remove(index)}
                          disabled={isDisabled}
                        >
                          Odebrat
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
                    childrenArray.append({ childName: "", childBirthDate: "" })
                  }
                  disabled={isDisabled}
                >
                  Přidat dítě
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">D. Zdravotní pojišťovna</h2>
          <p className="text-xs text-muted-foreground">
            Stvrzuji, že jsem ke dni nástupu do zaměstnání pojištěncem zdravotní
            pojišťovny:
          </p>
          <div className="space-y-1">
            <Label>
              Zdravotní pojišťovna <span className="text-destructive">*</span>
            </Label>
            <Select
              value={healthInsuranceCompany || ""}
              onValueChange={(value) =>
                setValue("healthInsuranceCompany", value, {
                  shouldValidate: true,
                })
              }
              disabled={isDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vyberte zdravotní pojišťovnu" />
              </SelectTrigger>
              <SelectContent>
                {HEALTH_INSURANCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.healthInsuranceCompany && (
              <p className="text-xs text-destructive">
                {errors.healthInsuranceCompany.message as string}
              </p>
            )}
            {healthInsuranceCompany === OTHER_HEALTH_INSURANCE_VALUE && (
              <div className="pt-1">
                <Input
                  {...register("healthInsuranceCompanyOther")}
                  placeholder="Vypište název zdravotní pojišťovny"
                  disabled={isDisabled}
                />
                {errors.healthInsuranceCompanyOther && (
                  <p className="text-xs text-destructive">
                    {errors.healthInsuranceCompanyOther.message as string}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-lg font-semibold">
            E. Zasílání platu/odměny na bankovní účet
          </h2>
          <p className="text-xs text-muted-foreground">
            Žádám s účinností od dne nástupu zasílat na tento bankovní účet:
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                Bankovní ústav <span className="text-destructive">*</span>
              </Label>
              <Select
                value={bankName || ""}
                onValueChange={(value) =>
                  setValue("bankName", value, { shouldValidate: true })
                }
                disabled={isDisabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte banku" />
                </SelectTrigger>
                <SelectContent>
                  {BANK_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.bankName && (
                <p className="text-xs text-destructive">
                  {errors.bankName.message as string}
                </p>
              )}
              {bankName === OTHER_BANK_VALUE && (
                <div className="pt-1">
                  <Input
                    {...register("bankNameOther")}
                    placeholder="Vypište název banky"
                    disabled={isDisabled}
                  />
                  {errors.bankNameOther && (
                    <p className="text-xs text-destructive">
                      {errors.bankNameOther.message as string}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>
                Číslo účtu <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("bankAccountNumber")}
                placeholder="např. 1234567890/0100"
                disabled={isDisabled}
              />
              {errors.bankAccountNumber && (
                <p className="text-xs text-destructive">
                  {errors.bankAccountNumber.message as string}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border-l-4 border-l-[#00847C] p-4">
          <h2 className="text-lg font-semibold">F. Prohlášení</h2>
          <p className="text-sm font-semibold text-foreground">
            Stvrzuji svým podpisem, že jsou výše uvedené údaje zcela pravdivé a
            případnou změnu jsem povinen včas osobně oznámit na oddělení platové
            a mzdové účtárny. Za způsobené škody nesu plnou odpovědnost.
          </p>

          <div className="space-y-2">
            <Label>
              Potvrzuji prohlášení <span className="text-destructive">*</span>
            </Label>
            <RadioGroup
              value={
                confirmTruthfulness === true
                  ? "yes"
                  : confirmTruthfulness === false
                    ? "no"
                    : ""
              }
              onValueChange={(value) =>
                setValue("confirmTruthfulness", value === "yes", {
                  shouldValidate: true,
                })
              }
              className="flex flex-col gap-2"
              disabled={isDisabled}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="truth-yes" value="yes" />
                <Label htmlFor="truth-yes">Ano, potvrzuji</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="truth-no" value="no" />
                <Label htmlFor="truth-no">Ne</Label>
              </div>
            </RadioGroup>
            {errors.confirmTruthfulness && (
              <p className="text-xs text-destructive">
                {errors.confirmTruthfulness.message as string}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Datum odeslání</Label>
            <p className="text-sm text-muted-foreground">
              Datum bude automaticky zaznamenáno při odeslání formuláře:{" "}
              <strong>{formatDateCz(today)}</strong>
            </p>
            <input type="hidden" {...register("signatureDate")} />
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
                ? "Odeslat formulář pro mzdovou agendu"
                : "Uložit úpravy"}
          </Button>
        </div>
      </form>
    </>
  )
}
