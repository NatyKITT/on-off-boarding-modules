"use client"

import { EmploymentDocumentType } from "@prisma/client"

import { AffidavitForm } from "@/components/forms/affidavit-form"
import { EducationForm } from "@/components/forms/education-form"
import { ExperienceForm } from "@/components/forms/experience-form"
import { PersonalQuestionnaireForm } from "@/components/forms/personal-questionnaire-form"

type PublicDocumentFormProps = {
  documentId: number
  hash: string
  type: EmploymentDocumentType
  onSubmitted?: () => void
}

export function PublicDocumentForm({
  documentId,
  hash,
  type,
  onSubmitted,
}: PublicDocumentFormProps) {
  switch (type) {
    case EmploymentDocumentType.AFFIDAVIT:
      return (
        <AffidavitForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
        />
      )

    case EmploymentDocumentType.EDUCATION:
      return (
        <EducationForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
        />
      )

    case EmploymentDocumentType.EXPERIENCE:
      return (
        <ExperienceForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
        />
      )

    case EmploymentDocumentType.PERSONAL_QUESTIONNAIRE:
      return (
        <PersonalQuestionnaireForm
          mode="public"
          documentId={documentId}
          hash={hash}
          onSubmitted={onSubmitted}
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
