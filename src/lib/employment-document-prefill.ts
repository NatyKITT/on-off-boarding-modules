import type { EmploymentDocumentType } from "@prisma/client"

import { prisma } from "@/lib/db"

import {
  extractSharedIdentityData,
  hasAnySharedIdentityData,
  SharedIdentityData,
} from "./employment-document-shared-fields"

const SIBLING_DOCUMENT_TYPE: Partial<
  Record<EmploymentDocumentType, EmploymentDocumentType>
> = {
  PERSONAL_QUESTIONNAIRE: "PAYROLL_INFO",
  PAYROLL_INFO: "PERSONAL_QUESTIONNAIRE",
}

export const PREFILL_SOURCE_LABEL: Partial<
  Record<EmploymentDocumentType, string>
> = {
  PERSONAL_QUESTIONNAIRE: "osobního dotazníku",
  PAYROLL_INFO: "dotazníku pro vedení mzdové agendy",
}

export type PrefillSuggestion = {
  data: SharedIdentityData
  sourceLabel: string
}

export async function getSiblingPrefillSuggestion(
  onboardingId: number,
  documentType: EmploymentDocumentType
): Promise<PrefillSuggestion | null> {
  const siblingType = SIBLING_DOCUMENT_TYPE[documentType]
  if (!siblingType) return null

  const sibling = await prisma.employmentDocument.findFirst({
    where: { onboardingId, type: siblingType },
    select: { data: true, status: true },
  })

  if (!sibling || sibling.status === "DRAFT") return null

  const shared = extractSharedIdentityData(
    (sibling.data ?? {}) as Record<string, unknown>
  )

  if (!hasAnySharedIdentityData(shared)) return null

  return { data: shared, sourceLabel: PREFILL_SOURCE_LABEL[siblingType] ?? "" }
}
