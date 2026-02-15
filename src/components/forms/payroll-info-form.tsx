"use client"

import * as React from "react"
import { useTransition } from "react"
import Image from "next/image"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { useToast } from "@/hooks/use-toast"
import { EmployeeMeta } from "@/lib/employee-meta"
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
  const [isPending, startTransition] = useTransition()

  const today = React.useMemo(() => todayIso(), [])

  const form = useForm<PayrollInfoSchema, unknown, PayrollInfoSchema>({
    mode: "onChange",
    resolver: zodResolver(
      payrollInfoSchema
    ) as import("react-hook-form").Resolver<
      PayrollInfoSchema,
      unknown,
      PayrollInfoSchema
    >,
    defaultValues: (props.initialData as PayrollInfoSchema | undefined) ?? {
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

      children: [],

      healthInsuranceCompany: "",

      bankAccountNumber: "",
      bankName: "",

      confirmTruthfulness: undefined,
      signatureDate: today,
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = form

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
            throw new Error(await res.text())
          }

          setStatus("completed")
          setResultModal("success")
          props.onSubmitted?.()
        } else {
          await props.onSubmitInternal?.(finalValues)
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
              Dokument uložen
            </DialogTitle>
            <DialogDescription>
              Formulář pro mzdovou agendu byl úspěšně uložen.
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
              Nástup zaměstnance do pracovního poměru
            </h1>
            <p className="text-xs">
              (nezbytné zákonné údaje pro vedení mzdové agendy)
            </p>
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
          <h2 className="text-sm font-medium">Základní údaje zaměstnance</h2>

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
                <Label>
                  Rodné příjmení <span className="text-destructive">*</span>
                </Label>
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

            {childrenArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-md border bg-muted/30 p-3"
              >
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
          <h2 className="text-sm font-medium">Zdravotní pojišťovna</h2>
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
          <h2 className="text-sm font-medium">
            Zasílání platu/odměny na bankovní účet
          </h2>
          <p className="text-xs text-muted-foreground">
            Žádám s účinností od dne nástupu na bankovní účet:
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
          <h2 className="text-sm font-medium">Prohlášení</h2>
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
