export type DocumentStatusBucket = "not_created" | "draft" | "completed"

export type DocumentSummary = {
  key: string
  kind: "onboarding_document" | "probation_evaluation" | "exit_checklist"
  documentType: string | null
  label: string
  status: DocumentStatusBucket
  statusLabel: string
  recordId: number
  documentId: number | null
}

export type PersonRow = {
  kind: "onboarding" | "offboarding"
  id: number
  fullName: string
  personalNumber: string | null
  department: string
  unitName: string
  plannedDate: string
  actualDate: string | null
  cancelledAt: string | null
  documents: DocumentSummary[]
}
