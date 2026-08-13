export type ReportModule = "nastup" | "odchod" | "zmena"

export type OnboardingReportStatus = "planned" | "actual" | "cancelled"
export type OffboardingReportStatus = "planned" | "actual" | "cancelled"

export type DocFlag = {
  done: boolean
  at: string | null
}

export type PeriodInfo = {
  months: number | null
  isCustom: boolean
  end: string | null
}

export type FormStatus = {
  label: string
  sent: DocFlag
  filled: DocFlag
}

export type OnboardingDocuments = {
  forms: FormStatus[]
  probationSent: DocFlag
  probationFilled: DocFlag
}

export type OffboardingDocuments = {
  inviteSent: DocFlag
  allSigned: DocFlag
}

export type OnboardingReportRow = {
  id: number
  fullName: string
  personalNumber: string | null
  positionName: string | null
  positionNum: string | null
  department: string | null
  unitName: string | null
  supervisorName: string | null
  supervisorEmail: string | null
  mentorName: string | null
  mentorEmail: string | null
  date: string | null
  startTime: string | null
  email: string | null
  probation: PeriodInfo | null
  documents: OnboardingDocuments | null
  cancelReason: string | null
  cancelledAt: string | null
  cancelledBy: string | null
}

export type OffboardingReportRow = {
  id: number
  fullName: string
  personalNumber: string | null
  positionName: string | null
  positionNum: string | null
  department: string | null
  unitName: string | null
  date: string | null
  userEmail: string | null
  userName: string | null
  notice: PeriodInfo | null
  documents: OffboardingDocuments
  cancelReason: string | null
  cancelledAt: string | null
  cancelledBy: string | null
}

export type ChangeValues = {
  fullName: string | null
  positionName: string | null
  positionNum: string | null
  department: string | null
  unitName: string | null
}

export type ChangeReportRow = {
  id: number
  fullName: string
  personalNumber: string | null
  changeTypeLabel: string
  effectiveDate: string | null
  oldValues: ChangeValues
  newValues: ChangeValues
  emailSentAt: string | null
}

export type OnboardingReportSection = {
  module: "nastup"
  status: OnboardingReportStatus
  month: string
  rows: OnboardingReportRow[]
  includeDocuments: boolean
}

export type OffboardingReportSection = {
  module: "odchod"
  status: OffboardingReportStatus
  month: string
  rows: OffboardingReportRow[]
  includeDocuments: boolean
}

export type ChangeReportSection = {
  module: "zmena"
  month: string
  rows: ChangeReportRow[]
}

export type ReportSection =
  | OnboardingReportSection
  | OffboardingReportSection
  | ChangeReportSection

export type ReportSelectionSection = {
  module: ReportModule
  status?: OnboardingReportStatus | OffboardingReportStatus
  month: string
  ids: number[]
  includeDocuments?: boolean
}

export type ReportSelectionPayload = {
  sections: ReportSelectionSection[]
  generatedByName?: string
}
