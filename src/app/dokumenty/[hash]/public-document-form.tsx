"use client"

import { EmploymentDocumentType } from "@prisma/client"

import { EmployeeMeta } from "@/lib/employee-meta"
import type { PrefillSuggestion } from "@/lib/employment-document-prefill"

import { AffidavitForm } from "@/components/forms/affidavit-form"
import { PayrollInfoForm } from "@/components/forms/payroll-info-form"
import { PersonalQuestionnaireForm } from "@/components/forms/personal-questionnaire-form"

type PublicDocumentFormProps = {
  documentId: number
  hash: string
  type: EmploymentDocumentType
  onSubmitted?: () => void
  employeeMeta?: EmployeeMeta
  prefillSuggestion?: PrefillSuggestion | null
  onDirtyChange?: (dirty: boolean) => void
}

export function PublicDocumentForm({
  documentId,
  hash,
  type,
  onSubmitted,
  employeeMeta,
  prefillSuggestion,
  onDirtyChange,
}: PublicDocumentFormProps) {
  switch (type) {
    case EmploymentDocumentType.AFFIDAVIT:
      return (
        <AffidavitForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
          employeeMeta={employeeMeta}
          onDirtyChange={onDirtyChange}
        />
      )

    case EmploymentDocumentType.PAYROLL_INFO:
      return (
        <PayrollInfoForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
          employeeMeta={employeeMeta}
          prefillSuggestion={prefillSuggestion}
          onDirtyChange={onDirtyChange}
        />
      )

    case EmploymentDocumentType.PERSONAL_QUESTIONNAIRE:
      return (
        <PersonalQuestionnaireForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
          employeeMeta={employeeMeta}
          prefillSuggestion={prefillSuggestion}
          onDirtyChange={onDirtyChange}
        />
      )

    default:
      return (
        <p className="text-sm text-red-500">
          Tento typ dokumentu zatím není podporován.
        </p>
      )
  }
}
