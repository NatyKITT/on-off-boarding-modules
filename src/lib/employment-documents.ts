import type { DocumentStatus, EmploymentDocumentType } from "@prisma/client"

export const ONBOARDING_TYPES: EmploymentDocumentType[] = [
  "AFFIDAVIT",
  "PERSONAL_QUESTIONNAIRE",
  "PAYROLL_INFO",
]

export type EmploymentDocumentStatusKind =
  | "NOT_SENT"
  | "SENT_PENDING"
  | "SENT_COMPLETED"
  | "SENT_EXPIRED"

export const EMPLOYMENT_DOCUMENT_STATUS_LABELS: Record<
  EmploymentDocumentStatusKind,
  string
> = {
  NOT_SENT: "Nezasláno, je potřeba zaslat",
  SENT_PENDING: "Zasláno, čeká na vyplnění",
  SENT_COMPLETED: "Zasláno a vyplněno",
  SENT_EXPIRED: "Platnost odkazu vypršela, je potřeba nový odkaz",
}

export const EMPLOYMENT_DOCUMENT_STATUS_COLOR_CLASSES: Record<
  EmploymentDocumentStatusKind,
  { icon: string; badge: string; card: string }
> = {
  NOT_SENT: {
    icon: "text-slate-400",
    badge:
      "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
    card: "border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/10",
  },
  SENT_PENDING: {
    icon: "text-orange-500",
    badge:
      "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300",
    card: "border-orange-300 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/10",
  },
  SENT_COMPLETED: {
    icon: "text-green-600",
    badge:
      "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300",
    card: "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/10",
  },
  SENT_EXPIRED: {
    icon: "text-red-600",
    badge:
      "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
    card: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/10",
  },
}

export function getEmploymentDocumentStatusKind(doc: {
  status: DocumentStatus
  sentAt?: string | Date | null
  expiresAt?: string | Date | null
}): EmploymentDocumentStatusKind {
  if (doc.status !== "DRAFT") return "SENT_COMPLETED"

  if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) {
    return "SENT_EXPIRED"
  }

  if (!doc.sentAt) return "NOT_SENT"

  return "SENT_PENDING"
}

export type EmploymentDocumentsSummary = {
  overall: EmploymentDocumentStatusKind | "NONE"
  documents: Array<{
    type: EmploymentDocumentType
    status: EmploymentDocumentStatusKind
  }>
}

const OVERALL_STATUS_PRIORITY: EmploymentDocumentStatusKind[] = [
  "SENT_EXPIRED",
  "NOT_SENT",
  "SENT_PENDING",
  "SENT_COMPLETED",
]

export function summarizeEmploymentDocumentsStatus(
  documents: Array<{
    type: EmploymentDocumentType
    status: DocumentStatus
    sentAt?: string | Date | null
    expiresAt?: string | Date | null
  }>
): EmploymentDocumentsSummary {
  const withKind = documents.map((document) => ({
    type: document.type,
    status: getEmploymentDocumentStatusKind(document),
  }))

  if (withKind.length === 0) {
    return { overall: "NONE", documents: withKind }
  }

  const overall =
    OVERALL_STATUS_PRIORITY.find((kind) =>
      withKind.some((document) => document.status === kind)
    ) ?? withKind[0].status

  return { overall, documents: withKind }
}

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
