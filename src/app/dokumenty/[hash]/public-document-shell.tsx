"use client"

import { useState } from "react"
import type { EmploymentDocumentType } from "@prisma/client"

import { EmployeeMeta } from "@/lib/employee-meta"

import { PublicDocumentForm } from "./public-document-form"
import { PublicDocumentThankYou } from "./public-document-status"

type Props = {
  documentId: number
  hash: string
  type: EmploymentDocumentType
  employeeMeta?: EmployeeMeta
}

export function PublicDocumentShell({
  documentId,
  hash,
  type,
  employeeMeta,
}: Props) {
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return <PublicDocumentThankYou fullPage={false} />
  }

  return (
    <PublicDocumentForm
      documentId={documentId}
      hash={hash}
      type={type}
      employeeMeta={employeeMeta}
      onSubmitted={() => setSubmitted(true)}
    />
  )
}
