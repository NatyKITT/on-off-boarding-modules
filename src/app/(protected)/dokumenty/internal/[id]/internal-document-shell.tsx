"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { DocumentStatus, EmploymentDocumentType } from "@prisma/client"
import { AlertCircle, CheckCircle, Lock, Pencil } from "lucide-react"

import { buildEmployeeMeta } from "@/lib/employee-meta"
import { ServerValidationError } from "@/lib/server-validation-error"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AffidavitForm } from "@/components/forms/affidavit-form"
import { PayrollInfoForm } from "@/components/forms/payroll-info-form"
import { PersonalQuestionnaireForm } from "@/components/forms/personal-questionnaire-form"

type OnboardingMeta = {
  id: number
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  department: string
  unitName: string
  positionName: string
}

type InternalDocument = {
  id: number
  type: EmploymentDocumentType
  status: DocumentStatus
  isLocked: boolean
  data: unknown
  createdAt?: Date | string
  completedAt?: Date | string | null
  lastEditedBy?: string | null
  lastEditedAt?: Date | string | null
  lastEditSummary?: string | null
  onboarding?: OnboardingMeta | null
}

type FieldChange = {
  field: string
  label: string
  oldValue: string
  newValue: string
}

type Props = {
  document: InternalDocument
  canEdit: boolean
}

