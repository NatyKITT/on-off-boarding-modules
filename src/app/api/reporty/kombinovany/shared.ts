import type { EmailRecord } from "@/lib/email"

export type Audience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES" | "CUSTOM_EMAIL"
export type Mode = "selected" | "all" | "unsentOnly"
export type RecordKind = "planned" | "actual"

export type IncomingOnboarding = {
  id: number
  name: string
  surname: string
  titleBefore: string | null
  titleAfter: string | null
  date: string | null
  position: string | null
  department: string | null
  personalNumber: string | null
  positionNum: string | null
  month: string
  kind: RecordKind
  wasSent: boolean
}

export type IncomingOffboarding = IncomingOnboarding

export type IncomingChange = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION" | "MATERNITY_LEAVE"
  status: string
  personalNumber: string | null
  effectiveDate: string
  month: string
  oldTitleBefore: string | null
  newTitleBefore: string | null
  oldName: string | null
  newName: string | null
  oldSurname: string | null
  newSurname: string | null
  oldTitleAfter: string | null
  newTitleAfter: string | null
  oldDepartment: string | null
  newDepartment: string | null
  oldUnitName: string | null
  newUnitName: string | null
  oldPositionName: string | null
  newPositionName: string | null
  oldPositionNum: string | null
  newPositionNum: string | null
  wasSent: boolean
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function toEmailRecord(
  r: IncomingOnboarding,
  type: "onboarding" | "offboarding"
): EmailRecord {
  return {
    id: r.id,
    type,
    name: r.name,
    surname: r.surname,
    titleBefore: r.titleBefore,
    titleAfter: r.titleAfter,
    position: r.position,
    department: r.department,
    date: r.date,
    personalNumber: r.personalNumber,
    positionNum: r.positionNum,
  }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function buildCombinedReportFilename(months: string[]): string {
  const monthsSlug =
    months.length > 0 ? [...months].sort().join("_") : "bez-mesice"
  const now = new Date()
  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
  return `kombinovany-report-${monthsSlug}-${stamp}.pdf`
}
