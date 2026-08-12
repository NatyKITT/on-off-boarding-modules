import type { EmploymentDocumentType } from "@prisma/client"

export const ONBOARDING_TYPES: EmploymentDocumentType[] = [
  "AFFIDAVIT",
  "PERSONAL_QUESTIONNAIRE",
  "PAYROLL_INFO",
]

export function typeLabel(type: EmploymentDocumentType) {
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

const DOCUMENT_EVENT_ACTION_LABEL: Record<string, string> = {
  CREATED: "Vytvořeno",
  SENT: "Odkaz odeslán",
  PDF_SENT: "PDF odesláno e-mailem",
  FILLED: "Vyplněno zaměstnancem",
  EDITED: "Upraveno interně",
  LOCKED: "Uzamčeno",
  UNLOCKED: "Odemčeno",
  RESET: "Data vymazána",
  REGENERATED: "Odkaz obnoven",
  PDF_DOWNLOADED: "PDF staženo",
  EMAIL_FAILED: "Odeslání e-mailu selhalo",
}

export function documentEventActionLabel(action: string) {
  return DOCUMENT_EVENT_ACTION_LABEL[action] ?? action
}
