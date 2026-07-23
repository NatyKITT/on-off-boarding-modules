"use client"

import * as React from "react"
import { useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { useToast } from "@/hooks/use-toast"
import { EmployeeMeta } from "@/lib/employee-meta"
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

type PayrollInfoFormBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
  employeeMeta?: EmployeeMeta
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
    fullName: props.employeeMeta?.fullName ?? "",
    maidenName: "",
    birthPlace: "",
    birthNumber: "",
    birthDay: "",
    birthMonth: "",
    birthYear: "",
    maritalStatus: "UNSTATED",

    permanentStreet: "",
    permanentHouseNumber: "",
    permanentCity: "",
    permanentPostcode: "",

    children: [{ childName: "", childBirthDate: "" }],

    healthInsuranceCompany: "",

    bankAccountNumber: "",
    bankName: "",

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
    formState: { errors },
  } = form

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
            : "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte HR."
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
                "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte své HR oddělení."}
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
              <h1 className="text-2xl font-semibold text-foreground">
                Nástup zaměstnance do pracovního poměru
              </h1>
              <p className="text-xs">
                (nezbytné zákonné údaje pro vedení mzdové agendy)
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/Logo_Praha%206.svg"
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
          <h2 className="text-base font-medium">Základní údaje zaměstnance</h2>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                Jméno a příjmení zaměstnance{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input {...register("fullName")} disabled={isDisabled} />
              {errors.fullName && (
                <p className="text-xs text-destructive">
                  {errors.fullName.message as string}
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Rodné příjmení</Label>
                <p className="text-xs text-muted-foreground">
                  Vyplňte, pokud se vaše rodné příjmení liší od současného.
                </p>
                <Input {...register("maidenName")} disabled={isDisabled} />
                {errors.maidenName && (
                  <p className="text-xs text-destructive">
                    {errors.maidenName.message as string}
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
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Rodné číslo</Label>
                <Input
                  {...register("birthNumber")}
                  placeholder="např. 900101/1234"
                  disabled={isDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Cizinci, kteří nemají přiděleno rodné číslo, ponechají toto
                  pole prázdné a vyplní pouze datum narození níže.
                </p>
                {errors.birthNumber && (
                  <p className="text-xs text-destructive">
                    {errors.birthNumber.message as string}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>
                  Datum narození <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Input
                      {...register("birthDay")}
                      placeholder="Den"
                      maxLength={2}
                      disabled={isDisabled}
                    />
                    {errors.birthDay && (
                      <p className="text-xs text-destructive">
                        {errors.birthDay.message as string}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Input
                      {...register("birthMonth")}
                      placeholder="Měsíc"
                      maxLength={2}
                      disabled={isDisabled}
                    />
                    {errors.birthMonth && (
                      <p className="text-xs text-destructive">
                        {errors.birthMonth.message as string}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Input
                      {...register("birthYear")}
                      placeholder="Rok"
                      maxLength={4}
                      disabled={isDisabled}
                    />
                    {errors.birthYear && (
                      <p className="text-xs text-destructive">
                        {errors.birthYear.message as string}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>
                Rodinný stav <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Vyplňte dle skutečnosti. Pokud nechcete uvádět, ponechte možnost
                „Neuvádím“.
              </p>
              <Select
                value={watch("maritalStatus")}
                onValueChange={(val) =>
                  setValue(
                    "maritalStatus",
                    val as PayrollInfoSchema["maritalStatus"],
                    { shouldValidate: true }
                  )
                }
                disabled={isDisabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">Svobodný/á</SelectItem>
                  <SelectItem value="MARRIED">Vdaná / ženatý</SelectItem>
                  <SelectItem value="DIVORCED">Rozvedený/á</SelectItem>
                  <SelectItem value="WIDOWED">Vdova / vdovec</SelectItem>
                  <SelectItem value="REGISTERED">
                    Registrované partnerství
                  </SelectItem>
                  <SelectItem value="UNSTATED">Neuvádím</SelectItem>
                </SelectContent>
              </Select>
              {errors.maritalStatus && (
                <p className="text-xs text-destructive">
                  {errors.maritalStatus.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium">Trvalé bydliště</h3>
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
                <Input
                  {...register("permanentPostcode")}
                  disabled={isDisabled}
                />
                {errors.permanentPostcode && (
                  <p className="text-xs text-destructive">
                    {errors.permanentPostcode.message as string}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-medium">
              Jméno dětí a datum narození (pro účely daňového zvýhodnění)
            </h3>
            <p className="text-xs text-muted-foreground">
              Vyplňte, pokud máte děti, na které uplatňujete daňové zvýhodnění.
            </p>

            {childrenArray.fields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-md border p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Jméno dítěte {index + 1}</Label>
                    <Input
                      {...register(`children.${index}.childName` as const)}
                      placeholder="Jméno a příjmení"
                      disabled={isDisabled}
                    />
                    {errors.children?.[index]?.childName && (
                      <p className="text-xs text-destructive">
                        {errors.children[index]?.childName?.message as string}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Datum narození {index + 1}</Label>
                    <Input
                      type="date"
                      {...register(`children.${index}.childBirthDate` as const)}
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

            {errors.children?.message && (
              <p className="text-xs text-destructive">
                {errors.children.message as string}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-base font-medium">Zdravotní pojišťovna</h2>
          <p className="text-xs text-muted-foreground">
            Stvrzuji, že jsem ke dni nástupu do zaměstnání pojištěncem zdravotní
            pojišťovny:
          </p>
          <div className="space-y-1">
            <Label>
              Název zdravotní pojišťovny{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              {...register("healthInsuranceCompany")}
              placeholder="např. Všeobecná zdravotní pojišťovna"
              disabled={isDisabled}
            />
            {errors.healthInsuranceCompany && (
              <p className="text-xs text-destructive">
                {errors.healthInsuranceCompany.message as string}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Zasílání platu/odměny na bankovní účet
          </h2>
          <p className="text-xs text-muted-foreground">
            Žádám s účinností od dne nástupu zasílat na tento bankovní účet:
          </p>

          <div className="grid gap-3 md:grid-cols-2">
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
            <div className="space-y-1">
              <Label>
                Bankovní ústav <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("bankName")}
                placeholder="např. Komerční banka"
                disabled={isDisabled}
              />
              {errors.bankName && (
                <p className="text-xs text-destructive">
                  {errors.bankName.message as string}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">Prohlášení</h2>
          <p className="text-xs text-muted-foreground">
            Stvrzuji svým podpisem, že jsou výše uvedené údaje zcela pravdivé a
            případnou změnu jsem povinen včas osobně oznámit ve mzdové účtárně.
            Za způsobené škody nesu plnou odpovědnost.
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
          <Button type="submit" disabled={isPending || isDisabled}>
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
