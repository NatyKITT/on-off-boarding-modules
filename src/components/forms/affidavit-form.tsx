"use client"

import * as React from "react"
import { useTransition } from "react"
import Image from "next/image"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { useToast } from "@/hooks/use-toast"
import {
  affidavitSchema,
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

type AffidavitFormBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
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

export function AffidavitForm(props: AffidavitFormProps) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    "filling" | "loading" | "completed" | "error"
  >("filling")
  const [resultModal, setResultModal] = React.useState<
    "success" | "error" | null
  >(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<AffidavitSchema>({
    resolver: zodResolver(affidavitSchema),
    defaultValues: (props.initialData as AffidavitSchema | undefined) ?? {
      militaryService: "NONE",
      maternityParental: [
        { childName: "", childBirthDate: "", from: "", to: "" },
      ],
      continuousCare: [{ childName: "", childBirthDate: "", from: "", to: "" }],
      disabledChildCare: [
        { childName: "", childBirthDate: "", from: "", to: "" },
      ],
      unpaidLeave: [{ reason: "", from: "", to: "" }],
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = form

  const militaryService = watch("militaryService")
  const isTruthful = watch("isTruthful") as boolean | undefined

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
  const unpaidArray = useFieldArray<AffidavitSchema, "unpaidLeave">({
    control,
    name: "unpaidLeave",
  })

  const isCompleted = status === "completed"
  const isDisabled =
    status === "loading" ||
    (props.mode === "public" && isCompleted) ||
    props.readOnly === true

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
            throw new Error(await res.text())
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
              Dokument uložen
            </DialogTitle>
            <DialogDescription>
              Čestné prohlášení bylo úspěšně uloženo.
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
        className="mx-auto max-w-3xl space-y-6"
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
              Čestné prohlášení
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
        </header>

        <section className="space-y-2 rounded-md border p-4">
          <h2 className="text-sm font-medium">
            Výkon základní – náhradní – civilní vojenské služby
          </h2>
          <p className="text-xs text-muted-foreground">
            (zák. 18/1992 Sb. o civilní službě)
          </p>

          <div className="mt-3 space-y-1">
            <Label>
              Druh <span className="text-destructive">*</span>
            </Label>
            <Select
              value={militaryService}
              onValueChange={(value) =>
                setValue(
                  "militaryService",
                  value as AffidavitSchema["militaryService"],
                  { shouldValidate: true }
                )
              }
              disabled={isDisabled}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Vyberte možnost" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">není</SelectItem>
                <SelectItem value="BASIC">základní</SelectItem>
                <SelectItem value="ALTERNATIVE">náhradní</SelectItem>
                <SelectItem value="CIVIL">civilní</SelectItem>
              </SelectContent>
            </Select>
            {errors.militaryService && (
              <p className="text-xs text-destructive">
                {errors.militaryService.message as string}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">
            Doba mateřské dovolené a rodičovské dovolené
          </h2>
          <p className="text-xs text-muted-foreground">
            včetně doby péče o dítě do 4 let jeho věku za podmínky nároku na
            rodičovský příspěvek, avšak za podmínky, že současně neprobíhala s
            přípravou na povolání v denním/prezenčním studiu
          </p>

          {maternityArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 grid gap-3 md:grid-cols-4 md:items-end"
            >
              <div className="space-y-1 md:col-span-2">
                <Label>Jméno a příjmení dítěte {idx + 1}</Label>
                <Input
                  {...register(`maternityParental.${idx}.childName` as const)}
                  placeholder="Jméno a příjmení"
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Datum narození dítěte {idx + 1}</Label>
                <Input
                  type="date"
                  {...register(
                    `maternityParental.${idx}.childBirthDate` as const
                  )}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Od (dítě {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`maternityParental.${idx}.from` as const)}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Do (dítě {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`maternityParental.${idx}.to` as const)}
                  disabled={isDisabled}
                />
              </div>
              {maternityArray.fields.length > 1 && (
                <div className="flex justify-end md:col-span-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => maternityArray.remove(idx)}
                    disabled={isDisabled}
                  >
                    Odebrat záznam
                  </Button>
                </div>
              )}
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
            Přidat další záznam
          </Button>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">
            Doba trvalé péče o dítě nebo děti
          </h2>
          <p className="text-xs text-muted-foreground">
            pokud tato péče neprobíhala současně s přípravou na povolání v
            denním/prezenčním studiu
          </p>

          {continuousArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 grid gap-3 md:grid-cols-4 md:items-end"
            >
              <div className="space-y-1 md:col-span-2">
                <Label>Jméno a příjmení dítěte {idx + 1}</Label>
                <Input
                  {...register(`continuousCare.${idx}.childName` as const)}
                  placeholder="Jméno a příjmení"
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Datum narození dítěte {idx + 1}</Label>
                <Input
                  type="date"
                  {...register(`continuousCare.${idx}.childBirthDate` as const)}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Od (dítě {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`continuousCare.${idx}.from` as const)}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Do (dítě {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`continuousCare.${idx}.to` as const)}
                  disabled={isDisabled}
                />
              </div>
              {continuousArray.fields.length > 1 && (
                <div className="flex justify-end md:col-span-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => continuousArray.remove(idx)}
                    disabled={isDisabled}
                  >
                    Odebrat záznam
                  </Button>
                </div>
              )}
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
            Přidat další záznam
          </Button>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">
            Doba osobní péče o dlouhodobě těžce zdravotně postižené nezletilé
            dítě
          </h2>
          <p className="text-xs text-muted-foreground">
            které vyžadovalo mimořádnou péči, pokud nebylo umístěno v ústavu pro
            takové děti
          </p>

          {disabledArray.fields.map((field, idx) => (
            <div
              key={field.id}
              className="mt-3 grid gap-3 md:grid-cols-4 md:items-end"
            >
              <div className="space-y-1 md:col-span-2">
                <Label>Jméno a příjmení dítěte {idx + 1}</Label>
                <Input
                  {...register(`disabledChildCare.${idx}.childName` as const)}
                  placeholder="Jméno a příjmení"
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Datum narození dítěte {idx + 1}</Label>
                <Input
                  type="date"
                  {...register(
                    `disabledChildCare.${idx}.childBirthDate` as const
                  )}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Od (dítě {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`disabledChildCare.${idx}.from` as const)}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Do (dítě {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`disabledChildCare.${idx}.to` as const)}
                  disabled={isDisabled}
                />
              </div>
              {disabledArray.fields.length > 1 && (
                <div className="flex justify-end md:col-span-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => disabledArray.remove(idx)}
                    disabled={isDisabled}
                  >
                    Odebrat záznam
                  </Button>
                </div>
              )}
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
            Přidat další záznam
          </Button>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">
            Pracovní volno bez náhrady platu/mzdy
          </h2>
          <p className="text-xs text-muted-foreground">
            např. následování manžela do ciziny, péče o dítě bez nároku na
            příspěvek
          </p>

          {unpaidArray.fields.map((field, idx) => (
            <div key={field.id} className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label>Důvod (případ {idx + 1})</Label>
                <Input
                  {...register(`unpaidLeave.${idx}.reason` as const)}
                  placeholder="Důvod"
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Od (případ {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`unpaidLeave.${idx}.from` as const)}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-1">
                <Label>Do (případ {idx + 1})</Label>
                <Input
                  type="date"
                  {...register(`unpaidLeave.${idx}.to` as const)}
                  disabled={isDisabled}
                />
              </div>

              {unpaidArray.fields.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => unpaidArray.remove(idx)}
                    disabled={isDisabled}
                  >
                    Odebrat záznam
                  </Button>
                </div>
              )}
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
            Přidat další záznam
          </Button>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">Čestné prohlášení</h2>
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
