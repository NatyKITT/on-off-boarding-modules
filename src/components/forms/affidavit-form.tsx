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
  affidavitSchema,
  experienceTypeEnum,
  type AffidavitSchema,
} from "@/lib/validations/employment-documents"

import { Button } from "@/components/ui/button"
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
      jobType: "",
      employmentType: undefined,
      from: "",
      to: "",
      ongoing: false,
    },
  ],
  militaryService: [{ service: undefined, from: "", to: "", ongoing: false }],
  maternityParental: [{ childName: "", childBirthDate: "", from: "", to: "" }],
  continuousCare: [{ childName: "", childBirthDate: "", from: "", to: "" }],
  disabledChildCare: [{ childName: "", childBirthDate: "", from: "", to: "" }],
  closeRelativeCare: [
    { personName: "", dependencyLevel: undefined, from: "", to: "" },
  ],
  doctoralStudy: [{ schoolName: "", studyProgram: "", from: "", to: "" }],
  unpaidLeave: [{ reason: "", from: "", to: "" }],
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
    defaultValues: {
      ...baseDefaultValues,
      ...(props.initialData as Partial<AffidavitSchema> | undefined),
    },
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
            <h1 className="text-2xl font-semibold text-foreground">
              Česté prohlášení
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/Logo_Praha%206.svg"
              alt="Městská část Praha 6"
              width={76}
              height={86}
            />
          </div>
          <p>Važena paní, važený pane,</p>
          <p>
            dovolujeme si Vás požádat o vyplnění následujícich údajů pro účely
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
          <br />
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
            zejména zákonem č. 262/2006 Sb., zákoník práce, ve znění pozdějších
            předpisů, nařízením vlády č. 341/2017 Sb., o platových poměrech
            zaměstnanců ve veřejných službách a správě a nařízením vlády č.
            222/2010 Sb., o katalogu prací ve veřejných službách a správě.
          </p>
          <p>
            V souladu s uvedenými právními předpisy a na základě příkazu
            tajemníka č. 3/2025 dále prohlašuji, že všechny níže specifikované
            pracovní činnosti (druh práce), které jsem vykonával/a od prvního
            dne výkonu práce, uvádím pravdivě a úplně za účelem správného
            zařazení do příslušné platové třídy a platového stupně.
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
          <h2 className="text-base font-medium">
            Praxe <span className="text-destructive">*</span>
          </h2>

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="no-experience"
              checked={noExperience}
              onCheckedChange={(checked) =>
                setValue("noExperience", checked === true, {
                  shouldValidate: true,
                })
              }
              disabled={isDisabled}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="no-experience"
                className="cursor-pointer font-normal leading-snug"
              >
                Nemám žádnou praxi (jsem např. čerstvě po škole nebo jiné)
              </Label>
              <p className="text-xs text-muted-foreground">
                Zaškrtněte pokud ještě nemáte žádnou pracovní zkušenost.
              </p>
            </div>
          </div>

          {noExperience && (
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
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>
                      Zaměstnavatel <span className="text-destructive">*</span>{" "}
                      <span className="text-muted-foreground">[1]</span>
                    </Label>
                    <Input
                      {...register(`experience.${index}.employer` as const)}
                      placeholder="např. ÚMČ Praha 6"
                      disabled={isDisabled}
                    />
                    {errors.experience?.[index]?.employer && (
                      <p className="text-xs text-destructive">
                        {errors.experience[index]?.employer?.message as string}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>
                      Druh práce (pracovní činnost){" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...register(`experience.${index}.jobType` as const)}
                      placeholder="např. referent IT"
                      disabled={isDisabled}
                    />
                    {errors.experience?.[index]?.jobType && (
                      <p className="text-xs text-destructive">
                        {errors.experience[index]?.jobType?.message as string}
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
                    <SelectTrigger className="w-full max-w-xs">
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
                    <Label>Do</Label>
                    <Input
                      type="date"
                      {...register(`experience.${index}.to` as const)}
                      disabled={
                        isDisabled || form.watch(`experience.${index}.ongoing`)
                      }
                    />
                    {errors.experience?.[index]?.to && (
                      <p className="text-xs text-destructive">
                        {errors.experience[index]?.to?.message as string}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id={`experience-ongoing-${index}`}
                        checked={
                          form.watch(`experience.${index}.ongoing`) === true
                        }
                        onCheckedChange={(checked) => {
                          setValue(
                            `experience.${index}.ongoing` as const,
                            checked === true,
                            { shouldValidate: true }
                          )
                          if (checked === true) {
                            setValue(`experience.${index}.to` as const, "", {
                              shouldValidate: true,
                            })
                          }
                        }}
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor={`experience-ongoing-${index}`}
                        className="cursor-pointer font-normal"
                      >
                        Stále trvá
                      </Label>
                    </div>
                  </div>
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
                  jobType: "",
                  employmentType: undefined,
                  from: "",
                  to: "",
                  ongoing: false,
                } as ExperienceEntry)
              }
              disabled={isDisabled}
            >
              Přidat další řádek
            </Button>
          )}

          {!noExperience && (
            <p className="pt-2 text-xs text-muted-foreground">
              [1] Uveďte prosím rovněž zkratku u soustavné činnosti provozované
              samostatně jako živnost (OSVČ) nebo výkonu práce na základě dohody
              o provedení práce (DPP) nebo dohody o pracovní činnosti (DPČ) a
              rozsah práce – např. 10 dnů/měs., denně apod.
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Výkon vojenské základní (náhradní) služby nebo civilní služby{" "}
            <span className="text-muted-foreground">[1]</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Vyplňte jen pokud jste vojenskou nebo civilní službu podstoupili.
          </p>

          {militaryArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="space-y-1">
                <Label>Druh služby</Label>
                <Select
                  value={
                    form.watch(`militaryService.${idx}.service` as const) ?? ""
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
                  <SelectTrigger className="w-full max-w-xs">
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
                    {errors.militaryService[idx]?.service?.message as string}
                  </p>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Od</Label>
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
                  <Label>Do</Label>
                  <Input
                    type="date"
                    {...register(`militaryService.${idx}.to` as const)}
                    disabled={
                      isDisabled || form.watch(`militaryService.${idx}.ongoing`)
                    }
                  />
                  {errors.militaryService?.[idx]?.to && (
                    <p className="text-xs text-destructive">
                      {errors.militaryService[idx]?.to?.message as string}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id={`military-ongoing-${idx}`}
                      checked={
                        form.watch(`militaryService.${idx}.ongoing`) === true
                      }
                      onCheckedChange={(checked) => {
                        setValue(
                          `militaryService.${idx}.ongoing` as const,
                          checked === true,
                          { shouldValidate: true }
                        )
                        if (checked === true) {
                          setValue(`militaryService.${idx}.to` as const, "", {
                            shouldValidate: true,
                          })
                        }
                      }}
                      disabled={isDisabled}
                    />
                    <Label
                      htmlFor={`military-ongoing-${idx}`}
                      className="cursor-pointer font-normal"
                    >
                      Stále trvá
                    </Label>
                  </div>
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
                ongoing: false,
              } as MilitaryEntry)
            }
            disabled={isDisabled}
          >
            Přidat záznam
          </Button>

          <p className="pt-2 text-xs text-muted-foreground">
            [1] dle § 4 odst. 4 nařízení vlády č. 341/2017 Sb.
          </p>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Pracovní volno bez náhrady platu/mzdy
          </h2>
          <p className="text-xs text-muted-foreground">
            např. následování manžela do ciziny, péče o dítě bez nároku na
            příspěvek. Vyplňte, pokud se Vás tyto údaje týkají.
          </p>

          {unpaidArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="space-y-1">
                <Label>Důvod</Label>
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
                  <Label>Od</Label>
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
                  <Label>Do</Label>
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
            onClick={() => unpaidArray.append({ reason: "", from: "", to: "" })}
            disabled={isDisabled}
          >
            Přidat záznam
          </Button>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Doba skutečného čerpání mateřské dovolené, další mateřské dovolené
            nebo rodičovské dovolené
          </h2>
          <p className="text-xs text-muted-foreground">
            včetně doby péče o dítě do 4 let jeho věku za podmínky nároku na
            rodičovský příspěvek, avšak za podmínky, že současně neprobíhala s
            přípravou na povolání v denním/prezenčním studiu. Vyplňte, pokud se
            Vás tyto údaje týkají.
          </p>

          {maternityArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Jméno a příjmení dítěte</Label>
                  <Input
                    {...register(`maternityParental.${idx}.childName` as const)}
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
                  <Label>Datum narození dítěte</Label>
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
                  <Label>Od</Label>
                  <Input
                    type="date"
                    {...register(`maternityParental.${idx}.from` as const)}
                    disabled={isDisabled}
                  />
                  {errors.maternityParental?.[idx]?.from && (
                    <p className="text-xs text-destructive">
                      {errors.maternityParental[idx]?.from?.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Do</Label>
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
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Doba trvalé péče o dítě nebo děti
          </h2>
          <p className="text-xs text-muted-foreground">
            pokud tato péče neprobíhala současně s přípravou na povolání v
            denním/prezenčním studiu. Vyplňte, pokud se Vás tyto údaje týkají.
          </p>

          {continuousArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Jméno a příjmení dítěte</Label>
                  <Input
                    {...register(`continuousCare.${idx}.childName` as const)}
                    placeholder="Jméno a příjmení"
                    disabled={isDisabled}
                  />
                  {errors.continuousCare?.[idx]?.childName && (
                    <p className="text-xs text-destructive">
                      {errors.continuousCare[idx]?.childName?.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Datum narození dítěte</Label>
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
                  <Label>Od</Label>
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
                  <Label>Do</Label>
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
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Doba osobní péče o dlouhodobě těžce zdravotně postižené nezletilé
            dítě
          </h2>
          <p className="text-xs text-muted-foreground">
            které vyžadovalo mimořádnou péči, pokud nebylo umístěno v ústavu pro
            takové děti, pokud tato péče neprobíhala současně s přípravou na
            povolání v denním/prezenčním studiu. Vyplňte, pokud se Vás tyto
            údaje týkají.
          </p>

          {disabledArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Jméno a příjmení dítěte</Label>
                  <Input
                    {...register(`disabledChildCare.${idx}.childName` as const)}
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
                  <Label>Datum narození dítěte</Label>
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
                  <Label>Od</Label>
                  <Input
                    type="date"
                    {...register(`disabledChildCare.${idx}.from` as const)}
                    disabled={isDisabled}
                  />
                  {errors.disabledChildCare?.[idx]?.from && (
                    <p className="text-xs text-destructive">
                      {errors.disabledChildCare[idx]?.from?.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Do</Label>
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
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Doba péče o osobu blízkou podle § 22 odst. 1 občanského zákoníku{" "}
            <span className="text-muted-foreground">[1]</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            která je závislá na pomoci jiné osoby ve stupni III (těžká
            závislost) nebo ve stupni IV (úplná závislost) podle § 8 zákona o
            sociálních službách <span>[2]</span>. Vyplňte, pokud se Vás tyto
            údaje týkají.
          </p>

          {closeRelativeArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Jméno a příjmení osoby</Label>
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
                  <Label>Stupeň závislosti</Label>
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
                      <SelectItem value="III">III – těžká závislost</SelectItem>
                      <SelectItem value="IV">IV – úplná závislost</SelectItem>
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
                  <Label>Od</Label>
                  <Input
                    type="date"
                    {...register(`closeRelativeCare.${idx}.from` as const)}
                    disabled={isDisabled}
                  />
                  {errors.closeRelativeCare?.[idx]?.from && (
                    <p className="text-xs text-destructive">
                      {errors.closeRelativeCare[idx]?.from?.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Do</Label>
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

          <div className="pt-2 text-xs text-muted-foreground">
            <p>
              [1] zákon č. 89/2012 Sb., občanský zákoník, ve znění pozdějších
              předpisů
            </p>
            <p>
              [2] zákon č. 108/2006 Sb., o sociálních službách, ve znění
              pozdějších předpisů
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">
            Doba řádně ukončeného studia v doktorském studijním programu podle §
            47 zákona o vysokých školách{" "}
            <span className="text-muted-foreground">[1]</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Vyplňte, pokud se Vás tyto údaje týkají.
          </p>

          {doctoralArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Název vysoké školy</Label>
                  <Input
                    {...register(`doctoralStudy.${idx}.schoolName` as const)}
                    placeholder="např. Vysoká škola ekonomická v Praha"
                    disabled={isDisabled}
                  />
                  {errors.doctoralStudy?.[idx]?.schoolName && (
                    <p className="text-xs text-destructive">
                      {errors.doctoralStudy[idx]?.schoolName?.message as string}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Studijní program</Label>
                  <Input
                    {...register(`doctoralStudy.${idx}.studyProgram` as const)}
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
                  <Label>Od</Label>
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
                  <Label>Do</Label>
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

          <p className="pt-2 text-xs text-muted-foreground">
            [1] zákon č. 111/1998 Sb., o vysokých školách a o změně a doplnění
            dalších zákonů, ve znění pozdějších předpisů
          </p>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-medium">Čestné prohlášení</h2>
          <p className="text-xs text-muted-foreground">
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
          <Button type="submit" disabled={isPending || isDisabled}>
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
