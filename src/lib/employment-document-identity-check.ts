import type { EmploymentDocumentType } from "@prisma/client"

export type IdentityMismatch = {
  field: string
  label: string
  expected: string
  actual: string
}

export type OnboardingIdentity = {
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
  email?: string | null
}

export type DocumentIdentityData = {
  firstName?: unknown
  lastName?: unknown
  titleBefore?: unknown
  titleAfter?: unknown
  email?: unknown
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function detectIdentityMismatch(
  documentType: EmploymentDocumentType,
  data: DocumentIdentityData,
  onboarding: OnboardingIdentity
): IdentityMismatch[] {
  const mismatches: IdentityMismatch[] = []

  const check = (
    field: string,
    label: string,
    actual: unknown,
    expected: string | null | undefined
  ) => {
    const actualStr = asString(actual)
    if (!actualStr) return
    if (normalize(actualStr) !== normalize(expected)) {
      mismatches.push({
        field,
        label,
        expected: expected ?? "",
        actual: actualStr,
      })
    }
  }

  check("firstName", "Křestní jméno", data.firstName, onboarding.name)
  check("lastName", "Příjmení", data.lastName, onboarding.surname)
  check(
    "titleBefore",
    "Titul před jménem",
    data.titleBefore,
    onboarding.titleBefore
  )
  check("titleAfter", "Titul za jménem", data.titleAfter, onboarding.titleAfter)

  if (documentType === "PERSONAL_QUESTIONNAIRE") {
    check("email", "E-mail", data.email, onboarding.email)
  }

  return mismatches
}
