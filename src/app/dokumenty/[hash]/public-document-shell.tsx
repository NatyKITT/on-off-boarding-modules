"use client"

import { useState } from "react"
import type { EmploymentDocumentType } from "@prisma/client"

import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard"
import { EmployeeMeta } from "@/lib/employee-meta"
import type { PrefillSuggestion } from "@/lib/employment-document-prefill"

import { PublicDocumentForm } from "./public-document-form"
import { PublicDocumentThankYou } from "./public-document-status"

type Props = {
  documentId: number
  hash: string
  type: EmploymentDocumentType
  employeeMeta?: EmployeeMeta
  prefillSuggestion?: PrefillSuggestion | null
}

export function PublicDocumentShell({
  documentId,
  hash,
  type,
  employeeMeta,
  prefillSuggestion,
}: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [dirty, setDirty] = useState(false)

  useUnsavedChangesGuard(dirty && !submitted)

  if (submitted) {
    return <PublicDocumentThankYou fullPage={false} />
  }

  return (
    <PublicDocumentForm
      documentId={documentId}
      hash={hash}
      type={type}
      employeeMeta={employeeMeta}
      prefillSuggestion={prefillSuggestion}
      onSubmitted={() => setSubmitted(true)}
      onDirtyChange={setDirty}
    />
  )
}
