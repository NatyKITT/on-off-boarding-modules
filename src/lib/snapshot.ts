import type { EmployeeOffboarding, EmployeeOnboarding } from "@prisma/client"

export type OldCommon = {
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  positionNum: string | null
  positionName: string
  department: string
  unitName: string
  notes: string | null
  status: "NEW" | "IN_PROGRESS" | "COMPLETED" | null
  email: string | null
  plannedStart?: string | null
  actualStart?: string | null
  userEmail: string | null
  userName: string | null
  personalNumber: string | null
  plannedEnd?: string | null
  actualEnd?: string | null
}

const toISODate = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export function snapshotOnboarding(r: EmployeeOnboarding): OldCommon {
  return {
    titleBefore: r.titleBefore ?? null,
    name: r.name,
    surname: r.surname,
    titleAfter: r.titleAfter ?? null,
    email: r.email ?? null,
    positionNum: r.positionNum ?? null,
    positionName: r.positionName ?? "",
    department: r.department ?? "",
    unitName: r.unitName ?? "",
    plannedStart: toISODate(r.plannedStart),
    actualStart: toISODate(r.actualStart),
    userEmail: r.userEmail ?? null,
    userName: r.userName ?? null,
    personalNumber: r.personalNumber ?? null,
    notes: r.notes ?? null,
    status: r.status ?? null,
  }
}

export function snapshotOffboarding(r: EmployeeOffboarding): OldCommon {
  return {
    titleBefore: r.titleBefore ?? null,
    name: r.name,
    surname: r.surname,
    titleAfter: r.titleAfter ?? null,
    email: null,
    positionNum: r.positionNum ?? null,
    positionName: r.positionName ?? "",
    department: r.department ?? "",
    unitName: r.unitName ?? "",
    plannedEnd: toISODate(r.plannedEnd),
    actualEnd: toISODate(r.actualEnd),
    userEmail: r.userEmail ?? null,
    userName: r.userName ?? null,
    personalNumber: r.personalNumber ?? null,
    notes: r.notes ?? null,
    status: r.status ?? null,
  }
}
