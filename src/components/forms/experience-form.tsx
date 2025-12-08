"use client"

import * as React from "react"
import { useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle, XCircle } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"

import { useToast } from "@/hooks/use-toast"
import {
  experienceDocumentSchema,
  type ExperienceDocumentSchema,
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

type ExperienceFormBaseProps = {
  documentId: number
  initialData?: unknown
  readOnly?: boolean
}

type ExperienceFormPublicProps = ExperienceFormBaseProps & {
  mode: "public"
  hash: string
  onSubmitted?: () => void
  onSubmitInternal?: never
}

type ExperienceFormInternalProps = ExperienceFormBaseProps & {
  mode: "internal"
  hash?: never
  onSubmitted?: never
  onSubmitInternal?: (data: ExperienceDocumentSchema) => Promise<void> | void
}

export type ExperienceFormProps =
  | ExperienceFormPublicProps
  | ExperienceFormInternalProps

type ExperienceEntry = ExperienceDocumentSchema["experience"][number]

export function ExperienceForm(props: ExperienceFormProps) {
  const { toast } = useToast()
  const [status, setStatus] = React.useState<
    "filling" | "loading" | "completed" | "error"
  >("filling")
  const [resultModal, setResultModal] = React.useState<
    "success" | "error" | null
  >(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<ExperienceDocumentSchema>({
    resolver: zodResolver(experienceDocumentSchema),
    defaultValues: (props.initialData as
      | ExperienceDocumentSchema
      | undefined) ?? {
      experience: [
        {
          employer: "",
          jobType: "",
          from: "",
          to: "",
        },
      ],
    },
  })

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = form

  const { fields, append, remove } = useFieldArray<
    ExperienceDocumentSchema,
    "experience"
  >({
    control,
    name: "experience",
  })

  const isCompleted = status === "completed"
  const isDisabled =
    status === "loading" ||
    (props.mode === "public" && isCompleted) ||
    props.readOnly === true

  const onSubmit = (values: ExperienceDocumentSchema) => {
    startTransition(async () => {
      setStatus("loading")
      try {
        if (props.mode === "public") {
          const res = await fetch(`/api/dokumenty/public/${props.hash}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              documentId: props.documentId,
              type: "EXPERIENCE",
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
              Přehled praxe uložen
            </DialogTitle>
            <DialogDescription>
              Přehled praxe byl úspěšně uložen.
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
            Uveďte dosavadní pracovní zkušenosti. V případě potřeby přidejte
            další řádky.
          </p>
        </section>

        <section className="space-y-3 rounded-md border p-4">
          <h2 className="text-sm font-medium">Praxe</h2>

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="mt-3 space-y-3 rounded-md border bg-muted/30 p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>
                    Zaměstnavatel <span className="text-destructive">*</span>
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
                employer: "",
                jobType: "",
                from: "",
                to: "",
              } as ExperienceEntry)
            }
            disabled={isDisabled}
          >
            Přidat další řádek
          </Button>

          {errors.experience?.message && (
            <p className="pt-2 text-xs text-destructive">
              {errors.experience.message as string}
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