function docTypeLabel(type: EmploymentDocumentType) {
  switch (type) {
    case "AFFIDAVIT":
      return "Čestné prohlášení"
    case "PERSONAL_QUESTIONNAIRE":
      return "Osobní dotazník"
    case "PAYROLL_INFO":
      return "Dotazník pro vedení mzdové agendy"
    default:
      return type
  }
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function wasEditedAfterCompletion(
  completedAt?: Date | string | null,
  lastEditedAt?: Date | string | null
) {
  if (!completedAt || !lastEditedAt) return false

  const completed = new Date(completedAt).getTime()
  const edited = new Date(lastEditedAt).getTime()

  return edited - completed > 60_000
}

export function InternalDocumentShell({ document, canEdit }: Props) {
  const [doc, setDoc] = useState(document)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultModal, setResultModal] = useState<"success" | "error" | null>(
    null
  )
  const [lastChanges, setLastChanges] = useState<FieldChange[]>([])

  const alreadyFilled = doc.status !== "DRAFT"
  const [editing, setEditing] = useState(!alreadyFilled)
  const router = useRouter()

  const employeeMeta = useMemo(() => {
    if (!doc.onboarding) return undefined

    return buildEmployeeMeta(doc.onboarding)
  }, [doc.onboarding])

  const titleName = employeeMeta?.fullName?.trim()
  const departmentText = employeeMeta?.department?.trim()
  const positionText = employeeMeta?.position?.trim()
  const unitText = employeeMeta?.unitName?.trim()
  const readOnly = doc.isLocked || !canEdit || !editing
  const canRequestEdit = alreadyFilled && !editing && !doc.isLocked && canEdit
  const canCancelEdit = alreadyFilled && editing && !doc.isLocked && canEdit
  const backToDocumentsUrl = doc.onboarding
    ? `/nastupy?highlight=${doc.onboarding.id}`
    : "/nastupy"

  function goBackToDocuments() {
    router.push(backToDocumentsUrl)
  }

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
        const response = await res.json().catch(() => null)

        throw new ServerValidationError(
          response?.message ??
            "Uložení dokumentu se nezdařilo. Zkuste to prosím znovu.",
          response?.issues ?? []
        )
      }

      const json = (await res.json()) as {
        document: {
          id: number
          status: DocumentStatus
          completedAt: string | null
          type?: EmploymentDocumentType
          lastEditedBy?: string | null
          lastEditedAt?: string | null
          lastEditSummary?: string | null
        }
        changes?: FieldChange[]
      }

      setDoc((previous) => ({
        ...previous,
        data,
        status: json.document.status ?? previous.status,
        completedAt: json.document.completedAt ?? previous.completedAt,
        lastEditedBy: json.document.lastEditedBy ?? previous.lastEditedBy,
        lastEditedAt: json.document.lastEditedAt ?? previous.lastEditedAt,
        lastEditSummary:
          json.document.lastEditSummary ?? previous.lastEditSummary,
      }))

      setLastChanges(json.changes ?? [])
      setEditing(false)
      setResultModal("success")
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Uložení dokumentu se nezdařilo. Zkuste to prosím znovu."
      )
      setResultModal("error")
      throw saveError
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
      employeeMeta,
    }

    switch (doc.type) {
      case "AFFIDAVIT":
        return <AffidavitForm {...commonProps} />

      case "PAYROLL_INFO":
        return <PayrollInfoForm {...commonProps} />

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

          {lastChanges.length > 0 && (
            <div className="mt-3 space-y-1.5 rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-medium text-foreground">
                Provedené změny:
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {lastChanges.map((change) => (
                  <li key={change.field}>
                    <span className="font-medium text-foreground">
                      {change.label}:
                    </span>{" "}
                    {change.oldValue} → {change.newValue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResultModal(null)}
            >
              Zavřít
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => {
                setResultModal(null)
                goBackToDocuments()
              }}
            >
              Zavřít dokument
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
              "Dokument se nepodařilo uložit. Zkuste to prosím znovu nebo kontaktujte IT."}
          </p>

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => setResultModal(null)}
            >
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goBackToDocuments()}
        >
          Zavřít dokument
        </Button>

        {canRequestEdit && (
          <Button
            type="button"
            size="sm"
            onClick={() => setEditing(true)}
            className="gap-2 bg-[#3dbd9b] text-white hover:bg-[#35a889]"
            title="Dokument je zobrazen pouze pro čtení, pro úpravy klikněte na toto tlačítko."
          >
            <Pencil className="size-4" />
            Odemknout pro úpravy
          </Button>
        )}

        {canCancelEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Zrušit úpravu
          </Button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
        <p className="text-lg font-medium text-slate-500 dark:text-slate-400">
          Interní zobrazení – {docTypeLabel(doc.type)}
        </p>

        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-background">
          <h1 className="text-lg font-semibold text-foreground">
            {titleName || "Zaměstnanec"}
          </h1>

          {(positionText || departmentText || unitText) && (
            <p className="text-sm text-muted-foreground">
              {positionText ? <span>{positionText}</span> : null}
              {positionText && departmentText ? <span> · </span> : null}
              {departmentText ? <span>{departmentText}</span> : null}
              {(positionText || departmentText) && unitText ? (
                <span> · </span>
              ) : null}
              {unitText ? <span>{unitText}</span> : null}
            </p>
          )}
        </div>

        {(() => {
          const edited = wasEditedAfterCompletion(
            doc.completedAt,
            doc.lastEditedAt
          )

          if (!doc.completedAt && !doc.lastEditedAt) return null

          return (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              {doc.completedAt && (
                <p>
                  Vyplněno: {formatDateTime(doc.completedAt)}
                  {!edited && doc.lastEditedBy ? `, ${doc.lastEditedBy}` : ""}
                </p>
              )}
              {edited && doc.lastEditedAt && (
                <p>
                  Naposledy upraveno: {formatDateTime(doc.lastEditedAt)}
                  {doc.lastEditedBy ? `, ${doc.lastEditedBy}` : ""}
                </p>
              )}
              {edited && doc.lastEditSummary && (
                <p>Změny: {doc.lastEditSummary}</p>
              )}
              {canRequestEdit && (
                <p>
                  Dokument je zobrazen pouze pro čtení, pro úpravy klikněte na
                  tlačítko „Odemknout pro úpravy“.
                </p>
              )}
            </div>
          )
        })()}

        {doc.isLocked && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <Lock className="size-3" />
            Dokument je uzamčený. Pro úpravy ho nejprve odemkněte v seznamu
            dokumentů.
          </div>
        )}

        {!doc.isLocked && !canEdit && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <Lock className="size-3" />
            Nemáte oprávnění dokument upravovat. Dokument je zobrazen pouze pro
            čtení.
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="pb-8">{renderForm()}</div>

      <div className="flex justify-between gap-2 pt-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goBackToDocuments()}
            disabled={saving}
          >
            Zavřít dokument
          </Button>
        </div>

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
  )
}
