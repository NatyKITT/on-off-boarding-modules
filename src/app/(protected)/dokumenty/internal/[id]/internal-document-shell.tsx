"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { DocumentStatus, EmploymentDocumentType } from "@prisma/client"
import { AlertCircle, CheckCircle, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AffidavitForm } from "@/components/forms/affidavit-form"
import { EducationForm } from "@/components/forms/education-form"
import { ExperienceForm } from "@/components/forms/experience-form"
import { PersonalQuestionnaireForm } from "@/components/forms/personal-questionnaire-form"

type InternalDocument = {
  id: number
  type: EmploymentDocumentType
  status: DocumentStatus
  isLocked: boolean
  data: unknown
  onboarding?: {
    name: string | null
    surname: string | null
  } | null
}

type Props = {
  document: InternalDocument
}

export function InternalDocumentShell({ document }: Props) {
  const [doc, setDoc] = useState(document)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultModal, setResultModal] = useState<"success" | "error" | null>(
    null
  )

  const router = useRouter()

  const employeeName = `${doc.onboarding?.name ?? ""} ${
    doc.onboarding?.surname ?? ""
  }`.trim()

  const readOnly = doc.isLocked

  async function handleSave(data: unknown) {
    if (readOnly) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/dokumenty/internal/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(
          j?.message ??
            "Uložení dokumentu se nezdařilo. Zkuste to prosím znovu."
        )
      }

      const json = (await res.json()) as {
        id: number
        status: DocumentStatus
        completedAt: string | null
      }

      setDoc((prev) => ({
        ...prev,
        data,
        status: json.status ?? prev.status,
      }))

      setResultModal("success")
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Uložení dokumentu se nezdařilo. Zkuste to prosím znovu."
      )
      setResultModal("error")
    } finally {
      setSaving(false)
    }
  }

  function renderForm() {
    const commonProps = {
      documentId: doc.id,
      mode: "internal" as const,
      initialData: doc.data,
      readOnly,
      onSubmitInternal: handleSave,
    }

    switch (doc.type) {
      case "AFFIDAVIT":
        return <AffidavitForm {...commonProps} />
      case "EDUCATION":
        return <EducationForm {...commonProps} />
      case "EXPERIENCE":
        return <ExperienceForm {...commonProps} />
      case "PERSONAL_QUESTIONNAIRE":
        return <PersonalQuestionnaireForm {...commonProps} />
      default:
        return (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="size-4" />
            Tento typ dokumentu zatím není pro interní editaci podporován.
          </div>
        )
    }
  }

  return (
    <div className="space-y-4">
      <Dialog
        open={resultModal === "success"}
        onOpenChange={(open) => !open && setResultModal(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CheckCircle className="size-5 text-emerald-500" />
              Dokument uložen
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Údaje byly úspěšně uloženy. Můžete dokument vytisknout nebo se
            vrátit zpět na přehled dokumentů.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResultModal(null)}
            >
              Zavřít
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setResultModal(null)
                router.back()
              }}
            >
              Zpět na dokumenty
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resultModal === "error"}
        onOpenChange={(open) => !open && setResultModal(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="size-5 text-red-500" />
              Chyba při ukládání
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {error ??
              "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte IT/HR."}
          </p>
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => setResultModal(null)}>
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">
          {employeeName ? `${employeeName} – ` : ""}
          Interní dokument
        </h1>
        <p className="text-sm text-muted-foreground">
          Zde vidíte formulář tak, jak ho vyplnil zaměstnanec. V případě potřeby
          ho můžete upravit a uložit.
        </p>

        {readOnly && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <Lock className="size-3" />
            Dokument je uzamčený. Pro úpravy ho nejprve odemkněte v seznamu
            dokumentů.
          </div>
        )}

        {doc.status !== "DRAFT" && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle className="size-3" />
            Stav: {doc.status}
          </div>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </header>

      <div className="pb-8">{renderForm()}</div>

      <div className="flex justify-between gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={saving}
        >
          Zpět na dokumenty
        </Button>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(
                `/api/dokumenty/internal/${doc.id}/pdf`,
                "_blank",
                "noopener,noreferrer"
              )
            }
            disabled={saving}
          >
            Otevřít PDF k tisku
          </Button>
        </div>
      </div>
    </div>
  )
}
