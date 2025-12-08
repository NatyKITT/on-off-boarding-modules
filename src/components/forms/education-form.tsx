"use client"

import * as React from "react"
import { useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import {
  EDUCATION_LEVEL_OPTIONS,
  STUDY_FORM_OPTIONS,
} from "@/types/education-options"

import { useToast } from "@/hooks/use-toast"
import {
  educationDocumentSchema,
  type EducationDocumentSchema,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type EducationFormBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
}

type EducationFormPublicProps = EducationFormBaseProps & {
  mode: "public"
  hash: string
  onSubmitted?: () => void
  onSubmitInternal?: never
}

type EducationFormInternalProps = EducationFormBaseProps & {
  mode: "internal"
  hash?: never
  onSubmitted?: never
  onSubmitInternal?: (data: EducationDocumentSchema) => Promise<void> | void
}

export type EducationFormProps =
  | EducationFormPublicProps
  | EducationFormInternalProps

type EducationEntry = EducationDocumentSchema["education"][number]

export function EducationForm(props: EducationFormProps) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    "filling" | "loading" | "completed" | "error"
  >("filling")
  const [resultModal, setResultModal] = React.useState<
    "success" | "error" | null
  >(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<EducationDocumentSchema>({
    resolver: zodResolver(educationDocumentSchema),
    defaultValues: (props.initialData as
      | EducationDocumentSchema
      | undefined) ?? {
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
    },
  })

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form

  const { fields, append, remove } = useFieldArray<
    EducationDocumentSchema,
    "education"
  >({
    control,
    name: "education",
  })

  const isCompleted = status === "completed"
  const isDisabled =
    status === "loading" ||
    (props.mode === "public" && isCompleted) ||
    props.readOnly === true

  const onSubmit = (values: EducationDocumentSchema) => {
    startTransition(async () => {
      setStatus("loading")
      try {
        if (props.mode === "public") {
          const res = await fetch(`/api/dokumenty/public/${props.hash}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: props.documentId,
              type: "EDUCATION",
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
              Přehled vzdělání uložen
            </DialogTitle>
            <DialogDescription>
              Přehled vzdělání byl úspěšně uložen.
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
        onSubmit={handleSubmit(onSubmit)}
        className="mx-auto w-full max-w-6xl space-y-6"
      >
        <section className="space-y-2 text-sm text-muted-foreground">
          <p>
            Vyplňte, prosím, údaje o Vašem dosavadním vzdělání. V případě
            potřeby přidejte další řádky.
          </p>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">Přehled vzdělání</h2>

          {fields.map((field, index) => (
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
                      { shouldValidate: true }
                    )
                  }
                  disabled={isDisabled}
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
                  disabled={isDisabled}
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
                    disabled={isDisabled}
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
                        { shouldValidate: true }
                      )
                    }
                    disabled={isDisabled}
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
                    disabled={isDisabled}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Druh zkoušky</Label>
                  <Input
                    {...register(`education.${index}.examType` as const)}
                    placeholder="maturita, státní zkouška…"
                    disabled={isDisabled}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={isDisabled}
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
              append({
                level: "ZAKLADNI",
                schoolType: "",
                semesters: "",
                studyForm: "DENNI",
                graduationYear: "",
                examType: "",
              } as EducationEntry)
            }
            disabled={isDisabled}
          >
            Přidat další řádek
          </Button>

          {errors.education?.message && (
            <p className="pt-2 text-xs text-destructive">
              {errors.education.message as string}
            </p>
          )}
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
